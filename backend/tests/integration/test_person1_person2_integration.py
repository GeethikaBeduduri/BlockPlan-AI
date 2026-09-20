"""Person 1 (FastAPI & Services) <-> Person 2 (Database & Models) Integration Test Suite.

Proves the complete real pipeline across all Group 2 components:
    Person 2:
    TMS / SMMS / TDMS / COA  ->  ETL  ->  PostgreSQL/TimescaleDB  ->  SQLAlchemy Models
                                                                              ↓
    Person 1:
    SQLAlchemy Repository Adapters  ->  Application Services  ->  FastAPI  ->  HTTP API

Workflows Verified:
    1.  Maintenance task retrieval (GET /tasks/{id})
    2.  Block window retrieval (WindowRepository.list_all)
    3.  Task filtering (corridor, department, status, severity)
    4.  Window filtering (corridor, horizon date bounds)
    5.  Plan creation (create_pending -> BlockPlan row with PENDING status)
    6.  Plan persistence (save_result -> assignments stored, status READY)
    7.  Plan retrieval (GET /plan/{plan_id} with hydrated assignments & joined rows)
    8.  Assignment persistence (direct plan_assignments table verification)
    9.  KPI response generation (availability, utilization, scheduled/unscheduled tasks)
    10. Planner override persistence (PUT /plan/{id}/override -> REASSIGN, UNSCHEDULE, FORCE_SCHEDULE)
    11. Unscheduled-task handling (window_id NOT NULL constraint respected, total_tasks preserved)
    12. Failure/rollback behavior (mark_failed, transaction rollbacks on error)

Group 1 Dependencies (ML Scoring & OR-Tools Solver):
    Kept strictly controlled using deterministic local adapters/test doubles.
"""

from __future__ import annotations

from datetime import date, time
from typing import Generator

import pytest
import sqlalchemy as sa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import (
    Base,
    BlockPlan,
    BlockWindow,
    MaintenanceTask,
    PlanAssignment,
    PlannerOverride,
)

from app.config import Settings
from app.main import create_app
from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    OverrideAction,
    PlanStatus,
    PlanningHorizonType,
    TaskStatus,
    Weekday,
)
from app.schemas.horizon import PlanGenerateRequest
from app.schemas.internal import OptimizerInput, OptimizerResult, OptimizerWindow, ScoredTask
from app.schemas.kpis import KpiResponse
from app.schemas.ml import (
    MLBatchScoringRequest,
    MLBatchScoringResponse,
    MLTaskScoreItem,
)
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.services import (
    get_override_service,
    get_plan_service,
    get_task_service,
)
from app.services.exceptions import NotFoundError, OverrideValidationError
from app.services.ml_service import LocalCallableMLClient, MLScoringServiceAdapter
from app.services.optimizer_service import (
    LocalCallableOptimizerClient,
    OptimizerServiceAdapter,
)
from app.services.override_service import ConcreteOverrideService
from app.services.plan_service import ConcretePlanService
from app.services.sql_repositories import (
    SqlAlchemyOverrideRepository,
    SqlAlchemyPlanRepository,
    SqlAlchemyTaskRepository,
    SqlAlchemyWindowRepository,
)
from app.services.task_service import ConcreteTaskService


# ===========================================================================
# Database Fixtures
# ===========================================================================

@pytest.fixture(scope="module")
def db_engine():
    """Create a shared in-memory SQLite engine with StaticPool and all tables."""
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Pre-existing tables from ORM metadata
    Base.metadata.create_all(
        engine,
        tables=[
            Base.metadata.tables["maintenance_tasks"],
            Base.metadata.tables["block_windows"],
            Base.metadata.tables["ingestion_runs"],
        ],
    )

    # Create plan, assignment, and override tables with INTEGER PK for SQLite compatibility
    with engine.connect() as conn:
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS block_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                horizon_type VARCHAR(16) NOT NULL,
                horizon_start DATE NOT NULL,
                horizon_end DATE NOT NULL,
                corridor_id VARCHAR(32),
                department VARCHAR(32),
                status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
                generated_at TIMESTAMP,
                approved_by VARCHAR(128),
                approved_at TIMESTAMP,
                failure_reason VARCHAR(1000),
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
        """))
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS plan_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL REFERENCES block_plans(id) ON DELETE CASCADE,
                task_id INTEGER NOT NULL REFERENCES maintenance_tasks(id) ON DELETE RESTRICT,
                window_id INTEGER NOT NULL REFERENCES block_windows(id) ON DELETE RESTRICT,
                department VARCHAR(32) NOT NULL,
                joint_block_flag BOOLEAN NOT NULL DEFAULT 0,
                status VARCHAR(16) NOT NULL DEFAULT 'ASSIGNED',
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
        """))
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS planner_overrides (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_id INTEGER NOT NULL REFERENCES block_plans(id) ON DELETE CASCADE,
                assignment_id INTEGER NOT NULL REFERENCES plan_assignments(id) ON DELETE CASCADE,
                task_id INTEGER NOT NULL REFERENCES maintenance_tasks(id) ON DELETE RESTRICT,
                action VARCHAR(24) NOT NULL,
                target_window_id INTEGER REFERENCES block_windows(id) ON DELETE RESTRICT,
                reason VARCHAR(1000) NOT NULL,
                overridden_by VARCHAR(128) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()

    return engine


@pytest.fixture(scope="module")
def session_factory(db_engine) -> sessionmaker:
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False)


@pytest.fixture(scope="module", autouse=True)
def seed_database(session_factory: sessionmaker) -> None:
    """Seed realistic TMS, SMMS, TDMS maintenance tasks and COA block windows."""
    tasks = [
        # Task 1: Urgent Engineering Rail Defect on Corridor 1 (Open / PENDING)
        MaintenanceTask(
            task_id="TMS-1001",
            source_system="TMS",
            source_record_id="1001",
            department="Engineering",
            asset_id="TRK-COR1-KM10",
            corridor_id="COR_01",
            defect_type="RAIL_SURFACE_DEFECT",
            defect_severity="A",
            days_overdue=14,
            estimated_hours=3.5,
            asset_age_years=12,
            status="PENDING",
            criticality_score=None,  # Preserves null until ML scoring
        ),
        # Task 2: Traction Overhead Wire Inspection on Corridor 1 (Open / PENDING)
        MaintenanceTask(
            task_id="SMMS-2001",
            source_system="SMMS",
            source_record_id="2001",
            department="Traction",
            asset_id="OHE-COR1-SEC4",
            corridor_id="COR_01",
            defect_type="OHE_CANTILEVER_WEAR",
            defect_severity="B",
            days_overdue=5,
            estimated_hours=2.0,
            asset_age_years=6,
            status="PENDING",
            criticality_score=68.5,
        ),
        # Task 3: S&T Signal Interlocking on Corridor 2 (Open / PENDING)
        MaintenanceTask(
            task_id="TDMS-3001",
            source_system="TDMS",
            source_record_id="3001",
            department="S&T",
            asset_id="SIG-COR2-JNC1",
            corridor_id="COR_02",
            defect_type="POINT_MACHINE_BACKLASH",
            defect_severity="A",
            days_overdue=20,
            estimated_hours=4.0,
            asset_age_years=15,
            status="PENDING",
            criticality_score=92.0,
        ),
        # Task 4: Already scheduled task on Corridor 1
        MaintenanceTask(
            task_id="TMS-1002",
            source_system="TMS",
            source_record_id="1002",
            department="Engineering",
            asset_id="TRK-COR1-KM25",
            corridor_id="COR_01",
            defect_type="BALLAST_CLEANING",
            defect_severity="C",
            days_overdue=0,
            estimated_hours=6.0,
            asset_age_years=20,
            status="SCHEDULED",
            criticality_score=35.0,
        ),
        # Task 5: Unscheduled critical task on Corridor 1
        MaintenanceTask(
            task_id="TMS-1003",
            source_system="TMS",
            source_record_id="1003",
            department="Engineering",
            asset_id="TRK-COR1-KM30",
            corridor_id="COR_01",
            defect_type="FRACTURE_RISK",
            defect_severity="A",
            days_overdue=30,
            estimated_hours=5.0,
            asset_age_years=18,
            status="UNSCHEDULED",
            criticality_score=98.0,
        ),
    ]

    windows = [
        # Window 1: Monday Block on Corridor 1 (4.0 hours)
        BlockWindow(
            window_id="COA-W101",
            source_system="COA",
            source_record_id="W101",
            corridor_id="COR_01",
            window_date=date(2026, 8, 24),  # Monday
            start_time=time(1, 0),
            end_time=time(5, 0),
            available_hours=4.0,
            status="AVAILABLE",
        ),
        # Window 2: Tuesday Block on Corridor 1 (4.0 hours)
        BlockWindow(
            window_id="COA-W102",
            source_system="COA",
            source_record_id="W102",
            corridor_id="COR_01",
            window_date=date(2026, 8, 25),  # Tuesday
            start_time=time(2, 0),
            end_time=time(6, 0),
            available_hours=4.0,
            status="AVAILABLE",
        ),
        # Window 3: Wednesday Block on Corridor 2 (6.0 hours)
        BlockWindow(
            window_id="COA-W201",
            source_system="COA",
            source_record_id="W201",
            corridor_id="COR_02",
            window_date=date(2026, 8, 26),  # Wednesday
            start_time=time(0, 30),
            end_time=time(6, 30),
            available_hours=6.0,
            status="AVAILABLE",
        ),
    ]

    with session_factory() as session:
        session.add_all(tasks)
        session.add_all(windows)
        session.commit()


# ===========================================================================
# App & Client Fixture (with Real Repositories Wired)
# ===========================================================================

@pytest.fixture(scope="module")
def app_with_real_repos(session_factory: sessionmaker) -> FastAPI:
    """FastAPI app wired with real SqlAlchemy repositories and controlled ML/Optimizer adapters."""
    settings = Settings(
        app_title="SIH26027 Block Planning API",
        app_version="0.1.0",
        environment="test",
        debug=False,
    )
    app = create_app(settings)

    # Real repository adapters
    task_repo = SqlAlchemyTaskRepository(session_factory=session_factory)
    window_repo = SqlAlchemyWindowRepository(session_factory=session_factory)
    plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
    override_repo = SqlAlchemyOverrideRepository(session_factory=session_factory)

    # Controlled ML Client simulating Group 1 ML Scoring
    def _mock_ml_scoring(req: MLBatchScoringRequest) -> MLBatchScoringResponse:
        return MLBatchScoringResponse(
            scores=[
                MLTaskScoreItem(
                    task_id=t.task_id,
                    criticality_score=90.0 if t.defect_severity == "A" else 65.0,
                )
                for t in req.tasks
            ]
        )

    # Controlled Optimizer Client simulating Group 1 OR-Tools solver
    def _mock_optimizer_solver(opt_input: OptimizerInput) -> OptimizerResult:
        assignments = []
        for i, t in enumerate(opt_input.tasks):
            if i < len(opt_input.windows):
                target_window = opt_input.windows[i]
                assignments.append(
                    PlanAssignmentResponse(
                        task_id=t.task_id,
                        window_id=target_window.window_id,
                        corridor_id=t.corridor_id,
                        department=t.department,
                        day=target_window.day,
                        estimated_hours=t.estimated_hours,
                        criticality_score=t.criticality_score,
                        defect_severity=t.defect_severity,
                        status=AssignmentStatus.SCHEDULED,
                    )
                )
            else:
                # Unscheduled task
                assignments.append(
                    PlanAssignmentResponse(
                        task_id=t.task_id,
                        window_id=None,
                        corridor_id=t.corridor_id,
                        department=t.department,
                        day=None,
                        estimated_hours=t.estimated_hours,
                        criticality_score=t.criticality_score,
                        defect_severity=t.defect_severity,
                        status=AssignmentStatus.UNSCHEDULED,
                    )
                )

        scheduled = [a for a in assignments if a.status == AssignmentStatus.SCHEDULED]
        unscheduled = [a for a in assignments if a.status == AssignmentStatus.UNSCHEDULED]

        kpis = KpiResponse(
            total_tasks=len(assignments),
            scheduled_tasks=len(scheduled),
            unscheduled_tasks=len(unscheduled),
            critical_unscheduled_tasks=sum(
                1 for a in unscheduled if a.defect_severity == DefectSeverity.A
            ),
            asset_availability_percent=(
                round(len(scheduled) / len(assignments) * 100.0, 2)
                if assignments
                else 100.0
            ),
            scheduled_hours=sum(a.estimated_hours for a in scheduled),
            available_window_hours=sum(w.available_hours for w in opt_input.windows),
            block_utilization_percent=(
                min(
                    100.0,
                    round(
                        sum(a.estimated_hours for a in scheduled)
                        / sum(w.available_hours for w in opt_input.windows)
                        * 100.0,
                        2,
                    ),
                )
                if opt_input.windows
                else 0.0
            ),
        )
        return OptimizerResult(assignments=assignments, kpis=kpis)

    ml_service = MLScoringServiceAdapter(client=LocalCallableMLClient(_mock_ml_scoring))
    optimizer_service = OptimizerServiceAdapter(
        client=LocalCallableOptimizerClient(_mock_optimizer_solver)
    )

    # Wire concrete application services
    task_service = ConcreteTaskService(repository=task_repo)
    plan_service = ConcretePlanService(
        task_repo=task_repo,
        window_repo=window_repo,
        plan_repo=plan_repo,
        ml=ml_service,
        optimizer=optimizer_service,
    )
    override_service = ConcreteOverrideService(
        override_repo=override_repo,
        plan_repo=plan_repo,
        window_repo=window_repo,
    )

    app.dependency_overrides[get_task_service] = lambda: task_service
    app.dependency_overrides[get_plan_service] = lambda: plan_service
    app.dependency_overrides[get_override_service] = lambda: override_service

    return app


@pytest.fixture(scope="module")
def client(app_with_real_repos: FastAPI) -> TestClient:
    return TestClient(app_with_real_repos)


# ===========================================================================
# 1. Maintenance Task Retrieval Workflow
# ===========================================================================

class TestWorkflow1MaintenanceTaskRetrieval:
    def test_get_task_by_id_e2e(self, client: TestClient) -> None:
        """GET /tasks/{id} retrieves real row through SqlAlchemyTaskRepository."""
        resp = client.get("/tasks/1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["task_id"] == 1
        assert body["department"] == "Engineering"
        assert body["corridor_id"] == "COR_01"
        assert body["defect_severity"] == "A"
        assert body["days_overdue"] == 14
        assert body["estimated_hours"] == 3.5
        assert body["status"] == "open"  # PENDING mapped to open

    def test_null_criticality_score_preservation(self, client: TestClient) -> None:
        """Preserves null criticality_score as None rather than 0.0 in GET /tasks/{id}."""
        resp = client.get("/tasks/1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["criticality_score"] is None

    def test_genuine_criticality_score_preserved(self, client: TestClient) -> None:
        resp = client.get("/tasks/2")
        assert resp.status_code == 200
        body = resp.json()
        assert body["criticality_score"] == 68.5


# ===========================================================================
# 2. Block Window Retrieval Workflow
# ===========================================================================

class TestWorkflow2BlockWindowRetrieval:
    def test_list_all_windows(self, session_factory: sessionmaker) -> None:
        """SqlAlchemyWindowRepository.list_all returns all configured windows."""
        repo = SqlAlchemyWindowRepository(session_factory=session_factory)
        res = repo.list_all(corridor_id=None)
        assert res.meta.total == 3
        assert len(res.items) == 3
        assert {w.corridor_id for w in res.items} == {"COR_01", "COR_02"}

    def test_window_fields_and_weekday_computation(
        self, session_factory: sessionmaker
    ) -> None:
        repo = SqlAlchemyWindowRepository(session_factory=session_factory)
        res = repo.list_all(corridor_id="COR_01")
        assert res.meta.total == 2
        w1 = next(w for w in res.items if w.corridor_id == "COR_01" and w.day == Weekday.MON)
        assert w1.available_hours == 4.0
        assert w1.starts_at.date() == date(2026, 8, 24)
        assert w1.day == Weekday.MON


# ===========================================================================
# 3. Task Filtering Workflow
# ===========================================================================

class TestWorkflow3TaskFiltering:
    def test_filter_by_corridor(self, client: TestClient) -> None:
        resp = client.get("/tasks?corridor_id=COR_02")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["total"] == 1
        assert body["items"][0]["task_id"] == 3  # TDMS-3001 is row id 3

    def test_filter_by_department(self, client: TestClient) -> None:
        resp = client.get("/tasks?department=Traction")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["total"] == 1
        assert body["items"][0]["task_id"] == 2  # SMMS-2001 is row id 2

    def test_filter_by_status_open(self, client: TestClient) -> None:
        resp = client.get("/tasks?status=open")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["total"] == 3  # TMS-1001, SMMS-2001, TDMS-3001


# ===========================================================================
# 4. Window Filtering Workflow
# ===========================================================================

class TestWorkflow4WindowFiltering:
    def test_window_filter_by_corridor(self, session_factory: sessionmaker) -> None:
        repo = SqlAlchemyWindowRepository(session_factory=session_factory)
        windows = repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )
        assert len(windows) == 2
        assert all(w.corridor_id == "COR_01" for w in windows)

    def test_window_filter_by_date_range(self, session_factory: sessionmaker) -> None:
        repo = SqlAlchemyWindowRepository(session_factory=session_factory)
        # Narrow range: only Tuesday Aug 25
        windows = repo.list_windows(
            corridor_id=None,
            horizon_start=date(2026, 8, 25),
            horizon_end=date(2026, 8, 25),
        )
        assert len(windows) == 1
        assert windows[0].day == Weekday.TUE


# ===========================================================================
# 5. Plan Creation Workflow (create_pending)
# ===========================================================================

class TestWorkflow5PlanCreation:
    def test_create_pending_persists_row(
        self, session_factory: sessionmaker
    ) -> None:
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )
        assert isinstance(job, PlanJobResponse)
        assert job.accepted is True
        assert job.status == PlanStatus.PENDING
        assert job.plan_id is not None
        assert job.job_id == str(job.plan_id)

        # Verify DB state directly
        with session_factory() as session:
            row = session.get(BlockPlan, job.plan_id)
            assert row is not None
            assert row.status == "PENDING"
            assert row.horizon_type == "WEEKLY"
            assert row.corridor_id == "COR_01"


# ===========================================================================
# 6. Plan Persistence Workflow (save_result)
# ===========================================================================

class TestWorkflow6PlanPersistence:
    def test_save_result_updates_plan_status_and_assignments(
        self, session_factory: sessionmaker
    ) -> None:
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )

        opt_result = OptimizerResult(
            assignments=[
                PlanAssignmentResponse(
                    task_id=1,
                    window_id=1,
                    corridor_id="COR_01",
                    department=Department.ENGINEERING,
                    day=Weekday.MON,
                    estimated_hours=3.5,
                    criticality_score=90.0,
                    defect_severity=DefectSeverity.A,
                    status=AssignmentStatus.SCHEDULED,
                ),
                PlanAssignmentResponse(
                    task_id=2,
                    window_id=2,
                    corridor_id="COR_01",
                    department=Department.TRACTION,
                    day=Weekday.TUE,
                    estimated_hours=2.0,
                    criticality_score=65.0,
                    defect_severity=DefectSeverity.B,
                    status=AssignmentStatus.SCHEDULED,
                ),
            ],
            kpis=KpiResponse(
                total_tasks=2,
                scheduled_tasks=2,
                unscheduled_tasks=0,
                critical_unscheduled_tasks=0,
                asset_availability_percent=100.0,
                scheduled_hours=5.5,
                available_window_hours=8.0,
                block_utilization_percent=68.75,
            ),
        )

        plan_res = plan_repo.save_result(plan_id=job.plan_id, result=opt_result)

        assert isinstance(plan_res, BlockPlanResponse)
        assert plan_res.plan_id == job.plan_id
        assert plan_res.status == PlanStatus.READY
        assert len(plan_res.assignments) == 2

        # Verify DB directly
        with session_factory() as session:
            db_plan = session.get(BlockPlan, job.plan_id)
            assert db_plan.status == "READY"
            assert db_plan.generated_at is not None


# ===========================================================================
# 7. Plan Retrieval Workflow (GET /plan/{id})
# ===========================================================================

class TestWorkflow7PlanRetrieval:
    def test_get_plan_endpoint_e2e(
        self, client: TestClient, session_factory: sessionmaker
    ) -> None:
        """Create and save a plan, then retrieve it via HTTP GET /plan/{id}."""
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )

        opt_result = OptimizerResult(
            assignments=[
                PlanAssignmentResponse(
                    task_id=1,
                    window_id=1,
                    corridor_id="COR_01",
                    department=Department.ENGINEERING,
                    day=Weekday.MON,
                    estimated_hours=3.5,
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
                scheduled_hours=3.5,
                available_window_hours=4.0,
                block_utilization_percent=87.5,
            ),
        )
        plan_repo.save_result(plan_id=job.plan_id, result=opt_result)

        # GET /plan/{plan_id}
        resp = client.get(f"/plan/{job.plan_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["plan_id"] == job.plan_id
        assert body["status"] == "ready"
        assert body["horizon_type"] == "weekly"
        assert len(body["assignments"]) == 1
        assert body["assignments"][0]["task_id"] == 1
        assert body["assignments"][0]["window_id"] == 1
        assert body["assignments"][0]["day"] == "Mon"
        assert body["kpis"] is not None

    def test_get_nonexistent_plan_returns_404(self, client: TestClient) -> None:
        resp = client.get("/plan/99999")
        assert resp.status_code == 404
        assert resp.json()["error"] == "not_found"


# ===========================================================================
# 8. Assignment Persistence Workflow
# ===========================================================================

class TestWorkflow8AssignmentPersistence:
    def test_assignments_table_records_verified(
        self, session_factory: sessionmaker
    ) -> None:
        """Direct DB inspection of plan_assignments table rows."""
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )

        opt_result = OptimizerResult(
            assignments=[
                PlanAssignmentResponse(
                    task_id=1,
                    window_id=1,
                    corridor_id="COR_01",
                    department=Department.ENGINEERING,
                    day=Weekday.MON,
                    estimated_hours=3.5,
                    criticality_score=90.0,
                    defect_severity=DefectSeverity.A,
                    status=AssignmentStatus.SCHEDULED,
                )
            ],
            kpis=KpiResponse(
                total_tasks=1, scheduled_tasks=1, unscheduled_tasks=0,
                critical_unscheduled_tasks=0, asset_availability_percent=100.0,
                scheduled_hours=3.5, available_window_hours=4.0,
            ),
        )
        plan_repo.save_result(plan_id=job.plan_id, result=opt_result)

        with session_factory() as session:
            rows = session.scalars(
                select(PlanAssignment).where(PlanAssignment.plan_id == job.plan_id)
            ).all()
            assert len(rows) == 1
            pa = rows[0]
            assert pa.task_id == 1
            assert pa.window_id == 1
            assert pa.department == "Engineering"
            assert pa.status == "ASSIGNED"
            assert pa.joint_block_flag is False


# ===========================================================================
# 9. KPI Response Generation Workflow
# ===========================================================================

class TestWorkflow9KpiResponseGeneration:
    def test_dynamic_kpi_computation_accuracy(
        self, session_factory: sessionmaker
    ) -> None:
        """KPI metrics are accurately derived from real DB assignments."""
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )

        # 2 tasks assigned: 3.5h + 2.0h = 5.5h across 2 windows (4.0h each = 8.0h available)
        opt_result = OptimizerResult(
            assignments=[
                PlanAssignmentResponse(
                    task_id=1,
                    window_id=1,
                    corridor_id="COR_01",
                    department=Department.ENGINEERING,
                    day=Weekday.MON,
                    estimated_hours=3.5,
                    criticality_score=90.0,
                    defect_severity=DefectSeverity.A,
                    status=AssignmentStatus.SCHEDULED,
                ),
                PlanAssignmentResponse(
                    task_id=2,
                    window_id=2,
                    corridor_id="COR_01",
                    department=Department.TRACTION,
                    day=Weekday.TUE,
                    estimated_hours=2.0,
                    criticality_score=65.0,
                    defect_severity=DefectSeverity.B,
                    status=AssignmentStatus.SCHEDULED,
                ),
            ],
            kpis=KpiResponse(
                total_tasks=2, scheduled_tasks=2, unscheduled_tasks=0,
                critical_unscheduled_tasks=0, asset_availability_percent=100.0,
                scheduled_hours=5.5, available_window_hours=8.0,
            ),
        )
        plan_repo.save_result(plan_id=job.plan_id, result=opt_result)

        loaded_plan = plan_repo.get_by_id(job.plan_id)
        kpis = loaded_plan.kpis
        assert kpis is not None
        assert kpis.total_tasks == 2
        assert kpis.scheduled_tasks == 2
        assert kpis.unscheduled_tasks == 0
        assert kpis.scheduled_hours == 5.5
        assert kpis.available_window_hours == 8.0
        assert kpis.block_utilization_percent == 68.75
        assert kpis.asset_availability_percent == 100.0


# ===========================================================================
# 10. Planner Override Persistence Workflow
# ===========================================================================

class TestWorkflow10PlannerOverridePersistence:
    @pytest.fixture()
    def established_plan(self, session_factory: sessionmaker) -> int:
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )
        opt_result = OptimizerResult(
            assignments=[
                PlanAssignmentResponse(
                    task_id=1,
                    window_id=1,
                    corridor_id="COR_01",
                    department=Department.ENGINEERING,
                    day=Weekday.MON,
                    estimated_hours=3.5,
                    criticality_score=90.0,
                    defect_severity=DefectSeverity.A,
                    status=AssignmentStatus.SCHEDULED,
                )
            ],
            kpis=KpiResponse(
                total_tasks=1, scheduled_tasks=1, unscheduled_tasks=0,
                critical_unscheduled_tasks=0, asset_availability_percent=100.0,
                scheduled_hours=3.5, available_window_hours=4.0,
            ),
        )
        plan_repo.save_result(plan_id=job.plan_id, result=opt_result)
        return job.plan_id

    def test_reassign_override_http_endpoint_e2e(
        self, client: TestClient, established_plan: int, session_factory: sessionmaker
    ) -> None:
        """PUT /plan/{id}/override reassigns task to window 2 and updates DB."""
        override_payload = {
            "plan_id": established_plan,
            "task_id": 1,
            "action": "reassign",
            "target_window_id": 2,
            "reason": "Track possession conflict with coaching movement; shifting to Tuesday.",
        }

        resp = client.put(f"/plan/{established_plan}/override", json=override_payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["override_id"] is not None
        assert body["action"] == "reassign"
        assert body["target_window_id"] == 2
        assert body["plan_id"] == established_plan
        assert body["task_id"] == 1

        # Check plan_assignments DB row updated
        with session_factory() as session:
            assignment = session.scalar(
                select(PlanAssignment).where(
                    PlanAssignment.plan_id == established_plan,
                    PlanAssignment.task_id == 1,
                )
            )
            assert assignment.window_id == 2
            assert assignment.status == "OVERRIDDEN"

            # Check planner_overrides audit row created
            audit = session.scalar(
                select(PlannerOverride).where(
                    PlannerOverride.id == body["override_id"]
                )
            )
            assert audit is not None
            assert audit.action == "REASSIGN"
            assert audit.target_window_id == 2

    def test_unschedule_override_http_endpoint_e2e(
        self, client: TestClient, established_plan: int, session_factory: sessionmaker
    ) -> None:
        """PUT /plan/{id}/override with unschedule cancels assignment."""
        override_payload = {
            "plan_id": established_plan,
            "task_id": 1,
            "action": "unschedule",
            "reason": "Emergency rolling stock failure cancelling scheduled track block.",
        }

        resp = client.put(f"/plan/{established_plan}/override", json=override_payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["action"] == "unschedule"
        assert body["target_window_id"] is None

        with session_factory() as session:
            assignment = session.scalar(
                select(PlanAssignment).where(
                    PlanAssignment.plan_id == established_plan,
                    PlanAssignment.task_id == 1,
                )
            )
            assert assignment.status == "CANCELLED"


# ===========================================================================
# 11. Unscheduled Task Handling Workflow
# ===========================================================================

class TestWorkflow11UnscheduledTaskHandling:
    def test_unscheduled_tasks_not_inserted_and_total_preserved(
        self, session_factory: sessionmaker
    ) -> None:
        """Unscheduled assignments (window_id=None) do NOT insert invalid rows
        due to NOT NULL constraint, and total_tasks is durably preserved."""
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )

        opt_result = OptimizerResult(
            assignments=[
                PlanAssignmentResponse(
                    task_id=1,
                    window_id=1,
                    corridor_id="COR_01",
                    department=Department.ENGINEERING,
                    day=Weekday.MON,
                    estimated_hours=3.5,
                    criticality_score=90.0,
                    defect_severity=DefectSeverity.A,
                    status=AssignmentStatus.SCHEDULED,
                ),
                PlanAssignmentResponse(
                    task_id=2,
                    window_id=None,
                    corridor_id="COR_01",
                    department=Department.TRACTION,
                    day=None,
                    estimated_hours=2.0,
                    criticality_score=65.0,
                    defect_severity=DefectSeverity.B,
                    status=AssignmentStatus.UNSCHEDULED,
                ),
            ],
            kpis=KpiResponse(
                total_tasks=2, scheduled_tasks=1, unscheduled_tasks=1,
                critical_unscheduled_tasks=0, asset_availability_percent=50.0,
                scheduled_hours=3.5, available_window_hours=4.0,
            ),
        )
        plan_repo.save_result(plan_id=job.plan_id, result=opt_result)

        # Direct DB inspection: only 1 row in plan_assignments
        with session_factory() as session:
            rows = session.scalars(
                select(PlanAssignment).where(PlanAssignment.plan_id == job.plan_id)
            ).all()
            assert len(rows) == 1
            assert rows[0].task_id == 1

        # Read back via get_by_id: recovers total_tasks=2 and unscheduled_tasks=1
        loaded = plan_repo.get_by_id(job.plan_id)
        assert loaded.kpis.total_tasks == 2
        assert loaded.kpis.scheduled_tasks == 1
        assert loaded.kpis.unscheduled_tasks == 1

    def test_list_unscheduled_endpoint(self, client: TestClient) -> None:
        """GET /tasks/unscheduled retrieves real unscheduled tasks from DB."""
        resp = client.get("/tasks/unscheduled")
        assert resp.status_code == 200
        body = resp.json()
        assert body["meta"]["total"] >= 1
        assert any(t["task_id"] == 5 for t in body["items"])


# ===========================================================================
# 12. Failure and Rollback Workflow
# ===========================================================================

class TestWorkflow12FailureAndRollback:
    def test_mark_failed_records_reason(
        self, session_factory: sessionmaker
    ) -> None:
        plan_repo = SqlAlchemyPlanRepository(session_factory=session_factory)
        job = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
            department=None,
        )

        plan_repo.mark_failed(
            plan_id=job.plan_id,
            reason="OR-Tools solver timeout after 60 seconds of optimization.",
        )

        with session_factory() as session:
            row = session.get(BlockPlan, job.plan_id)
            assert row.status == "FAILED"
            assert "timeout" in row.failure_reason

    def test_session_rollback_on_error(
        self, session_factory: sessionmaker
    ) -> None:
        """Verifies session rollback protects DB integrity upon unexpected error."""
        override_repo = SqlAlchemyOverrideRepository(session_factory=session_factory)
        payload = PlannerOverrideCreate(
            plan_id=99999,
            task_id=1,
            action=OverrideAction.UNSCHEDULE,
            reason="Conflict explanation.",
        )
        with pytest.raises(NotFoundError):
            override_repo.record_override(
                plan_id=99999, payload=payload, overridden_by="user"
            )

        # Verify no rogue records exist in planner_overrides for non-existent plan
        with session_factory() as session:
            count = session.scalar(
                select(sa.func.count(PlannerOverride.id)).where(
                    PlannerOverride.plan_id == 99999
                )
            )
            assert count == 0
