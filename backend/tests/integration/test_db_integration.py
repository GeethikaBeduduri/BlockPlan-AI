"""Person 1 ↔ Person 2 database integration tests.

Proves that real Person 1 application services consume real rows through
the real SQLAlchemy repository adapters using Person 2's models.

Request path for each test class:

  TestTaskRepositoryDirectIntegration
    Real MaintenanceTask row
      → SqlAlchemyTaskRepository (session_factory → SQLite)
      → ConcreteTaskService
      → assertion

  TestWindowRepositoryDirectIntegration
    Real BlockWindow row
      → SqlAlchemyWindowRepository (session_factory → SQLite)
      → assertion

  TestTaskHttpEndpoints
    HTTP GET /tasks / /tasks/{id} / /tasks/unscheduled
      → FastAPI router (tasks.py)
      → get_task_service dependency override → ConcreteTaskService
      → SqlAlchemyTaskRepository (session_factory → SQLite)
      → Person 2 MaintenanceTask model
      → JSON response

  TestTaskFiltering
    HTTP GET /tasks?corridor_id=… / ?department=… / ?status=…
      → FastAPI router
      → ConcreteTaskService.list_tasks
      → SqlAlchemyTaskRepository (SQL WHERE in SQLite)
      → JSON response

  TestStatusMapping
    HTTP GET /tasks?status=open / status=unscheduled / status=completed
      → _map_db_to_task_status / _map_status_filter_to_db
      → SQL WHERE MaintenanceTask.status.in_([…])
      → confirmed mapping in JSON

  TestCriticalityPreservation
    Real MaintenanceTask (criticality_score=None and =78.5)
      → SqlAlchemyTaskRepository._row_to_task_response
      → MaintenanceTaskResponse.criticality_score preserved as-is

  TestPaginationIntegration
    HTTP GET /tasks?limit=N&offset=M
      → SqlAlchemyTaskRepository.list_tasks (OFFSET/LIMIT in SQL)
      → PageMeta.total reflects unsliced count

  TestWindowDateFiltering
    Real BlockWindow rows (3 in Aug, 1 in Sep)
      → SqlAlchemyWindowRepository.list_windows(horizon_start, horizon_end)
      → only Aug windows returned

  TestWindowCorridorFiltering
    Real BlockWindow rows (COR_01 and COR_02)
      → SqlAlchemyWindowRepository.list_windows(corridor_id=…)
      → only matching corridor returned

  TestPlanServicePipelineIntegration
    Real MaintenanceTask + BlockWindow rows
      → ConcretePlanService._run_generation
      → SqlAlchemyTaskRepository.list_open_for_scoring (real DB)
      → SqlAlchemyWindowRepository.list_windows (real DB)
      → stubbed MLScoringServiceAdapter → stubbed OptimizerServiceAdapter
      → OptimizerResult assertions
"""

from __future__ import annotations

from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import Base, BlockWindow, MaintenanceTask

from app.config import Settings
from app.main import create_app
from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import PaginationParams
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    PlanningHorizonType,
    TaskStatus,
    Weekday,
)
from app.schemas.horizon import PlanGenerateRequest
from app.schemas.internal import OptimizerInput, OptimizerResult
from app.schemas.kpis import KpiResponse
from app.schemas.ml import MLBatchScoringRequest, MLBatchScoringResponse, MLTaskScoreItem
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.services import get_task_service
from app.services.ml_service import LocalCallableMLClient, MLScoringServiceAdapter
from app.services.optimizer_service import LocalCallableOptimizerClient, OptimizerServiceAdapter
from app.services.plan_service import ConcretePlanService
from app.services.sql_repositories import SqlAlchemyTaskRepository, SqlAlchemyWindowRepository
from app.services.task_service import ConcreteTaskService


# ---------------------------------------------------------------------------
# Shared fixtures (module-scoped: one SQLite DB for the entire test module)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def engine():
    """Create a shared in-memory SQLite engine using StaticPool.

    StaticPool ensures every sessionmaker connection uses the same underlying
    SQLite connection, so schema and seeded rows are visible across sessions.
    """
    eng = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture(scope="module")
def sf(engine) -> sessionmaker:
    """Return a sessionmaker bound to the shared engine."""
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(scope="module", autouse=True)
def seed(sf: sessionmaker) -> None:
    """Seed the in-memory database with known, deterministic rows.

    Tasks (5 total):
      id=1  TMS-1001   Engineering  COR_01  severity=A  status=PENDING   score=None
      id=2  SMMS-2001  S&T          COR_01  severity=B  status=PENDING   score=78.5
      id=3  TDMS-3001  Traction     COR_01  severity=A  status=UNSCHEDULED score=94.0
      id=4  TMS-1002   Engineering  COR_02  severity=C  status=PENDING   score=35.0
      id=5  TDMS-3002  Traction     COR_02  severity=B  status=COMPLETED  score=50.0

    Block windows (4 total):
      id=1  COR_01  2026-08-24 Mon  01:00-05:00  4.0h  AVAILABLE
      id=2  COR_01  2026-08-26 Wed  02:00-06:00  4.0h  AVAILABLE
      id=3  COR_02  2026-08-25 Tue  00:30-04:30  4.0h  AVAILABLE
      id=4  COR_01  2026-09-15 Mon  01:00-05:00  4.0h  AVAILABLE  (outside Aug horizon)
    """
    tasks = [
        MaintenanceTask(
            task_id="TMS-1001", source_system="TMS", source_record_id="1001",
            department="Engineering", asset_id="TRK-01", corridor_id="COR_01",
            defect_type="RAIL_FRACTURE", defect_severity="A",
            days_overdue=14, estimated_hours=4.0, asset_age_years=12,
            status="PENDING", criticality_score=None,
        ),
        MaintenanceTask(
            task_id="SMMS-2001", source_system="SMMS", source_record_id="2001",
            department="S&T", asset_id="SIG-01", corridor_id="COR_01",
            defect_type="SIGNAL_FAILURE", defect_severity="B",
            days_overdue=3, estimated_hours=2.0, asset_age_years=5,
            status="PENDING", criticality_score=78.5,
        ),
        MaintenanceTask(
            task_id="TDMS-3001", source_system="TDMS", source_record_id="3001",
            department="Traction", asset_id="OHE-01", corridor_id="COR_01",
            defect_type="CANTILEVER_CRACK", defect_severity="A",
            days_overdue=20, estimated_hours=5.0, asset_age_years=15,
            status="UNSCHEDULED", criticality_score=94.0,
        ),
        MaintenanceTask(
            task_id="TMS-1002", source_system="TMS", source_record_id="1002",
            department="Engineering", asset_id="TRK-02", corridor_id="COR_02",
            defect_type="SLEEPER_EROSION", defect_severity="C",
            days_overdue=1, estimated_hours=3.0, asset_age_years=3,
            status="PENDING", criticality_score=35.0,
        ),
        MaintenanceTask(
            task_id="TDMS-3002", source_system="TDMS", source_record_id="3002",
            department="Traction", asset_id="OHE-02", corridor_id="COR_02",
            defect_type="INSULATOR_FAULT", defect_severity="B",
            days_overdue=0, estimated_hours=2.5, asset_age_years=7,
            status="COMPLETED", criticality_score=50.0,
        ),
    ]

    windows = [
        BlockWindow(
            window_id="COA-W01", source_system="COA", source_record_id="W01",
            corridor_id="COR_01", window_date=date(2026, 8, 24),
            start_time=time(1, 0), end_time=time(5, 0),
            available_hours=4.0, status="AVAILABLE",
        ),
        BlockWindow(
            window_id="COA-W02", source_system="COA", source_record_id="W02",
            corridor_id="COR_01", window_date=date(2026, 8, 26),
            start_time=time(2, 0), end_time=time(6, 0),
            available_hours=4.0, status="AVAILABLE",
        ),
        BlockWindow(
            window_id="COA-W03", source_system="COA", source_record_id="W03",
            corridor_id="COR_02", window_date=date(2026, 8, 25),
            start_time=time(0, 30), end_time=time(4, 30),
            available_hours=4.0, status="AVAILABLE",
        ),
        BlockWindow(
            window_id="COA-W04", source_system="COA", source_record_id="W04",
            corridor_id="COR_01", window_date=date(2026, 9, 15),
            start_time=time(1, 0), end_time=time(5, 0),
            available_hours=4.0, status="AVAILABLE",
        ),
    ]

    with sf() as session:
        for obj in tasks + windows:
            session.add(obj)
        session.commit()


@pytest.fixture(scope="module")
def task_repo(sf: sessionmaker) -> SqlAlchemyTaskRepository:
    """Return a real SqlAlchemyTaskRepository wired to the SQLite session factory."""
    return SqlAlchemyTaskRepository(session_factory=sf)


@pytest.fixture(scope="module")
def window_repo(sf: sessionmaker) -> SqlAlchemyWindowRepository:
    """Return a real SqlAlchemyWindowRepository wired to the SQLite session factory."""
    return SqlAlchemyWindowRepository(session_factory=sf)


@pytest.fixture(scope="module")
def task_service(task_repo: SqlAlchemyTaskRepository) -> ConcreteTaskService:
    """Return ConcreteTaskService backed by the real SQLite task repository."""
    return ConcreteTaskService(repository=task_repo)


@pytest.fixture(scope="module")
def http_client(sf: sessionmaker) -> TestClient:
    """FastAPI TestClient with dependency override → real SQLite task repository.

    Request path:
        HTTP → router → get_task_service override
             → ConcreteTaskService(SqlAlchemyTaskRepository(sf)) → SQLite
    """
    settings = Settings(
        app_title="SIH26027 Block Planning API (DB Integration Test)",
        app_version="0.1.0",
        environment="test",
        debug=False,
    )
    app = create_app(settings)
    repo = SqlAlchemyTaskRepository(session_factory=sf)
    svc = ConcreteTaskService(repository=repo)
    app.dependency_overrides[get_task_service] = lambda: svc

    with TestClient(app) as client:
        yield client


# ---------------------------------------------------------------------------
# Shared ML + Optimizer stubs
# ---------------------------------------------------------------------------

def _ml_stub(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
    """Assign a fixed 85.0 criticality to every task — simulates Group 1 XGBoost."""
    return MLBatchScoringResponse(
        scores=[MLTaskScoreItem(task_id=t.task_id, criticality_score=85.0) for t in req.tasks]
    )


def _optimizer_stub(opt_input: OptimizerInput) -> OptimizerResult:
    """Greedily assign each task to windows round-robin — simulates Group 1 OR-Tools.

    All tasks share the same corridor in each sub-test, so corridor matching holds.
    Each window has 4.0h available; tasks are individually <= 5.0h so we use one
    window per task to stay within capacity.
    """
    assignments = []
    for i, task in enumerate(opt_input.tasks):
        window = opt_input.windows[i % len(opt_input.windows)]
        assignments.append(
            PlanAssignmentResponse(
                task_id=task.task_id,
                window_id=window.window_id,
                corridor_id=task.corridor_id,
                department=task.department,
                day=window.day,
                estimated_hours=task.estimated_hours,
                criticality_score=task.criticality_score,
                defect_severity=task.defect_severity,
                status=AssignmentStatus.SCHEDULED,
            )
        )
    total = len(opt_input.tasks)
    return OptimizerResult(
        assignments=assignments,
        kpis=KpiResponse(
            total_tasks=total,
            scheduled_tasks=total,
            unscheduled_tasks=0,
            critical_unscheduled_tasks=0,
            asset_availability_percent=100.0,
            scheduled_hours=sum(t.estimated_hours for t in opt_input.tasks),
            available_window_hours=sum(w.available_hours for w in opt_input.windows),
        ),
    )


class _StubPlanRepo:
    """Minimal in-memory PlanRepository stub — avoids dependency on DB plan tables."""

    def __init__(self) -> None:
        self._saved: dict[int, OptimizerResult] = {}

    def create_pending(self, **kwargs) -> PlanJobResponse:
        return PlanJobResponse(
            accepted=True, job_id="stub-job", plan_id=1, status="pending"
        )

    def save_result(self, *, plan_id: int, result: OptimizerResult) -> BlockPlanResponse:
        self._saved[plan_id] = result
        return BlockPlanResponse(
            plan_id=plan_id,
            horizon_type=PlanningHorizonType.WEEKLY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            status="ready",
            assignments=result.assignments,
            kpis=result.kpis,
        )

    def mark_failed(self, *, plan_id: int, reason: str) -> None:
        pass

    def get_by_id(self, plan_id: int) -> BlockPlanResponse:
        raise NotImplementedError


# ===========================================================================
# 1. Real MaintenanceTask row → TaskRepository → ConcreteTaskService
# ===========================================================================

class TestTaskRepositoryDirectIntegration:
    """Request path: MaintenanceTask row → SqlAlchemyTaskRepository → ConcreteTaskService."""

    def test_get_by_id_returns_real_row(self, task_service: ConcreteTaskService) -> None:
        """get_by_id hits the DB via SqlAlchemyTaskRepository and maps to domain schema."""
        task = task_service.get_task(1)

        assert task.task_id == 1
        assert task.department == Department.ENGINEERING
        assert task.corridor_id == "COR_01"
        assert task.defect_severity == DefectSeverity.A
        assert task.days_overdue == 14
        assert task.estimated_hours == 4.0
        assert task.asset_age_years == 12

    def test_get_by_id_status_mapped_pending_to_open(self, task_service: ConcreteTaskService) -> None:
        """PENDING in Person 2's DB must surface as TaskStatus.OPEN in Person 1's domain."""
        task = task_service.get_task(1)
        assert task.status == TaskStatus.OPEN

    def test_get_by_id_null_criticality_preserved(self, task_service: ConcreteTaskService) -> None:
        """Null criticality_score in DB must arrive as None — must NOT become 0."""
        task = task_service.get_task(1)
        assert task.criticality_score is None

    def test_get_by_id_numeric_criticality_preserved(self, task_service: ConcreteTaskService) -> None:
        """Non-null criticality_score must be passed through unchanged."""
        task = task_service.get_task(2)
        assert task.criticality_score == 78.5

    def test_list_tasks_returns_all_five_rows(self, task_service: ConcreteTaskService) -> None:
        """list_tasks with no filter returns all seeded rows."""
        result = task_service.list_tasks(
            pagination=PaginationParams(limit=50, offset=0),
            corridor_id=None,
            department=None,
            status=None,
        )
        assert result.meta.total == 5
        assert len(result.items) == 5

    def test_list_unscheduled_returns_only_unscheduled(self, task_service: ConcreteTaskService) -> None:
        """list_unscheduled must match only DB rows with status=UNSCHEDULED."""
        result = task_service.list_unscheduled(
            pagination=PaginationParams(limit=50, offset=0),
            plan_id=None,
            corridor_id=None,
            critical_only=False,
        )
        assert result.meta.total == 1
        item = result.items[0]
        assert item.task_id == 3
        assert item.status == TaskStatus.UNSCHEDULED

    def test_list_unscheduled_does_not_include_pending(self, task_service: ConcreteTaskService) -> None:
        """PENDING rows must NOT appear in list_unscheduled."""
        result = task_service.list_unscheduled(
            pagination=PaginationParams(limit=50, offset=0),
            plan_id=None,
            corridor_id=None,
            critical_only=False,
        )
        statuses = {item.status for item in result.items}
        assert TaskStatus.OPEN not in statuses
        assert TaskStatus.UNSCHEDULED in statuses


# ===========================================================================
# 2. Real BlockWindow row → WindowRepository
# ===========================================================================

class TestWindowRepositoryDirectIntegration:
    """Request path: BlockWindow row → SqlAlchemyWindowRepository."""

    def test_list_windows_returns_windows_within_horizon(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """list_windows must only return rows inside [horizon_start, horizon_end]."""
        windows = window_repo.list_windows(
            corridor_id=None,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )
        # W01 (Aug 24), W02 (Aug 26), W03 (Aug 25) — W04 (Sep 15) excluded
        assert len(windows) == 3

    def test_list_all_returns_all_four_windows(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """list_all without filter returns all configured windows regardless of date."""
        result = window_repo.list_all()
        assert result.meta.total == 4
        assert len(result.items) == 4

    def test_window_entity_id_is_integer_pk(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """window_id in the response must be the integer SQLAlchemy PK (row.id), not the string business key."""
        windows = window_repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 24),
        )
        assert len(windows) == 1
        assert isinstance(windows[0].window_id, int)
        assert windows[0].window_id == 1  # First inserted row

    def test_window_weekday_derived_correctly(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """Weekday must be computed from window_date.weekday() not stored directly."""
        windows = window_repo.list_windows(
            corridor_id="COR_02",
            horizon_start=date(2026, 8, 25),
            horizon_end=date(2026, 8, 25),
        )
        assert len(windows) == 1
        # 2026-08-25 is Tuesday
        assert windows[0].day == Weekday.TUE

    def test_window_starts_at_ends_at_combined_correctly(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """starts_at and ends_at must be datetime.combine(window_date, start_time/end_time)."""
        windows = window_repo.list_windows(
            corridor_id="COR_02",
            horizon_start=date(2026, 8, 25),
            horizon_end=date(2026, 8, 25),
        )
        w = windows[0]
        assert w.starts_at.hour == 0
        assert w.starts_at.minute == 30
        assert w.ends_at.hour == 4
        assert w.ends_at.minute == 30


# ===========================================================================
# 3. GET /tasks → real TaskRepository (HTTP integration)
# ===========================================================================

class TestTaskHttpEndpoints:
    """Request path: GET /tasks → router → override → ConcreteTaskService → SQLite."""

    def test_get_tasks_returns_200_and_all_rows(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks")
        assert resp.status_code == 200
        data = resp.json()
        assert data["meta"]["total"] == 5
        assert len(data["items"]) == 5

    def test_get_tasks_first_row_fields_are_correct(self, http_client: TestClient) -> None:
        """All domain fields from a PENDING row must be correctly mapped."""
        resp = http_client.get("/tasks")
        first = resp.json()["items"][0]

        assert first["task_id"] == 1
        assert first["department"] == "Engineering"
        assert first["corridor_id"] == "COR_01"
        assert first["defect_severity"] == "A"
        assert first["days_overdue"] == 14
        assert first["estimated_hours"] == 4.0
        assert first["asset_age_years"] == 12
        assert first["status"] == "open"          # PENDING → open
        assert first["criticality_score"] is None  # Null preserved

    def test_get_task_by_id_returns_exact_record(self, http_client: TestClient) -> None:
        """Request path: GET /tasks/2 → router → ConcreteTaskService.get_task(2) → SQLite."""
        resp = http_client.get("/tasks/2")
        assert resp.status_code == 200
        data = resp.json()

        assert data["task_id"] == 2
        assert data["department"] == "S&T"
        assert data["corridor_id"] == "COR_01"
        assert data["defect_severity"] == "B"
        assert data["criticality_score"] == 78.5
        assert data["status"] == "open"

    def test_get_task_by_id_404_for_missing_row(self, http_client: TestClient) -> None:
        """Request path: GET /tasks/9999 → NotFoundError → 404 JSON response."""
        resp = http_client.get("/tasks/9999")
        assert resp.status_code == 404
        assert resp.json()["error"] == "not_found"

    def test_get_tasks_unscheduled_returns_correct_row(self, http_client: TestClient) -> None:
        """Request path: GET /tasks/unscheduled → list_unscheduled → SQL status=UNSCHEDULED."""
        resp = http_client.get("/tasks/unscheduled")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 1
        item = data["items"][0]
        assert item["task_id"] == 3
        assert item["status"] == "unscheduled"
        assert item["criticality_score"] == 94.0

    def test_get_tasks_unscheduled_critical_only(self, http_client: TestClient) -> None:
        """critical_only=true adds defect_severity='A' filter to the SQL query."""
        resp = http_client.get("/tasks/unscheduled?critical_only=true")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 1
        assert data["items"][0]["defect_severity"] == "A"
        assert data["items"][0]["task_id"] == 3


# ===========================================================================
# 4 + 5. Corridor filtering (HTTP)
# ===========================================================================

class TestCorridorFiltering:
    """Request path: GET /tasks?corridor_id=X → SQL WHERE corridor_id = X."""

    def test_corridor_01_returns_three_rows(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?corridor_id=COR_01")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 3
        for item in data["items"]:
            assert item["corridor_id"] == "COR_01"

    def test_corridor_02_returns_two_rows(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?corridor_id=COR_02")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 2
        for item in data["items"]:
            assert item["corridor_id"] == "COR_02"

    def test_unknown_corridor_returns_zero_rows(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?corridor_id=COR_99")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 0
        assert data["items"] == []


# ===========================================================================
# 6. Department filtering (HTTP)
# ===========================================================================

class TestDepartmentFiltering:
    """Request path: GET /tasks?department=X → SQL WHERE department = X."""

    def test_engineering_filter_returns_two_rows(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?department=Engineering")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 2
        for item in data["items"]:
            assert item["department"] == "Engineering"

    def test_traction_filter_returns_two_rows(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?department=Traction")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 2
        for item in data["items"]:
            assert item["department"] == "Traction"

    def test_s_and_t_filter_returns_one_row(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?department=S%26T")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 1
        assert data["items"][0]["department"] == "S&T"


# ===========================================================================
# 7. Status mapping (HTTP — full end-to-end mapping proof)
# ===========================================================================

class TestStatusMapping:
    """Request path: GET /tasks?status=X → _map_status_filter_to_db → SQL IN → response."""

    def test_status_open_matches_pending_rows(self, http_client: TestClient) -> None:
        """status=open must return rows whose DB status is PENDING."""
        resp = http_client.get("/tasks?status=open")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 3
        for item in data["items"]:
            assert item["status"] == "open"  # PENDING → open in response

    def test_status_unscheduled_matches_only_unscheduled(self, http_client: TestClient) -> None:
        """status=unscheduled must NOT return PENDING rows."""
        resp = http_client.get("/tasks?status=unscheduled")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 1
        assert data["items"][0]["status"] == "unscheduled"
        assert data["items"][0]["task_id"] == 3

    def test_status_completed_matches_one_row(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?status=completed")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 1
        assert data["items"][0]["task_id"] == 5
        assert data["items"][0]["status"] == "completed"

    def test_pending_not_returned_when_filtering_unscheduled(
        self, http_client: TestClient
    ) -> None:
        """Cross-check: tasks 1, 2, 4 (PENDING/OPEN) must not appear in status=unscheduled."""
        resp = http_client.get("/tasks?status=unscheduled")
        ids = [item["task_id"] for item in resp.json()["items"]]
        assert 1 not in ids
        assert 2 not in ids
        assert 4 not in ids


# ===========================================================================
# 8. Criticality preservation (direct service)
# ===========================================================================

class TestCriticalityPreservation:
    """Request path: MaintenanceTask row → _row_to_task_response → MaintenanceTaskResponse."""

    def test_null_criticality_arrives_as_none_not_zero(
        self, task_service: ConcreteTaskService
    ) -> None:
        """DB NULL must pass through as Python None — no coercion to 0.0."""
        task = task_service.get_task(1)  # criticality_score=None in DB
        assert task.criticality_score is None

    def test_78_5_criticality_arrives_unchanged(
        self, task_service: ConcreteTaskService
    ) -> None:
        task = task_service.get_task(2)  # criticality_score=78.5
        assert task.criticality_score == 78.5

    def test_94_criticality_preserved_on_unscheduled_task(
        self, task_service: ConcreteTaskService
    ) -> None:
        task = task_service.get_task(3)  # criticality_score=94.0, UNSCHEDULED
        assert task.criticality_score == 94.0

    def test_list_open_for_scoring_null_becomes_zero(
        self, task_repo: SqlAlchemyTaskRepository
    ) -> None:
        """ScoredTask contract requires criticality_score=float.
        Unscored (None) DB rows must initialise to 0.0 in ScoredTask — not None."""
        scored = task_repo.list_open_for_scoring()
        scored_by_id = {t.task_id: t for t in scored}

        # Task 1: DB score is None → must be 0.0 in ScoredTask
        assert scored_by_id[1].criticality_score == 0.0

        # Task 2: DB score is 78.5 → must stay 78.5 in ScoredTask
        assert scored_by_id[2].criticality_score == 78.5


# ===========================================================================
# 9. Pagination (HTTP)
# ===========================================================================

class TestPaginationIntegration:
    """Request path: GET /tasks?limit=N&offset=M → SQL OFFSET/LIMIT → PageMeta."""

    def test_first_page_returns_correct_slice(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?limit=2&offset=0")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 5   # Unsliced count
        assert data["meta"]["limit"] == 2
        assert data["meta"]["offset"] == 0
        assert len(data["items"]) == 2
        assert data["items"][0]["task_id"] == 1
        assert data["items"][1]["task_id"] == 2

    def test_second_page_returns_correct_slice(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?limit=2&offset=2")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 5
        assert data["meta"]["limit"] == 2
        assert data["meta"]["offset"] == 2
        assert len(data["items"]) == 2
        assert data["items"][0]["task_id"] == 3
        assert data["items"][1]["task_id"] == 4

    def test_last_page_returns_remainder(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?limit=2&offset=4")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 5
        assert len(data["items"]) == 1
        assert data["items"][0]["task_id"] == 5

    def test_offset_beyond_total_returns_empty(self, http_client: TestClient) -> None:
        resp = http_client.get("/tasks?limit=10&offset=100")
        assert resp.status_code == 200
        data = resp.json()

        assert data["meta"]["total"] == 5   # Count unchanged
        assert data["items"] == []

    def test_total_count_stable_across_pages(self, http_client: TestClient) -> None:
        """PageMeta.total must be the same regardless of offset."""
        p1 = http_client.get("/tasks?limit=1&offset=0").json()["meta"]["total"]
        p2 = http_client.get("/tasks?limit=1&offset=3").json()["meta"]["total"]
        assert p1 == p2 == 5


# ===========================================================================
# 10. Window date filtering (direct repo)
# ===========================================================================

class TestWindowDateFiltering:
    """Request path: BlockWindow rows → list_windows(horizon_start, horizon_end) → SQL WHERE."""

    def test_august_horizon_excludes_september_window(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """W04 (2026-09-15) must not appear in an August horizon query."""
        windows = window_repo.list_windows(
            corridor_id=None,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )
        window_ids = [w.window_id for w in windows]
        assert 4 not in window_ids  # W04 is id=4

    def test_august_horizon_returns_three_windows(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        windows = window_repo.list_windows(
            corridor_id=None,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )
        assert len(windows) == 3

    def test_exact_boundary_start_date_is_inclusive(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """horizon_start boundary must be inclusive (>=)."""
        windows = window_repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 24),
        )
        # Only W01 (exactly 2026-08-24)
        assert len(windows) == 1
        assert windows[0].window_id == 1

    def test_exact_boundary_end_date_is_inclusive(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """horizon_end boundary must be inclusive (<=)."""
        windows = window_repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 8, 26),
            horizon_end=date(2026, 8, 26),
        )
        # Only W02 (exactly 2026-08-26)
        assert len(windows) == 1
        assert windows[0].window_id == 2

    def test_empty_horizon_returns_no_windows(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """A horizon that covers no seeded windows must return an empty list."""
        windows = window_repo.list_windows(
            corridor_id=None,
            horizon_start=date(2027, 1, 1),
            horizon_end=date(2027, 1, 7),
        )
        assert windows == []

    def test_september_horizon_returns_september_window(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        """W04 (Sep 15) must appear when the horizon covers September."""
        windows = window_repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 9, 1),
            horizon_end=date(2026, 9, 30),
        )
        assert len(windows) == 1
        assert windows[0].window_id == 4


# ===========================================================================
# 11. Window corridor filtering (direct repo)
# ===========================================================================

class TestWindowCorridorFiltering:
    """Request path: BlockWindow rows → list_windows(corridor_id=X) → SQL WHERE."""

    def test_cor_01_filter_returns_only_cor_01_windows(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        windows = window_repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 8, 1),
            horizon_end=date(2026, 9, 30),
        )
        # W01, W02, W04 are COR_01
        assert len(windows) == 3
        for w in windows:
            assert w.corridor_id == "COR_01"

    def test_cor_02_filter_returns_only_cor_02_windows(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        windows = window_repo.list_windows(
            corridor_id="COR_02",
            horizon_start=date(2026, 8, 1),
            horizon_end=date(2026, 8, 31),
        )
        # Only W03
        assert len(windows) == 1
        assert windows[0].corridor_id == "COR_02"

    def test_unknown_corridor_returns_empty_list(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        windows = window_repo.list_windows(
            corridor_id="COR_99",
            horizon_start=date(2026, 8, 1),
            horizon_end=date(2026, 8, 31),
        )
        assert windows == []

    def test_list_all_cor_01_returns_all_three_cor_01_windows(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        result = window_repo.list_all(corridor_id="COR_01")
        assert result.meta.total == 3
        for item in result.items:
            assert item.corridor_id == "COR_01"

    def test_list_all_no_filter_returns_all_four(
        self, window_repo: SqlAlchemyWindowRepository
    ) -> None:
        result = window_repo.list_all()
        assert result.meta.total == 4


# ===========================================================================
# 12. PlanService pipeline — real DB tasks + windows, stubbed ML + optimizer
# ===========================================================================

class TestPlanServicePipelineIntegration:
    """Request path:
        ConcretePlanService.execute_generation
          → SqlAlchemyTaskRepository.list_open_for_scoring (real DB: PENDING rows for COR_01)
          → SqlAlchemyWindowRepository.list_windows (real DB: AVAILABLE windows for COR_01)
          → stubbed MLScoringServiceAdapter (returns 85.0 for every task)
          → stubbed OptimizerServiceAdapter (schedules all tasks)
          → OptimizerResult
    """

    def _make_plan_service(self, sf: sessionmaker) -> ConcretePlanService:
        return ConcretePlanService(
            task_repo=SqlAlchemyTaskRepository(session_factory=sf),
            window_repo=SqlAlchemyWindowRepository(session_factory=sf),
            plan_repo=_StubPlanRepo(),
            ml=MLScoringServiceAdapter(client=LocalCallableMLClient(_ml_stub)),
            optimizer=OptimizerServiceAdapter(
                client=LocalCallableOptimizerClient(_optimizer_stub)
            ),
        )

    def test_pipeline_reads_correct_open_task_count(self, sf: sessionmaker) -> None:
        """list_open_for_scoring for COR_01 must return exactly 2 PENDING tasks (ids 1, 2)."""
        repo = SqlAlchemyTaskRepository(session_factory=sf)
        scored = repo.list_open_for_scoring(corridor_id="COR_01")
        assert len(scored) == 2
        assert {t.task_id for t in scored} == {1, 2}

    def test_pipeline_reads_correct_window_count(self, sf: sessionmaker) -> None:
        """list_windows for COR_01 in Aug horizon must return 2 windows (W01, W02)."""
        repo = SqlAlchemyWindowRepository(session_factory=sf)
        windows = repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )
        assert len(windows) == 2

    def test_execute_generation_assigns_all_open_tasks(self, sf: sessionmaker) -> None:
        """Full pipeline from real DB through ML + optimizer stubs."""
        plan_service = self._make_plan_service(sf)
        request = PlanGenerateRequest(
            horizon_type=PlanningHorizonType.WEEKLY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
        )

        result = plan_service.execute_generation(plan_id=1, payload=request)

        assert isinstance(result, OptimizerResult)
        # 2 PENDING tasks in COR_01 (ids 1, 2) → both scheduled
        assert len(result.assignments) == 2
        assert result.kpis.total_tasks == 2
        assert result.kpis.scheduled_tasks == 2
        assert result.kpis.unscheduled_tasks == 0

    def test_pipeline_scores_null_criticality_as_zero_for_ml(
        self, sf: sessionmaker
    ) -> None:
        """Task 1 has DB criticality_score=None. list_open_for_scoring must return 0.0
        so the ML service receives a valid float (not None)."""
        repo = SqlAlchemyTaskRepository(session_factory=sf)
        scored = repo.list_open_for_scoring(corridor_id="COR_01")
        task1 = next(t for t in scored if t.task_id == 1)
        assert task1.criticality_score == 0.0  # None → 0.0 for ScoredTask

    def test_pipeline_preserves_scored_criticality_for_ml(
        self, sf: sessionmaker
    ) -> None:
        """Task 2 has DB criticality_score=78.5. list_open_for_scoring preserves this."""
        repo = SqlAlchemyTaskRepository(session_factory=sf)
        scored = repo.list_open_for_scoring(corridor_id="COR_01")
        task2 = next(t for t in scored if t.task_id == 2)
        assert task2.criticality_score == 78.5

    def test_pipeline_assignments_have_correct_corridor(
        self, sf: sessionmaker
    ) -> None:
        """All assignments must be in COR_01 — verifies corridor matching through the pipeline."""
        plan_service = self._make_plan_service(sf)
        request = PlanGenerateRequest(
            horizon_type=PlanningHorizonType.WEEKLY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
        )
        result = plan_service.execute_generation(plan_id=1, payload=request)

        for assignment in result.assignments:
            assert assignment.corridor_id == "COR_01"
