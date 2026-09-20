"""Unit tests for the concrete service layer.

Strategy
--------
* Each test uses minimal in-memory stub/mock implementations of the
  repository and external service Protocols.
* No database, ML model, OR-Tools, HTTP calls, or Celery is involved.
* Tests verify orchestration logic: correct delegation, error propagation,
  early-exit conditions, and output shape.
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
    TaskStatus,
    Weekday,
)
from app.schemas.horizon import PlanGenerateRequest
from app.schemas.internal import OptimizerInput, OptimizerResult, OptimizerWindow, ScoredTask
from app.schemas.kpis import KpiResponse, CriticalTasksKpiResponse
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.schemas.common import PageMeta
from app.services.exceptions import ApiServiceError, DependencyNotReady, NotFoundError
from app.services.kpi_service import ConcreteKpiService
from app.services.ml_service import UnavailableMlScoringService
from app.services.optimizer_service import UnavailableOptimizerService
from app.services.plan_service import ConcretePlanService
from app.services.task_service import ConcreteTaskService


# ---------------------------------------------------------------------------
# Shared fixtures / helpers
# ---------------------------------------------------------------------------

_WEEKLY = PlanGenerateRequest(
    horizon_type=PlanningHorizonType.WEEKLY,
    horizon_start=date(2026, 8, 24),
    horizon_end=date(2026, 8, 30),
    corridor_id="COR_01",
)

_SCORED_TASK = ScoredTask(
    task_id=1,
    department=Department.ENGINEERING,
    corridor_id="COR_01",
    defect_severity=DefectSeverity.A,
    days_overdue=5,
    estimated_hours=4.0,
    asset_age_years=10,
    criticality_score=0.0,
)

_WINDOW = OptimizerWindow(
    window_id=10,
    corridor_id="COR_01",
    day=Weekday.MON,
    available_hours=8.0,
)

_ASSIGNMENT = PlanAssignmentResponse(
    task_id=1,
    window_id=10,
    corridor_id="COR_01",
    department=Department.ENGINEERING,
    day=Weekday.MON,
    estimated_hours=4.0,
    criticality_score=85.0,
    defect_severity=DefectSeverity.A,
    status=AssignmentStatus.SCHEDULED,
)

_KPI = KpiResponse(
    plan_id=42,
    total_tasks=1,
    scheduled_tasks=1,
    unscheduled_tasks=0,
    critical_unscheduled_tasks=0,
    asset_availability_percent=100.0,
    scheduled_hours=4.0,
    available_window_hours=8.0,
)

_PLAN_RESPONSE = BlockPlanResponse(
    plan_id=42,
    horizon_type=PlanningHorizonType.WEEKLY,
    horizon_start=date(2026, 8, 24),
    horizon_end=date(2026, 8, 30),
    status=PlanStatus.READY,
    assignments=[_ASSIGNMENT],
    kpis=_KPI,
)

_TASK_RESPONSE = MaintenanceTaskResponse(
    task_id=1,
    department=Department.ENGINEERING,
    corridor_id="COR_01",
    defect_severity=DefectSeverity.A,
    days_overdue=5,
    estimated_hours=4.0,
    asset_age_years=10,
    status=TaskStatus.OPEN,
    criticality_score=85.0,
)

_TASK_LIST = MaintenanceTaskListResponse(
    items=[_TASK_RESPONSE],
    meta=PageMeta(limit=50, offset=0, total=1),
)


# ---------------------------------------------------------------------------
# Stub implementations (satisfy Protocols with canned data)
# ---------------------------------------------------------------------------

class _StubTaskRepo:
    def get_by_id(self, task_id: int) -> MaintenanceTaskResponse:
        if task_id == 1:
            return _TASK_RESPONSE
        raise NotFoundError(f"Task {task_id} not found.")

    def list_tasks(self, *, pagination, corridor_id, department, status):
        return _TASK_LIST

    def list_unscheduled(self, *, pagination, plan_id, corridor_id, critical_only):
        if critical_only:
            return MaintenanceTaskListResponse(
                items=[_TASK_RESPONSE],
                meta=PageMeta(limit=50, offset=0, total=1),
            )
        return _TASK_LIST

    def list_open_for_scoring(self, *, corridor_id, department):
        return [_SCORED_TASK]


class _EmptyTaskRepo(_StubTaskRepo):
    """Returns no tasks — for testing the 'no tasks' guard."""
    def list_open_for_scoring(self, *, corridor_id, department):
        return []


class _StubWindowRepo:
    def list_windows(self, *, corridor_id, horizon_start, horizon_end):
        return [_WINDOW]

    def list_all(self, *, corridor_id):
        from app.schemas.windows import BlockWindowListResponse
        return BlockWindowListResponse(
            items=[],
            meta=PageMeta(limit=50, offset=0, total=0),
        )


class _EmptyWindowRepo(_StubWindowRepo):
    """Returns no windows — for testing the 'no windows' guard."""
    def list_windows(self, *, corridor_id, horizon_start, horizon_end):
        return []


class _StubPlanRepo:
    def __init__(self) -> None:
        self.failed_plan_id: int | None = None
        self.failed_reason: str | None = None
        self.saved_result: object | None = None

    def create_pending(self, *, horizon_type, horizon_start, horizon_end, corridor_id, department):
        return PlanJobResponse(job_id="job-test-001", plan_id=42, status=PlanStatus.PENDING)

    def save_result(self, *, plan_id, result):
        self.saved_result = result
        return _PLAN_RESPONSE

    def mark_failed(self, *, plan_id, reason):
        self.failed_plan_id = plan_id
        self.failed_reason = reason

    def get_by_id(self, plan_id: int) -> BlockPlanResponse:
        if plan_id == 42:
            return _PLAN_RESPONSE
        raise NotFoundError(f"Plan {plan_id} not found.")


class _StubMlService:
    def score_tasks(self, tasks: list[ScoredTask]) -> list[ScoredTask]:
        return [t.model_copy(update={"criticality_score": 85.0}) for t in tasks]


class _StubOptimizerService:
    def optimize(self, payload: OptimizerInput) -> OptimizerResult:
        return OptimizerResult(assignments=[_ASSIGNMENT], kpis=_KPI)


# ---------------------------------------------------------------------------
# ConcreteTaskService tests
# ---------------------------------------------------------------------------

class TestConcreteTaskService:
    def _service(self) -> ConcreteTaskService:
        return ConcreteTaskService(_StubTaskRepo())

    def test_list_tasks_returns_paginated_list(self) -> None:
        svc = self._service()
        result = svc.list_tasks(
            pagination=PaginationParams(limit=50, offset=0),
            corridor_id=None,
            department=None,
            status=None,
        )
        assert result.meta.total == 1
        assert result.items[0].task_id == 1

    def test_get_task_returns_task_when_found(self) -> None:
        svc = self._service()
        task = svc.get_task(1)
        assert task.task_id == 1
        assert task.department is Department.ENGINEERING

    def test_get_task_raises_not_found_for_unknown_id(self) -> None:
        svc = self._service()
        with pytest.raises(NotFoundError):
            svc.get_task(999)

    def test_list_unscheduled_returns_critical_tasks(self) -> None:
        svc = self._service()
        result = svc.list_unscheduled(
            pagination=PaginationParams(limit=50, offset=0),
            plan_id=None,
            corridor_id=None,
            critical_only=True,
        )
        assert len(result.items) == 1
        assert result.items[0].defect_severity is DefectSeverity.A


# ---------------------------------------------------------------------------
# ConcretePlanService tests
# ---------------------------------------------------------------------------

class TestConcretePlanService:
    def _service(
        self,
        task_repo=None,
        window_repo=None,
        plan_repo=None,
        ml=None,
        optimizer=None,
    ) -> tuple[ConcretePlanService, _StubPlanRepo]:
        pr = plan_repo or _StubPlanRepo()
        svc = ConcretePlanService(
            task_repo=task_repo or _StubTaskRepo(),
            window_repo=window_repo or _StubWindowRepo(),
            plan_repo=pr,
            ml=ml or _StubMlService(),
            optimizer=optimizer or _StubOptimizerService(),
        )
        return svc, pr

    def test_generate_plan_returns_job_handle(self) -> None:
        svc, _ = self._service()
        job = svc.generate_plan(_WEEKLY)
        assert job.accepted is True
        assert bool(job.job_id) is True
        assert job.plan_id == 42
        assert job.status is PlanStatus.PENDING


    def test_execute_generation_saves_result_on_success(self) -> None:
        svc, repo = self._service()
        result = svc.execute_generation(42, _WEEKLY)
        assert repo.saved_result is not None
        assert result.assignments[0].task_id == 1

    def test_execute_generation_raises_when_ml_fails(self) -> None:
        class _FailingMl:
            def score_tasks(self, tasks):
                raise DependencyNotReady("ML service down")

        svc, repo = self._service(ml=_FailingMl())
        with pytest.raises(DependencyNotReady):
            svc.execute_generation(42, _WEEKLY)

    def test_execute_generation_raises_when_no_tasks(self) -> None:
        svc, repo = self._service(task_repo=_EmptyTaskRepo())
        with pytest.raises(ApiServiceError, match="No open maintenance tasks"):
            svc.execute_generation(42, _WEEKLY)

    def test_execute_generation_raises_when_no_windows(self) -> None:
        svc, repo = self._service(window_repo=_EmptyWindowRepo())
        with pytest.raises(ApiServiceError, match="No block windows"):
            svc.execute_generation(42, _WEEKLY)


    def test_get_plan_returns_plan_with_assignments(self) -> None:
        svc, _ = self._service()
        plan = svc.get_plan(42)
        assert plan.plan_id == 42
        assert plan.status is PlanStatus.READY
        assert len(plan.assignments) == 1

    def test_get_plan_raises_not_found_for_unknown_id(self) -> None:
        svc, _ = self._service()
        with pytest.raises(NotFoundError):
            svc.get_plan(999)


# ---------------------------------------------------------------------------
# ConcreteKpiService tests
# ---------------------------------------------------------------------------

class TestConcreteKpiService:
    def _service(self) -> ConcreteKpiService:
        return ConcreteKpiService(
            plan_repo=_StubPlanRepo(),
            task_repo=_StubTaskRepo(),
        )

    def test_availability_returns_kpi_for_valid_plan(self) -> None:
        from app.schemas.kpis import KpiQuery
        svc = self._service()
        result = svc.availability(KpiQuery(plan_id=42))
        assert result.asset_availability_percent == 100.0
        assert result.scheduled_tasks == 1

    def test_availability_raises_not_found_for_unknown_plan(self) -> None:
        from app.schemas.kpis import KpiQuery
        svc = self._service()
        with pytest.raises(NotFoundError):
            svc.availability(KpiQuery(plan_id=999))

    def test_utilization_returns_hours_breakdown(self) -> None:
        from app.schemas.kpis import KpiQuery
        svc = self._service()
        result = svc.utilization(KpiQuery(plan_id=42))
        assert result.scheduled_hours == 4.0
        assert result.available_window_hours == 8.0

    def test_critical_tasks_returns_severity_a_only(self) -> None:
        from app.schemas.kpis import KpiQuery
        svc = self._service()
        result = svc.critical_tasks(
            KpiQuery(plan_id=42),
            pagination=PaginationParams(limit=50, offset=0),
        )
        assert isinstance(result, CriticalTasksKpiResponse)
        assert all(
            item.defect_severity is DefectSeverity.A for item in result.items
        )


# ---------------------------------------------------------------------------
# UnavailableMlScoringService / UnavailableOptimizerService tests
# ---------------------------------------------------------------------------

class TestUnavailableStubs:
    def test_ml_stub_raises_dependency_not_ready(self) -> None:
        svc = UnavailableMlScoringService()
        with pytest.raises(DependencyNotReady):
            svc.score_tasks([_SCORED_TASK])

    def test_optimizer_stub_raises_dependency_not_ready(self) -> None:
        svc = UnavailableOptimizerService()
        with pytest.raises(DependencyNotReady):
            svc.optimize(OptimizerInput(tasks=[_SCORED_TASK], windows=[_WINDOW]))
