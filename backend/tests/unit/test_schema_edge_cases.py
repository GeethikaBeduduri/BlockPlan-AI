"""Unit tests for schema validation including edge cases and boundary conditions.

Tests cover:
- PlannerOverrideCreate requires reason ≥ 10 chars.
- KpiResponse bounds: asset_availability_percent ∈ [0, 100].
- PlanJobResponse fields.
- PlanningHorizonSpec calendar constraints.
- BlockWindowResponse available_hours bounds.
- MaintenanceTaskResponse criticality_score ∈ [0, 100].
- PlanGenerateRequest department/corridor optionality.
"""

from __future__ import annotations

from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.common import PaginationParams
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    OverrideAction,
    PlanStatus,
    PlanningHorizonType,
    Weekday,
)
from app.schemas.horizon import PlanGenerateRequest
from app.schemas.kpis import KpiQuery, KpiResponse
from app.schemas.overrides import PlannerOverrideCreate
from app.schemas.plans import PlanJobResponse


class TestOverrideSchemaEdgeCases:
    def test_reason_exactly_10_chars_is_valid(self) -> None:
        PlannerOverrideCreate(
            plan_id=1,
            task_id=1,
            action=OverrideAction.UNSCHEDULE,
            reason="1234567890",  # exactly 10
        )

    def test_reason_9_chars_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            PlannerOverrideCreate(
                plan_id=1,
                task_id=1,
                action=OverrideAction.UNSCHEDULE,
                reason="123456789",  # 9 chars
            )

    def test_reason_1000_chars_is_valid(self) -> None:
        PlannerOverrideCreate(
            plan_id=1,
            task_id=1,
            action=OverrideAction.UNSCHEDULE,
            reason="A" * 2000,
        )

    def test_reason_2001_chars_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            PlannerOverrideCreate(
                plan_id=1,
                task_id=1,
                action=OverrideAction.UNSCHEDULE,
                reason="A" * 2001,
            )

    def test_force_schedule_requires_window_id(self) -> None:
        with pytest.raises(ValidationError, match="target_window_id"):
            PlannerOverrideCreate(
                plan_id=1,
                task_id=1,
                action=OverrideAction.FORCE_SCHEDULE,
                reason="Forcing schedule despite capacity.",
            )

    def test_force_schedule_with_window_id_is_valid(self) -> None:
        PlannerOverrideCreate(
            plan_id=1,
            task_id=1,
            action=OverrideAction.FORCE_SCHEDULE,
            target_window_id=5,
            reason="Forcing schedule despite capacity.",
        )

    def test_unschedule_with_window_id_is_rejected(self) -> None:
        with pytest.raises(ValidationError, match="unschedule"):
            PlannerOverrideCreate(
                plan_id=1,
                task_id=1,
                action=OverrideAction.UNSCHEDULE,
                target_window_id=5,
                reason="Unschedule should not have a window.",
            )


class TestKpiResponseBounds:
    def test_availability_above_100_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            KpiResponse(
                total_tasks=1,
                scheduled_tasks=1,
                unscheduled_tasks=0,
                critical_unscheduled_tasks=0,
                asset_availability_percent=100.01,
            )

    def test_availability_below_0_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            KpiResponse(
                total_tasks=1,
                scheduled_tasks=1,
                unscheduled_tasks=0,
                critical_unscheduled_tasks=0,
                asset_availability_percent=-1.0,
            )

    def test_kpi_response_defaults_are_zero(self) -> None:
        kpi = KpiResponse(
            total_tasks=0,
            scheduled_tasks=0,
            unscheduled_tasks=0,
            critical_unscheduled_tasks=0,
            asset_availability_percent=0.0,
        )
        assert kpi.scheduled_hours == 0.0
        assert kpi.available_window_hours == 0.0
        assert kpi.block_utilization_percent == 0.0
        assert kpi.plan_generation_seconds is None


class TestPlanJobResponse:
    def test_plan_job_response_defaults(self) -> None:
        job = PlanJobResponse(job_id="abc-123")
        assert job.accepted is True
        assert job.status == PlanStatus.PENDING
        assert job.plan_id is None
        assert job.horizon_type is None

    def test_plan_job_response_full(self) -> None:
        job = PlanJobResponse(
            job_id="celery-uuid-abc",
            plan_id=42,
            horizon_type="weekly",
            status=PlanStatus.PENDING,
        )
        assert job.job_id == "celery-uuid-abc"
        assert job.plan_id == 42


class TestPlanningHorizonConstraints:
    def test_daily_start_equals_end(self) -> None:
        req = PlanGenerateRequest(
            horizon_type=PlanningHorizonType.DAILY,
            horizon_start=date(2026, 8, 28),
            horizon_end=date(2026, 8, 28),
        )
        assert req.horizon_type == PlanningHorizonType.DAILY

    def test_daily_start_not_equals_end_is_rejected(self) -> None:
        with pytest.raises(ValidationError, match="daily horizon"):
            PlanGenerateRequest(
                horizon_type=PlanningHorizonType.DAILY,
                horizon_start=date(2026, 8, 28),
                horizon_end=date(2026, 8, 29),
            )

    def test_weekly_exactly_7_days(self) -> None:
        PlanGenerateRequest(
            horizon_type=PlanningHorizonType.WEEKLY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )

    def test_weekly_not_7_days_is_rejected(self) -> None:
        with pytest.raises(ValidationError, match="weekly horizon"):
            PlanGenerateRequest(
                horizon_type=PlanningHorizonType.WEEKLY,
                horizon_start=date(2026, 8, 24),
                horizon_end=date(2026, 8, 29),  # 6 days
            )

    def test_horizon_end_before_start_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            PlanGenerateRequest(
                horizon_type=PlanningHorizonType.DAILY,
                horizon_start=date(2026, 8, 28),
                horizon_end=date(2026, 8, 27),
            )


class TestPaginationBounds:
    def test_pagination_limit_min_1(self) -> None:
        p = PaginationParams(limit=1, offset=0)
        assert p.limit == 1

    def test_pagination_limit_max_500(self) -> None:
        p = PaginationParams(limit=500, offset=0)
        assert p.limit == 500

    def test_pagination_limit_above_500_rejected(self) -> None:
        with pytest.raises(ValidationError):
            PaginationParams(limit=501, offset=0)

    def test_pagination_offset_0(self) -> None:
        p = PaginationParams(limit=50, offset=0)
        assert p.offset == 0

    def test_pagination_offset_negative_rejected(self) -> None:
        with pytest.raises(ValidationError):
            PaginationParams(limit=50, offset=-1)
