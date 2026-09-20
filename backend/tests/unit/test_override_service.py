"""Unit tests for override service business rule validation.

Tests cover all service-layer guard rails without touching the database.
Uses typed in-memory stubs for PlanRepository, WindowRepository, and OverrideRepository.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import PageMeta
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    OverrideAction,
    PlanStatus,
    PlanningHorizonType,
    Weekday,
)
from app.schemas.kpis import KpiResponse
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse
from app.schemas.windows import BlockWindowListResponse, BlockWindowResponse
from app.services.exceptions import ConflictError, NotFoundError, OverrideValidationError
from app.services.override_service import ConcreteOverrideService


def _plan(status: PlanStatus = PlanStatus.READY, assignments=None) -> BlockPlanResponse:
    return BlockPlanResponse(
        plan_id=1,
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
        status=status,
        assignments=assignments or [
            PlanAssignmentResponse(
                task_id=10, window_id=100, corridor_id="COR_A",
                department=Department.ENGINEERING, day=Weekday.MON,
                estimated_hours=3.0, criticality_score=80.0,
                defect_severity=DefectSeverity.A, status=AssignmentStatus.SCHEDULED,
            )
        ],
        kpis=KpiResponse(
            total_tasks=1, scheduled_tasks=1, unscheduled_tasks=0,
            critical_unscheduled_tasks=0, asset_availability_percent=100.0,
        ),
    )


class _PlanRepo:
    def __init__(self, plan=None):
        self._plan = plan

    def get_by_id(self, plan_id):
        if self._plan and self._plan.plan_id == plan_id:
            return self._plan
        return None


class _WindowRepo:
    def __init__(self):
        self._windows = [
            BlockWindowResponse(window_id=100, corridor_id="COR_A", day=Weekday.MON, available_hours=8.0),
            BlockWindowResponse(window_id=200, corridor_id="COR_A", day=Weekday.TUE, available_hours=8.0),
            BlockWindowResponse(window_id=300, corridor_id="COR_B", day=Weekday.WED, available_hours=8.0),
        ]

    def list_all(self, *, corridor_id=None):
        items = [w for w in self._windows if corridor_id is None or w.corridor_id == corridor_id]
        return BlockWindowListResponse(
            items=items, meta=PageMeta(limit=50, offset=0, total=len(items))
        )


class _OverrideRepo:
    def __init__(self):
        self.calls = []

    def record_override(self, *, plan_id, payload, overridden_by):
        self.calls.append({"plan_id": plan_id, "payload": payload})
        return PlannerOverrideResponse(
            override_id=1, plan_id=plan_id, task_id=payload.task_id,
            action=payload.action, target_window_id=payload.target_window_id,
            reason=payload.reason, overridden_by=overridden_by,
            overridden_at=datetime.now(timezone.utc),
        )


def _svc(plan=None, windows=True):
    return ConcreteOverrideService(
        override_repo=_OverrideRepo(),
        plan_repo=_PlanRepo(plan),
        window_repo=_WindowRepo() if windows else None,
    )


def _payload(action=OverrideAction.UNSCHEDULE, target_window_id=None, task_id=10, plan_id=1):
    return PlannerOverrideCreate(
        plan_id=plan_id, task_id=task_id, action=action,
        target_window_id=target_window_id,
        reason="Override reason for audit trail that is long enough.",
    )


class TestOverrideServiceValidation:
    def test_unschedule_valid(self) -> None:
        resp = _svc(_plan()).apply_override(1, _payload())
        assert resp.action is OverrideAction.UNSCHEDULE

    def test_reassign_to_same_corridor_valid(self) -> None:
        resp = _svc(_plan()).apply_override(
            1, _payload(action=OverrideAction.REASSIGN, target_window_id=200)
        )
        assert resp.target_window_id == 200

    def test_force_schedule_skips_capacity_check(self) -> None:
        # Window 200 has 8h, task needs 3h — force_schedule should pass even
        # if there are already many hours in the window
        big_plan = _plan(assignments=[
            PlanAssignmentResponse(
                task_id=10, window_id=100, corridor_id="COR_A",
                department=Department.ENGINEERING, day=Weekday.MON,
                estimated_hours=3.0, criticality_score=80.0,
                defect_severity=DefectSeverity.A, status=AssignmentStatus.SCHEDULED,
            ),
            # Pre-fill window 200 beyond capacity
            PlanAssignmentResponse(
                task_id=11, window_id=200, corridor_id="COR_A",
                department=Department.ENGINEERING, day=Weekday.TUE,
                estimated_hours=7.9, criticality_score=75.0,
                defect_severity=DefectSeverity.B, status=AssignmentStatus.SCHEDULED,
            ),
        ])
        resp = _svc(big_plan).apply_override(
            1, _payload(action=OverrideAction.FORCE_SCHEDULE, target_window_id=200)
        )
        assert resp.action is OverrideAction.FORCE_SCHEDULE

    def test_plan_id_mismatch_raises_conflict(self) -> None:
        with pytest.raises(ConflictError, match="plan_id in the path"):
            _svc(_plan()).apply_override(99, _payload(plan_id=1))

    def test_plan_not_found_raises_not_found(self) -> None:
        with pytest.raises(NotFoundError, match="Block plan 1 not found"):
            _svc(None).apply_override(1, _payload())

    def test_pending_plan_raises_validation_error(self) -> None:
        with pytest.raises(OverrideValidationError, match="status 'pending'"):
            _svc(_plan(status=PlanStatus.PENDING)).apply_override(1, _payload())

    def test_failed_plan_raises_validation_error(self) -> None:
        with pytest.raises(OverrideValidationError, match="status 'failed'"):
            _svc(_plan(status=PlanStatus.FAILED)).apply_override(1, _payload())

    def test_task_not_in_plan_raises_not_found(self) -> None:
        with pytest.raises(NotFoundError, match="Task 999 was not found"):
            _svc(_plan()).apply_override(1, _payload(task_id=999))

    def test_target_window_not_found_raises_not_found(self) -> None:
        with pytest.raises(NotFoundError, match="Target block window 9999 not found"):
            _svc(_plan()).apply_override(
                1, _payload(action=OverrideAction.REASSIGN, target_window_id=9999)
            )

    def test_cross_corridor_reassign_raises_validation_error(self) -> None:
        # window 300 is on COR_B, task is on COR_A
        with pytest.raises(OverrideValidationError, match="Corridor mismatch"):
            _svc(_plan()).apply_override(
                1, _payload(action=OverrideAction.REASSIGN, target_window_id=300)
            )

    def test_window_overflow_on_reassign_raises_validation_error(self) -> None:
        # Small window: 2h available; task needs 3h; other task already has 1h in window 200
        small_window_repo = _WindowRepo()
        # Replace window 200 with 2h capacity
        small_window_repo._windows = [
            BlockWindowResponse(window_id=100, corridor_id="COR_A", day=Weekday.MON, available_hours=8.0),
            BlockWindowResponse(window_id=200, corridor_id="COR_A", day=Weekday.TUE, available_hours=2.0),
        ]
        # Add a pre-existing assignment to window 200 consuming 1.5h
        plan_with_full_window = _plan(assignments=[
            PlanAssignmentResponse(
                task_id=10, window_id=100, corridor_id="COR_A",
                department=Department.ENGINEERING, day=Weekday.MON,
                estimated_hours=3.0, criticality_score=80.0,
                defect_severity=DefectSeverity.A, status=AssignmentStatus.SCHEDULED,
            ),
            PlanAssignmentResponse(
                task_id=11, window_id=200, corridor_id="COR_A",
                department=Department.ENGINEERING, day=Weekday.TUE,
                estimated_hours=1.5, criticality_score=70.0,
                defect_severity=DefectSeverity.B, status=AssignmentStatus.SCHEDULED,
            ),
        ])
        svc = ConcreteOverrideService(
            override_repo=_OverrideRepo(),
            plan_repo=_PlanRepo(plan_with_full_window),
            window_repo=small_window_repo,
        )
        # Task 10 is 3h, window 200 has 2h - 1.5h already used = 0.5h left -> overflow
        with pytest.raises(OverrideValidationError, match="Window capacity exceeded"):
            svc.apply_override(
                1, _payload(action=OverrideAction.REASSIGN, target_window_id=200)
            )

    def test_override_without_window_repo_skips_corridor_check(self) -> None:
        # When window_repo is None, corridor/capacity checks are skipped
        resp = _svc(_plan(), windows=False).apply_override(
            1, _payload(action=OverrideAction.REASSIGN, target_window_id=200)
        )
        assert resp.action is OverrideAction.REASSIGN

    def test_audit_record_is_committed(self) -> None:
        override_repo = _OverrideRepo()
        svc = ConcreteOverrideService(
            override_repo=override_repo,
            plan_repo=_PlanRepo(_plan()),
        )
        svc.apply_override(1, _payload(), overridden_by="eng_001@ir.gov")
        assert len(override_repo.calls) == 1
        assert override_repo.calls[0]["plan_id"] == 1
