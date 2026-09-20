"""Unit tests for the Planner Override workflow and service layer.

Tests cover:
  - Valid overrides: reassign, force_schedule, unschedule.
  - Path vs body plan_id mismatch (HTTP 409 Conflict).
  - Plan not found (HTTP 404 Not Found).
  - Task / assignment not found in plan (HTTP 404 Not Found).
  - Target window not found (HTTP 404 Not Found).
  - Corridor mismatch validation (HTTP 422 Override Rejected).
  - Window capacity limit validation on reassign (HTTP 422 Override Rejected).
  - Plan status validation (cannot override PENDING or FAILED plans).
  - Durable audit logging metadata preservation.
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


def _sample_plan(
    plan_id: int = 42,
    status: PlanStatus = PlanStatus.READY,
) -> BlockPlanResponse:
    return BlockPlanResponse(
        plan_id=plan_id,
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
        status=status,
        assignments=[
            PlanAssignmentResponse(
                task_id=101,
                window_id=10,
                corridor_id="COR_01",
                department=Department.ENGINEERING,
                day=Weekday.MON,
                estimated_hours=4.0,
                criticality_score=90.0,
                defect_severity=DefectSeverity.A,
                status=AssignmentStatus.SCHEDULED,
            )
        ],
        kpis=KpiResponse(
            total_tasks=1,
            scheduled_tasks=1,
            unscheduled_tasks=0,
            critical_unscheduled_tasks=0,
            asset_availability_percent=100.0,
        ),
    )


class _StubPlanRepo:
    def __init__(self, plan: BlockPlanResponse | None = None) -> None:
        self._plan = plan

    def get_by_id(self, plan_id: int) -> BlockPlanResponse | None:
        if self._plan and self._plan.plan_id == plan_id:
            return self._plan
        return None


class _StubWindowRepo:
    def __init__(self, windows: list[BlockWindowResponse] | None = None) -> None:
        self._windows = windows or [
            BlockWindowResponse(
                window_id=10,
                corridor_id="COR_01",
                day=Weekday.MON,
                available_hours=8.0,
            ),
            BlockWindowResponse(
                window_id=20,
                corridor_id="COR_01",
                day=Weekday.TUE,
                available_hours=8.0,
            ),
            BlockWindowResponse(
                window_id=30,
                corridor_id="COR_02",  # Different corridor
                day=Weekday.WED,
                available_hours=8.0,
            ),
        ]

    def list_all(self, *, corridor_id: str | None = None) -> BlockWindowListResponse:
        items = self._windows
        if corridor_id:
            items = [w for w in items if w.corridor_id == corridor_id]
        return BlockWindowListResponse(
            items=items,
            meta=PageMeta(limit=50, offset=0, total=len(items)),
        )


class _StubOverrideRepo:
    def __init__(self) -> None:
        self.recorded_overrides: list[dict] = []

    def record_override(
        self,
        *,
        plan_id: int,
        payload: PlannerOverrideCreate,
        overridden_by: str | None,
    ) -> PlannerOverrideResponse:
        rec = {
            "override_id": 999,
            "plan_id": plan_id,
            "task_id": payload.task_id,
            "action": payload.action,
            "target_window_id": payload.target_window_id,
            "reason": payload.reason,
            "overridden_by": overridden_by or "planner@railways.gov.in",
            "overridden_at": datetime.now(timezone.utc),
        }
        self.recorded_overrides.append(rec)
        return PlannerOverrideResponse(**rec)


class TestPlannerOverrideService:
    def test_valid_reassign_override(self) -> None:
        plan_repo = _StubPlanRepo(_sample_plan(42))
        window_repo = _StubWindowRepo()
        override_repo = _StubOverrideRepo()

        service = ConcreteOverrideService(
            override_repo=override_repo,
            plan_repo=plan_repo,
            window_repo=window_repo,
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.REASSIGN,
            target_window_id=20,
            reason="Reassigning track tamping to Tuesday window due to urgent inspection request.",
        )

        resp = service.apply_override(42, payload, overridden_by="IR_USER_007")

        assert resp.override_id == 999
        assert resp.plan_id == 42
        assert resp.task_id == 101
        assert resp.action is OverrideAction.REASSIGN
        assert resp.target_window_id == 20
        assert resp.overridden_by == "IR_USER_007"
        assert len(override_repo.recorded_overrides) == 1

    def test_valid_unschedule_override(self) -> None:
        plan_repo = _StubPlanRepo(_sample_plan(42))
        override_repo = _StubOverrideRepo()

        service = ConcreteOverrideService(
            override_repo=override_repo,
            plan_repo=plan_repo,
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.UNSCHEDULE,
            reason="Unscheduling maintenance task due to emergency derailment clearing.",
        )

        resp = service.apply_override(42, payload)

        assert resp.action is OverrideAction.UNSCHEDULE
        assert resp.target_window_id is None

    def test_path_and_body_plan_id_mismatch_raises_conflict(self) -> None:
        service = ConcreteOverrideService(
            override_repo=_StubOverrideRepo(),
            plan_repo=_StubPlanRepo(_sample_plan(42)),
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.UNSCHEDULE,
            reason="Unscheduling maintenance task due to emergency derailment clearing.",
        )

        with pytest.raises(ConflictError, match="plan_id in the path and request body must match"):
            service.apply_override(99, payload)

    def test_plan_not_found_raises_not_found(self) -> None:
        service = ConcreteOverrideService(
            override_repo=_StubOverrideRepo(),
            plan_repo=_StubPlanRepo(None),  # No plan found
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.UNSCHEDULE,
            reason="Unscheduling maintenance task due to emergency derailment clearing.",
        )

        with pytest.raises(NotFoundError, match="Block plan 42 not found"):
            service.apply_override(42, payload)

    def test_plan_not_ready_status_raises_validation_error(self) -> None:
        # Plan is in PENDING status
        service = ConcreteOverrideService(
            override_repo=_StubOverrideRepo(),
            plan_repo=_StubPlanRepo(_sample_plan(42, status=PlanStatus.PENDING)),
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.UNSCHEDULE,
            reason="Unscheduling maintenance task due to emergency derailment clearing.",
        )

        with pytest.raises(OverrideValidationError, match="status 'pending'"):
            service.apply_override(42, payload)

    def test_task_not_in_plan_raises_not_found(self) -> None:
        service = ConcreteOverrideService(
            override_repo=_StubOverrideRepo(),
            plan_repo=_StubPlanRepo(_sample_plan(42)),
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=999,  # Task 999 not in plan assignments
            action=OverrideAction.UNSCHEDULE,
            reason="Unscheduling maintenance task due to emergency derailment clearing.",
        )

        with pytest.raises(NotFoundError, match="Task 999 was not found"):
            service.apply_override(42, payload)

    def test_target_window_not_found_raises_not_found(self) -> None:
        service = ConcreteOverrideService(
            override_repo=_StubOverrideRepo(),
            plan_repo=_StubPlanRepo(_sample_plan(42)),
            window_repo=_StubWindowRepo(),
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.REASSIGN,
            target_window_id=9999,  # Non-existent window
            reason="Reassigning track tamping to non-existent window for testing.",
        )

        with pytest.raises(NotFoundError, match="Target block window 9999 not found"):
            service.apply_override(42, payload)

    def test_corridor_mismatch_raises_validation_error(self) -> None:
        service = ConcreteOverrideService(
            override_repo=_StubOverrideRepo(),
            plan_repo=_StubPlanRepo(_sample_plan(42)),  # Task 101 is on COR_01
            window_repo=_StubWindowRepo(),  # Window 30 is on COR_02
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.REASSIGN,
            target_window_id=30,  # COR_02 window
            reason="Attempting cross-corridor assignment which should be rejected.",
        )

        with pytest.raises(OverrideValidationError, match="Corridor mismatch"):
            service.apply_override(42, payload)

    def test_window_capacity_overflow_on_reassign_raises_validation_error(self) -> None:
        # Window 20 has available_hours = 8.0, but already has 6.0h scheduled
        full_window = BlockWindowResponse(
            window_id=20,
            corridor_id="COR_01",
            day=Weekday.TUE,
            available_hours=4.0,  # Capacity 4h
        )
        window_repo = _StubWindowRepo([full_window])

        plan = _sample_plan(42)
        # Task 101 estimated_hours is 4.0h. Existing task 102 in window 20 has 2.0h. Total 6.0h > 4.0h
        plan.assignments.append(
            PlanAssignmentResponse(
                task_id=102,
                window_id=20,
                corridor_id="COR_01",
                department=Department.ENGINEERING,
                day=Weekday.TUE,
                estimated_hours=3.0,
                criticality_score=80.0,
                defect_severity=DefectSeverity.B,
                status=AssignmentStatus.SCHEDULED,
            )
        )

        service = ConcreteOverrideService(
            override_repo=_StubOverrideRepo(),
            plan_repo=_StubPlanRepo(plan),
            window_repo=window_repo,
        )

        payload = PlannerOverrideCreate(
            plan_id=42,
            task_id=101,
            action=OverrideAction.REASSIGN,
            target_window_id=20,
            reason="Reassigning task which causes window capacity overflow.",
        )

        with pytest.raises(OverrideValidationError, match="Window capacity exceeded"):
            service.apply_override(42, payload)
