"""Validation tests for Person 1 API schema contracts. No routers involved."""

from datetime import date, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import ErrorResponse, PaginationParams
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    ErrorCode,
    OverrideAction,
    PlanningHorizonType,
    PlanStatus,
    TaskStatus,
    Weekday,
)
from app.schemas.horizon import PlanGenerateRequest, PlanningHorizonSpec
from app.schemas.internal import OptimizerInput, OptimizerWindow, ScoredTask
from app.schemas.kpis import KpiResponse
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse
from app.schemas.tasks import MaintenanceTaskCreate, MaintenanceTaskResponse
from app.schemas.windows import BlockWindowCreate


def _task_payload(**overrides: object) -> dict[str, object]:
    data: dict[str, object] = {
        "department": "Engineering",
        "corridor_id": "COR_01",
        "defect_severity": "A",
        "days_overdue": 3,
        "estimated_hours": 4.0,
        "asset_age_years": 12,
    }
    data.update(overrides)
    return data


def test_maintenance_task_create_accepts_prototype_fields() -> None:
    task = MaintenanceTaskCreate.model_validate(_task_payload())
    assert task.department is Department.ENGINEERING
    assert task.corridor_id == "COR_01"
    assert task.defect_severity is DefectSeverity.A


def test_maintenance_task_create_rejects_criticality_from_client() -> None:
    with pytest.raises(ValidationError):
        MaintenanceTaskCreate.model_validate(
            _task_payload(criticality_score=90)
        )


def test_maintenance_task_response_score_bounds() -> None:
    MaintenanceTaskResponse.model_validate(
        {**_task_payload(), "task_id": 1, "criticality_score": 0}
    )
    MaintenanceTaskResponse.model_validate(
        {**_task_payload(), "task_id": 1, "criticality_score": 100}
    )
    with pytest.raises(ValidationError):
        MaintenanceTaskResponse.model_validate(
            {**_task_payload(), "task_id": 1, "criticality_score": 100.1}
        )
    with pytest.raises(ValidationError):
        MaintenanceTaskResponse.model_validate(
            {**_task_payload(), "task_id": 0, "status": TaskStatus.OPEN}
        )


def test_block_window_create_matches_csv_shape() -> None:
    window = BlockWindowCreate.model_validate(
        {"corridor_id": "COR_04", "day": "Sun", "available_hours": 8}
    )
    assert window.day is Weekday.SUN


def test_block_window_rejects_mismatched_weekday() -> None:
    monday = datetime(2026, 8, 24, 10, 0, 0)  # Monday
    with pytest.raises(ValidationError):
        BlockWindowCreate.model_validate(
            {
                "corridor_id": "COR_01",
                "day": "Tue",
                "available_hours": 2,
                "starts_at": monday,
                "ends_at": monday + timedelta(hours=2),
            }
        )


def test_block_window_rejects_hours_beyond_elapsed_time() -> None:
    start = datetime(2026, 8, 24, 10, 0, 0)
    with pytest.raises(ValidationError):
        BlockWindowCreate.model_validate(
            {
                "corridor_id": "COR_01",
                "day": "Mon",
                "available_hours": 5,
                "starts_at": start,
                "ends_at": start + timedelta(hours=2),
            }
        )


def test_daily_horizon_requires_single_day() -> None:
    PlanningHorizonSpec(
        horizon_type=PlanningHorizonType.DAILY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 24),
    )
    with pytest.raises(ValidationError):
        PlanningHorizonSpec(
            horizon_type=PlanningHorizonType.DAILY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 25),
        )


def test_weekly_horizon_requires_seven_inclusive_days() -> None:
    spec = PlanningHorizonSpec(
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
    )
    assert spec.horizon_end == date(2026, 8, 30)
    with pytest.raises(ValidationError):
        PlanningHorizonSpec(
            horizon_type=PlanningHorizonType.WEEKLY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 31),
        )


def test_monthly_horizon_accepts_calendar_month_span() -> None:
    PlanningHorizonSpec(
        horizon_type=PlanningHorizonType.MONTHLY,
        horizon_start=date(2026, 8, 1),
        horizon_end=date(2026, 8, 31),
    )
    with pytest.raises(ValidationError):
        PlanningHorizonSpec(
            horizon_type=PlanningHorizonType.MONTHLY,
            horizon_start=date(2026, 8, 1),
            horizon_end=date(2026, 8, 15),
        )


def test_plan_generate_request_optional_filters() -> None:
    req = PlanGenerateRequest(
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
        corridor_id="COR_02",
    )
    assert req.department is None


def test_assignment_unscheduled_forbids_window() -> None:
    PlanAssignmentResponse.model_validate(
        {
            "task_id": 18,
            "window_id": None,
            "corridor_id": "COR_02",
            "department": "Traction",
            "day": None,
            "estimated_hours": 7,
            "criticality_score": 100,
            "defect_severity": "A",
            "status": "unscheduled",
        }
    )
    with pytest.raises(ValidationError):
        PlanAssignmentResponse.model_validate(
            {
                "task_id": 18,
                "window_id": 28,
                "corridor_id": "COR_02",
                "department": "Traction",
                "day": "Fri",
                "estimated_hours": 7,
                "criticality_score": 100,
                "defect_severity": "A",
                "status": "unscheduled",
            }
        )


def test_assignment_scheduled_requires_window_and_day() -> None:
    PlanAssignmentResponse.model_validate(
        {
            "task_id": 18,
            "window_id": 28,
            "corridor_id": "COR_02",
            "department": "Traction",
            "day": "Fri",
            "estimated_hours": 7,
            "criticality_score": 100,
            "defect_severity": "A",
            "status": "scheduled",
        }
    )
    with pytest.raises(ValidationError):
        PlanAssignmentResponse.model_validate(
            {
                "task_id": 18,
                "corridor_id": "COR_02",
                "department": "Traction",
                "estimated_hours": 7,
                "criticality_score": 100,
                "defect_severity": "A",
                "status": "scheduled",
            }
        )


def test_kpi_matches_prototype_formula_bounds() -> None:
    kpi = KpiResponse(
        plan_id=1,
        total_tasks=100,
        scheduled_tasks=80,
        unscheduled_tasks=20,
        critical_unscheduled_tasks=5,
        asset_availability_percent=80.0,
        scheduled_hours=240,
        available_window_hours=300,
    )
    assert kpi.asset_availability_percent == 80.0
    with pytest.raises(ValidationError):
        KpiResponse(
            total_tasks=1,
            scheduled_tasks=1,
            unscheduled_tasks=0,
            critical_unscheduled_tasks=0,
            asset_availability_percent=101,
        )


def test_override_requires_logged_reason() -> None:
    with pytest.raises(ValidationError):
        PlannerOverrideCreate(
            plan_id=1,
            task_id=18,
            action=OverrideAction.UNSCHEDULE,
            reason="short",
        )
    created = PlannerOverrideCreate(
        plan_id=1,
        task_id=18,
        action=OverrideAction.UNSCHEDULE,
        reason="Track possession conflict with coaching stock movement.",
    )
    assert created.target_window_id is None


def test_override_reassign_requires_target_window() -> None:
    with pytest.raises(ValidationError):
        PlannerOverrideCreate(
            plan_id=1,
            task_id=18,
            action=OverrideAction.REASSIGN,
            reason="Move work to a later possession window.",
        )
    PlannerOverrideCreate(
        plan_id=1,
        task_id=18,
        action=OverrideAction.FORCE_SCHEDULE,
        target_window_id=3,
        reason="Safety-critical defect must occupy Tuesday COR_03 window.",
    )


def test_block_plan_nests_assignments_and_kpis() -> None:
    plan = BlockPlanResponse(
        plan_id=1,
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
        status=PlanStatus.READY,
        assignments=[
            PlanAssignmentResponse(
                task_id=47,
                window_id=3,
                corridor_id="COR_03",
                department=Department.TRACTION,
                day=Weekday.TUE,
                estimated_hours=3,
                criticality_score=98.1,
                defect_severity=DefectSeverity.A,
                status=AssignmentStatus.SCHEDULED,
            )
        ],
        kpis=KpiResponse(
            plan_id=1,
            total_tasks=1,
            scheduled_tasks=1,
            unscheduled_tasks=0,
            critical_unscheduled_tasks=0,
            asset_availability_percent=100,
        ),
    )
    assert plan.assignments[0].window_id == 3


def test_error_envelope_uses_explicit_codes() -> None:
    err = ErrorResponse(
        error=ErrorCode.OVERRIDE_REJECTED,
        message="Window has insufficient remaining hours.",
    )
    assert err.details is None


def test_pagination_bounds() -> None:
    PaginationParams(limit=1, offset=0)
    with pytest.raises(ValidationError):
        PaginationParams(limit=0)


def test_internal_optimizer_input_from_scored_tasks() -> None:
    payload = OptimizerInput(
        tasks=[
            ScoredTask(
                task_id=18,
                department=Department.TRACTION,
                corridor_id="COR_02",
                defect_severity=DefectSeverity.A,
                days_overdue=27,
                estimated_hours=7,
                asset_age_years=12,
                criticality_score=100,
            )
        ],
        windows=[
            OptimizerWindow(
                window_id=28,
                corridor_id="COR_02",
                day=Weekday.FRI,
                available_hours=8,
            )
        ],
    )
    assert payload.tasks[0].criticality_score == 100


def test_override_response_keeps_reason() -> None:
    row = PlannerOverrideResponse(
        override_id=9,
        plan_id=1,
        task_id=18,
        action=OverrideAction.UNSCHEDULE,
        reason="Logged possession conflict with express path.",
        overridden_by="planner.1",
    )
    assert "possession" in row.reason
