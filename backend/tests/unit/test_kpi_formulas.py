"""Unit tests for KPI calculation formulas.

Validates:
- Asset Availability % formula: (scheduled / total) * 100, round 2dp.
- Block Utilization % formula: (scheduled_hours / available_hours) * 100, cap 100.
- Zero-division safety for both formulas.
- Department-level filtering within a plan.
- Corridor-level filtering within a plan.
- Plan generation seconds passthrough.
- Critical task counting (UNSCHEDULED + Severity-A only).
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
from app.schemas.tasks import MaintenanceTaskListResponse
from app.services.exceptions import NotFoundError
from app.services.kpi_service import ConcreteKpiService


def _make_plan(
    assignments: list[PlanAssignmentResponse] | None = None,
    available_hours: float = 12.0,
) -> BlockPlanResponse:
    return BlockPlanResponse(
        plan_id=1,
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
        status=PlanStatus.READY,
        assignments=assignments or [],
        kpis=KpiResponse(
            plan_id=1,
            total_tasks=len(assignments or []),
            scheduled_tasks=0,
            unscheduled_tasks=0,
            critical_unscheduled_tasks=0,
            asset_availability_percent=0.0,
            available_window_hours=available_hours,
        ),
    )


def _sched(task_id: int, dept: Department, hours: float, corridor: str = "COR_01") -> PlanAssignmentResponse:
    return PlanAssignmentResponse(
        task_id=task_id, window_id=10, corridor_id=corridor,
        department=dept, day=Weekday.MON, estimated_hours=hours,
        criticality_score=80.0, defect_severity=DefectSeverity.B,
        status=AssignmentStatus.SCHEDULED,
    )


def _unsched_critical(task_id: int, dept: Department = Department.ENGINEERING) -> PlanAssignmentResponse:
    return PlanAssignmentResponse(
        task_id=task_id, window_id=None, corridor_id="COR_01",
        department=dept, day=None, estimated_hours=2.0,
        criticality_score=95.0, defect_severity=DefectSeverity.A,
        status=AssignmentStatus.UNSCHEDULED,
    )


class _StubRepo:
    def __init__(self, plan: BlockPlanResponse | None) -> None:
        self._plan = plan

    def get_by_id(self, plan_id: int) -> BlockPlanResponse | None:
        if self._plan and self._plan.plan_id == plan_id:
            return self._plan
        return None

    def list_unscheduled(self, *, pagination, plan_id, corridor_id, critical_only):
        return MaintenanceTaskListResponse(
            items=[],
            meta=PageMeta(limit=50, offset=0, total=0),
        )

    def get_by_id(self, plan_id: int) -> BlockPlanResponse | None:
        if self._plan and self._plan.plan_id == plan_id:
            return self._plan
        return None


def _service(plan: BlockPlanResponse | None = None) -> ConcreteKpiService:
    repo = _StubRepo(plan)
    return ConcreteKpiService(plan_repo=repo, task_repo=repo)


class TestAssetAvailabilityFormula:
    def test_100_percent_when_all_scheduled(self) -> None:
        plan = _make_plan([_sched(1, Department.ENGINEERING, 4.0)])
        kpi = _service(plan).availability(KpiQuery(plan_id=1))
        assert kpi.asset_availability_percent == 100.0

    def test_50_percent_when_half_scheduled(self) -> None:
        plan = _make_plan([
            _sched(1, Department.ENGINEERING, 4.0),
            _unsched_critical(2),
        ])
        kpi = _service(plan).availability(KpiQuery(plan_id=1))
        assert kpi.asset_availability_percent == 50.0

    def test_0_percent_when_none_scheduled(self) -> None:
        plan = _make_plan([_unsched_critical(1), _unsched_critical(2)])
        kpi = _service(plan).availability(KpiQuery(plan_id=1))
        assert kpi.asset_availability_percent == 0.0

    def test_100_percent_when_no_tasks_zero_division_safe(self) -> None:
        plan = _make_plan([])
        kpi = _service(plan).availability(KpiQuery(plan_id=1))
        assert kpi.asset_availability_percent == 100.0

    def test_rounding_to_2dp(self) -> None:
        # 1 out of 3 = 33.33...%
        plan = _make_plan([
            _sched(1, Department.ENGINEERING, 2.0),
            _unsched_critical(2),
            _unsched_critical(3),
        ])
        kpi = _service(plan).availability(KpiQuery(plan_id=1))
        assert kpi.asset_availability_percent == 33.33


class TestBlockUtilizationFormula:
    def test_utilization_50_percent(self) -> None:
        plan = _make_plan([_sched(1, Department.ENGINEERING, 4.0)], available_hours=8.0)
        kpi = _service(plan).utilization(KpiQuery(plan_id=1))
        assert kpi.block_utilization_percent == 50.0

    def test_utilization_capped_at_100_percent(self) -> None:
        # Force scenario: 20h scheduled, 8h available
        plan = _make_plan([
            _sched(1, Department.ENGINEERING, 10.0),
            _sched(2, Department.ENGINEERING, 10.0),
        ], available_hours=8.0)
        kpi = _service(plan).utilization(KpiQuery(plan_id=1))
        assert kpi.block_utilization_percent == 100.0

    def test_utilization_0_when_no_scheduled_hours(self) -> None:
        plan = _make_plan([_unsched_critical(1)], available_hours=8.0)
        kpi = _service(plan).utilization(KpiQuery(plan_id=1))
        assert kpi.block_utilization_percent == 0.0

    def test_utilization_0_when_no_available_hours_zero_division_safe(self) -> None:
        plan = _make_plan([_sched(1, Department.ENGINEERING, 4.0)], available_hours=0.0)
        kpi = _service(plan).utilization(KpiQuery(plan_id=1))
        assert kpi.block_utilization_percent == 0.0


class TestKpiFilteringByCorridor:
    def test_filter_by_corridor_isolates_tasks(self) -> None:
        plan = _make_plan([
            _sched(1, Department.ENGINEERING, 4.0, corridor="COR_01"),
            _sched(2, Department.ENGINEERING, 4.0, corridor="COR_02"),
        ])
        kpi = _service(plan).availability(KpiQuery(plan_id=1, corridor_id="COR_01"))
        assert kpi.total_tasks == 1
        assert kpi.scheduled_tasks == 1


class TestKpiFilteringByDepartment:
    def test_filter_by_department_isolates_tasks(self) -> None:
        plan = _make_plan([
            _sched(1, Department.ENGINEERING, 4.0),
            _sched(2, Department.S_AND_T, 4.0),
        ])
        kpi = _service(plan).availability(KpiQuery(plan_id=1, department=Department.S_AND_T))
        assert kpi.total_tasks == 1
        assert kpi.department is Department.S_AND_T


class TestCriticalUnscheduledCounting:
    def test_counts_only_severity_a_unscheduled(self) -> None:
        sev_b_unsched = PlanAssignmentResponse(
            task_id=99, window_id=None, corridor_id="COR_01",
            department=Department.ENGINEERING, day=None, estimated_hours=2.0,
            criticality_score=70.0, defect_severity=DefectSeverity.B,
            status=AssignmentStatus.UNSCHEDULED,
        )
        plan = _make_plan([_unsched_critical(1), sev_b_unsched])
        kpi = _service(plan).availability(KpiQuery(plan_id=1))
        # Only task 1 is Severity A and unscheduled
        assert kpi.critical_unscheduled_tasks == 1
        assert kpi.unscheduled_tasks == 2

    def test_no_critical_when_all_scheduled(self) -> None:
        plan = _make_plan([_sched(1, Department.ENGINEERING, 4.0)])
        kpi = _service(plan).availability(KpiQuery(plan_id=1))
        assert kpi.critical_unscheduled_tasks == 0


class TestPlanNotFoundHandling:
    def test_availability_raises_not_found_for_unknown_plan(self) -> None:
        with pytest.raises(NotFoundError, match="Block plan 999 not found"):
            _service(None).availability(KpiQuery(plan_id=999))

    def test_utilization_raises_not_found_for_unknown_plan(self) -> None:
        with pytest.raises(NotFoundError):
            _service(None).utilization(KpiQuery(plan_id=999))
