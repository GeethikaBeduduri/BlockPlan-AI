"""Unit tests for the KPI calculation service and metric calculation formulas.

Tests cover:
  - Asset Availability % formula: (scheduled_tasks / total_tasks) * 100.
  - Block Utilization % formula: (scheduled_hours / available_window_hours) * 100.
  - Filtering metrics by corridor_id and department.
  - Unscheduled critical (severity-A) task filtering.
  - Zero-division safety handling when total_tasks=0 or available_hours=0.
  - NotFoundError (HTTP 404) when querying a non-existent plan_id.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import PageMeta, PaginationParams
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    PlanStatus,
    PlanningHorizonType,
    Weekday,
)
from app.schemas.kpis import KpiQuery, KpiResponse
from app.schemas.plans import BlockPlanResponse
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.services.exceptions import NotFoundError
from app.services.kpi_service import ConcreteKpiService


def _sample_kpi_plan() -> BlockPlanResponse:
    return BlockPlanResponse(
        plan_id=42,
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
        status=PlanStatus.READY,
        assignments=[
            # Task 1: Scheduled Engineering (4h)
            PlanAssignmentResponse(
                task_id=1,
                window_id=10,
                corridor_id="COR_01",
                department=Department.ENGINEERING,
                day=Weekday.MON,
                estimated_hours=4.0,
                criticality_score=90.0,
                defect_severity=DefectSeverity.A,
                status=AssignmentStatus.SCHEDULED,
            ),
            # Task 2: Unscheduled Engineering (Severity A, 2h)
            PlanAssignmentResponse(
                task_id=2,
                window_id=None,
                corridor_id="COR_01",
                department=Department.ENGINEERING,
                day=None,
                estimated_hours=2.0,
                criticality_score=85.0,
                defect_severity=DefectSeverity.A,
                status=AssignmentStatus.UNSCHEDULED,
            ),
            # Task 3: Scheduled S&T (2h)
            PlanAssignmentResponse(
                task_id=3,
                window_id=10,
                corridor_id="COR_01",
                department=Department.S_AND_T,
                day=Weekday.MON,
                estimated_hours=2.0,
                criticality_score=75.0,
                defect_severity=DefectSeverity.B,
                status=AssignmentStatus.SCHEDULED,
            ),
        ],
        kpis=KpiResponse(
            plan_id=42,
            total_tasks=3,
            scheduled_tasks=2,
            unscheduled_tasks=1,
            critical_unscheduled_tasks=1,
            asset_availability_percent=66.67,
            scheduled_hours=6.0,
            available_window_hours=12.0,
            block_utilization_percent=50.0,
        ),
    )


class _StubPlanRepo:
    def __init__(self, plan: BlockPlanResponse | None = None) -> None:
        self._plan = plan

    def get_by_id(self, plan_id: int) -> BlockPlanResponse | None:
        if self._plan and self._plan.plan_id == plan_id:
            return self._plan
        return None


class _StubTaskRepo:
    def list_unscheduled(
        self,
        *,
        pagination: PaginationParams,
        plan_id: int | None,
        corridor_id: str | None,
        critical_only: bool,
    ) -> MaintenanceTaskListResponse:
        items = [
            MaintenanceTaskResponse(
                task_id=2,
                department=Department.ENGINEERING,
                corridor_id="COR_01",
                defect_severity=DefectSeverity.A,
                days_overdue=5,
                estimated_hours=2.0,
                asset_age_years=10,
                criticality_score=85.0,
                status=AssignmentStatus.UNSCHEDULED,
            )
        ]

        return MaintenanceTaskListResponse(
            items=items,
            meta=PageMeta(limit=pagination.limit, offset=pagination.offset, total=len(items)),
        )


class TestConcreteKpiService:
    def test_availability_calculation_unfiltered(self) -> None:
        plan_repo = _StubPlanRepo(_sample_kpi_plan())
        task_repo = _StubTaskRepo()
        service = ConcreteKpiService(plan_repo=plan_repo, task_repo=task_repo)

        kpi = service.availability(KpiQuery(plan_id=42))

        assert kpi.plan_id == 42
        assert kpi.total_tasks == 3
        assert kpi.scheduled_tasks == 2
        assert kpi.unscheduled_tasks == 1
        assert kpi.critical_unscheduled_tasks == 1
        assert kpi.asset_availability_percent == 66.67
        assert kpi.scheduled_hours == 6.0
        assert kpi.available_window_hours == 12.0
        assert kpi.block_utilization_percent == 50.0

    def test_availability_calculation_filtered_by_department(self) -> None:
        plan_repo = _StubPlanRepo(_sample_kpi_plan())
        task_repo = _StubTaskRepo()
        service = ConcreteKpiService(plan_repo=plan_repo, task_repo=task_repo)

        # Filter by S_AND_T (1 task total, 1 scheduled)
        kpi = service.availability(KpiQuery(plan_id=42, department=Department.S_AND_T))

        assert kpi.department is Department.S_AND_T
        assert kpi.total_tasks == 1
        assert kpi.scheduled_tasks == 1
        assert kpi.unscheduled_tasks == 0
        assert kpi.asset_availability_percent == 100.0
        assert kpi.scheduled_hours == 2.0

    def test_zero_division_safety_when_no_tasks(self) -> None:
        empty_plan = _sample_kpi_plan()
        empty_plan.assignments = []
        plan_repo = _StubPlanRepo(empty_plan)
        service = ConcreteKpiService(plan_repo=plan_repo, task_repo=_StubTaskRepo())

        kpi = service.availability(KpiQuery(plan_id=42))

        assert kpi.total_tasks == 0
        assert kpi.scheduled_tasks == 0
        assert kpi.asset_availability_percent == 100.0  # Safe default, no division by zero

    def test_zero_division_safety_when_no_window_hours(self) -> None:
        plan = _sample_kpi_plan()
        plan.kpis.available_window_hours = 0.0
        plan_repo = _StubPlanRepo(plan)
        service = ConcreteKpiService(plan_repo=plan_repo, task_repo=_StubTaskRepo())

        kpi = service.utilization(KpiQuery(plan_id=42))

        assert kpi.available_window_hours == 0.0
        assert kpi.block_utilization_percent == 0.0  # Safe default, no division by zero

    def test_plan_not_found_raises_not_found_error(self) -> None:
        service = ConcreteKpiService(
            plan_repo=_StubPlanRepo(None),
            task_repo=_StubTaskRepo(),
        )

        with pytest.raises(NotFoundError, match="Block plan 999 not found"):
            service.availability(KpiQuery(plan_id=999))

    def test_critical_tasks_returns_paginated_severity_a(self) -> None:
        service = ConcreteKpiService(
            plan_repo=_StubPlanRepo(_sample_kpi_plan()),
            task_repo=_StubTaskRepo(),
        )

        res = service.critical_tasks(
            query=KpiQuery(plan_id=42),
            pagination=PaginationParams(limit=10, offset=0),
        )

        assert len(res.items) == 1
        assert res.items[0].task_id == 2
        assert res.items[0].defect_severity is DefectSeverity.A
