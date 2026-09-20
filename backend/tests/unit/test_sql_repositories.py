"""Unit tests for SqlAlchemyTaskRepository and SqlAlchemyWindowRepository.

Uses an in-memory SQLite engine to test all repository queries, enum mappings,
filters, pagination, null-criticality preservation, and error handling without
requiring external services.
"""

from __future__ import annotations

from datetime import date, time

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from database.models import Base, BlockWindow, MaintenanceTask

from app.schemas.common import PaginationParams
from app.schemas.enums import DefectSeverity, Department, TaskStatus, Weekday
from app.services.exceptions import NotFoundError
from app.services.sql_repositories import (
    SqlAlchemyTaskRepository,
    SqlAlchemyWindowRepository,
)


@pytest.fixture
def db_session() -> Session:
    """Create an isolated in-memory SQLite database and yield an active session."""
    engine = create_engine("sqlite+pysqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def populated_db(db_session: Session) -> Session:
    """Seed the database with known tasks and block windows."""
    tasks = [
        MaintenanceTask(
            task_id="TMS-101",
            source_system="TMS",
            source_record_id="101",
            department="Engineering",
            asset_id="TRK-01",
            corridor_id="COR_01",
            defect_type="RAIL_FRACTURE",
            defect_severity="A",
            days_overdue=10,
            estimated_hours=4.0,
            asset_age_years=8,
            status="PENDING",
            criticality_score=None,  # Unscored
        ),
        MaintenanceTask(
            task_id="SMMS-202",
            source_system="SMMS",
            source_record_id="202",
            department="S&T",
            asset_id="SIG-05",
            corridor_id="COR_01",
            defect_type="SIGNAL_FAILURE",
            defect_severity="B",
            days_overdue=3,
            estimated_hours=2.5,
            asset_age_years=4,
            status="PENDING",
            criticality_score=78.5,  # Pre-scored
        ),
        MaintenanceTask(
            task_id="TDMS-303",
            source_system="TDMS",
            source_record_id="303",
            department="Traction",
            asset_id="OHE-12",
            corridor_id="COR_02",
            defect_type="OHE_FAULT",
            defect_severity="A",
            days_overdue=15,
            estimated_hours=5.0,
            asset_age_years=12,
            status="UNSCHEDULED",
            criticality_score=95.0,
        ),
        MaintenanceTask(
            task_id="TMS-404",
            source_system="TMS",
            source_record_id="404",
            department="Engineering",
            asset_id="TRK-09",
            corridor_id="COR_02",
            defect_type="SLEEPER_DEFECT",
            defect_severity="C",
            days_overdue=1,
            estimated_hours=1.5,
            asset_age_years=2,
            status="UNSCHEDULED",
            criticality_score=30.0,
        ),
        MaintenanceTask(
            task_id="TDMS-505",
            source_system="TDMS",
            source_record_id="505",
            department="Traction",
            asset_id="OHE-99",
            corridor_id="COR_01",
            defect_type="CANTILEVER_CRACK",
            defect_severity="B",
            days_overdue=0,
            estimated_hours=3.0,
            asset_age_years=6,
            status="COMPLETED",
            criticality_score=50.0,
        ),
    ]

    windows = [
        BlockWindow(
            window_id="COA-W1",
            source_system="COA",
            source_record_id="W1",
            corridor_id="COR_01",
            window_date=date(2026, 8, 24),  # Monday
            start_time=time(1, 0),
            end_time=time(5, 0),
            available_hours=4.0,
            status="AVAILABLE",
        ),
        BlockWindow(
            window_id="COA-W2",
            source_system="COA",
            source_record_id="W2",
            corridor_id="COR_01",
            window_date=date(2026, 8, 26),  # Wednesday
            start_time=time(2, 0),
            end_time=time(6, 0),
            available_hours=4.0,
            status="AVAILABLE",
        ),
        BlockWindow(
            window_id="COA-W3",
            source_system="COA",
            source_record_id="W3",
            corridor_id="COR_02",
            window_date=date(2026, 8, 25),  # Tuesday
            start_time=time(0, 30),
            end_time=time(4, 30),
            available_hours=4.0,
            status="AVAILABLE",
        ),
        BlockWindow(
            window_id="COA-W4",
            source_system="COA",
            source_record_id="W4",
            corridor_id="COR_01",
            window_date=date(2026, 9, 15),  # Outside August horizon
            start_time=time(1, 0),
            end_time=time(5, 0),
            available_hours=4.0,
            status="AVAILABLE",
        ),
    ]

    for t in tasks:
        db_session.add(t)
    for w in windows:
        db_session.add(w)
    db_session.commit()
    return db_session


# ---------------------------------------------------------------------------
# Task Repository Tests
# ---------------------------------------------------------------------------

class TestSqlAlchemyTaskRepository:
    def test_get_task_by_id_success(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        task = repo.get_by_id(1)

        assert task.task_id == 1
        assert task.department == Department.ENGINEERING
        assert task.corridor_id == "COR_01"
        assert task.defect_severity == DefectSeverity.A
        assert task.days_overdue == 10
        assert task.estimated_hours == 4.0
        assert task.asset_age_years == 8
        assert task.status == TaskStatus.OPEN

    def test_get_task_by_id_not_found(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        with pytest.raises(NotFoundError, match="Maintenance task 999 not found"):
            repo.get_by_id(999)

    def test_get_task_preserves_null_criticality_score(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        task = repo.get_by_id(1)
        # Row 1 has None criticality_score in DB - must be preserved as None in schema
        assert task.criticality_score is None

    def test_get_task_preserves_genuine_criticality_score(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        task = repo.get_by_id(2)
        # Row 2 has 78.5 in DB
        assert task.criticality_score == 78.5

    def test_list_tasks_pagination(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        result = repo.list_tasks(pagination=PaginationParams(limit=2, offset=0))

        assert len(result.items) == 2
        assert result.meta.total == 5
        assert result.meta.limit == 2
        assert result.meta.offset == 0
        assert result.items[0].task_id == 1
        assert result.items[1].task_id == 2

        # Second page
        page_2 = repo.list_tasks(pagination=PaginationParams(limit=2, offset=2))
        assert len(page_2.items) == 2
        assert page_2.items[0].task_id == 3

    def test_list_tasks_corridor_filter(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        result = repo.list_tasks(
            pagination=PaginationParams(limit=50, offset=0),
            corridor_id="COR_01",
        )

        assert result.meta.total == 3
        for item in result.items:
            assert item.corridor_id == "COR_01"

    def test_list_tasks_department_filter(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        result = repo.list_tasks(
            pagination=PaginationParams(limit=50, offset=0),
            department=Department.TRACTION,
        )

        assert result.meta.total == 2
        for item in result.items:
            assert item.department == Department.TRACTION

    def test_list_tasks_status_mapping_and_filter(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)

        # Filtering status=TaskStatus.OPEN should match DB rows with "PENDING"
        open_res = repo.list_tasks(
            pagination=PaginationParams(limit=50, offset=0),
            status=TaskStatus.OPEN,
        )
        assert open_res.meta.total == 2
        for item in open_res.items:
            assert item.status == TaskStatus.OPEN

        # Filtering status=TaskStatus.COMPLETED
        comp_res = repo.list_tasks(
            pagination=PaginationParams(limit=50, offset=0),
            status=TaskStatus.COMPLETED,
        )
        assert comp_res.meta.total == 1
        assert comp_res.items[0].task_id == 5

    def test_list_unscheduled_returns_unscheduled_tasks(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        result = repo.list_unscheduled(
            pagination=PaginationParams(limit=50, offset=0),
            critical_only=False,
        )

        assert result.meta.total == 2
        for item in result.items:
            assert item.status == TaskStatus.UNSCHEDULED

    def test_list_unscheduled_critical_only(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        result = repo.list_unscheduled(
            pagination=PaginationParams(limit=50, offset=0),
            critical_only=True,
        )

        # Only task 3 is UNSCHEDULED and Severity A
        assert result.meta.total == 1
        assert result.items[0].task_id == 3
        assert result.items[0].defect_severity == DefectSeverity.A

    def test_list_open_for_scoring(self, populated_db: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=populated_db)
        scored_tasks = repo.list_open_for_scoring(corridor_id="COR_01")

        assert len(scored_tasks) == 2
        # Task 1 was unscored (None in DB) -> becomes 0.0 in ScoredTask
        assert scored_tasks[0].task_id == 1
        assert scored_tasks[0].criticality_score == 0.0

        # Task 2 had 78.5 in DB -> preserved in ScoredTask
        assert scored_tasks[1].task_id == 2
        assert scored_tasks[1].criticality_score == 78.5

    def test_empty_tasks_table(self, db_session: Session) -> None:
        repo = SqlAlchemyTaskRepository(session=db_session)
        res = repo.list_tasks(pagination=PaginationParams(limit=10, offset=0))
        assert res.meta.total == 0
        assert res.items == []

        unsched = repo.list_unscheduled(pagination=PaginationParams(limit=10, offset=0))
        assert unsched.meta.total == 0
        assert unsched.items == []

        assert repo.list_open_for_scoring() == []


# ---------------------------------------------------------------------------
# Window Repository Tests
# ---------------------------------------------------------------------------

class TestSqlAlchemyWindowRepository:
    def test_list_windows_date_range(self, populated_db: Session) -> None:
        repo = SqlAlchemyWindowRepository(session=populated_db)
        windows = repo.list_windows(
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )

        # 3 windows fall within Aug 24-30 (W1, W2, W3). W4 is in September.
        assert len(windows) == 3
        assert windows[0].window_id == 1
        assert windows[0].corridor_id == "COR_01"
        assert windows[0].day == Weekday.MON
        assert windows[0].available_hours == 4.0

    def test_list_windows_corridor_filter(self, populated_db: Session) -> None:
        repo = SqlAlchemyWindowRepository(session=populated_db)
        windows = repo.list_windows(
            corridor_id="COR_01",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )

        assert len(windows) == 2
        for w in windows:
            assert w.corridor_id == "COR_01"

    def test_window_datetime_bounds_and_weekday(self, populated_db: Session) -> None:
        repo = SqlAlchemyWindowRepository(session=populated_db)
        windows = repo.list_windows(
            corridor_id="COR_02",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )

        assert len(windows) == 1
        w = windows[0]
        assert w.window_id == 3
        assert w.day == Weekday.TUE  # 2026-08-25 is Tuesday
        assert w.starts_at.hour == 0
        assert w.starts_at.minute == 30
        assert w.ends_at.hour == 4
        assert w.ends_at.minute == 30

    def test_list_all_windows(self, populated_db: Session) -> None:
        repo = SqlAlchemyWindowRepository(session=populated_db)
        res = repo.list_all()

        assert res.meta.total == 4
        assert len(res.items) == 4
        assert res.items[0].window_id == 1
        assert res.items[0].day == Weekday.MON

    def test_list_all_windows_corridor_filter(self, populated_db: Session) -> None:
        repo = SqlAlchemyWindowRepository(session=populated_db)
        res = repo.list_all(corridor_id="COR_02")

        assert res.meta.total == 1
        assert res.items[0].corridor_id == "COR_02"

    def test_empty_windows_table(self, db_session: Session) -> None:
        repo = SqlAlchemyWindowRepository(session=db_session)
        windows = repo.list_windows(
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
        )
        assert windows == []

        res = repo.list_all()
        assert res.meta.total == 0
        assert res.items == []


# ===========================================================================
# SqlAlchemyPlanRepository tests
# ===========================================================================

from datetime import date, time  # noqa: E402  (already imported above)
from app.schemas.assignments import PlanAssignmentResponse  # noqa: E402
from app.schemas.enums import AssignmentStatus, PlanStatus, PlanningHorizonType  # noqa: E402
from app.schemas.internal import OptimizerResult  # noqa: E402
from app.schemas.kpis import KpiResponse  # noqa: E402
from app.schemas.plans import BlockPlanResponse, PlanJobResponse  # noqa: E402
from app.services.sql_repositories import SqlAlchemyPlanRepository  # noqa: E402
from database.models import BlockPlan, PlanAssignment  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures — isolated DB per test (function scope)
# ---------------------------------------------------------------------------

@pytest.fixture()
def plan_session() -> Session:
    """Per-test isolated in-memory SQLite DB with all tables created.

    SQLite only supports autoincrement on 'INTEGER PRIMARY KEY' columns, not
    'BIGINT PRIMARY KEY'.  BlockPlan and PlanAssignment use BigInteger PKs for
    PostgreSQL.  We work around this by issuing raw DDL with INTEGER PKs for
    those two tables only; the ORM mapper still works because SQLAlchemy's
    identity map uses the Python ``int`` type regardless of the SQL type name.
    """
    import sqlalchemy as sa

    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )

    # Create task/window/ingestion tables via ORM (they use Integer PKs — fine)
    Base.metadata.create_all(
        engine,
        tables=[
            Base.metadata.tables["maintenance_tasks"],
            Base.metadata.tables["block_windows"],
            Base.metadata.tables["ingestion_runs"],
        ],
    )

    # Create plan-layer tables with INTEGER PKs (SQLite autoincrement compatible)
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

    sf = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = sf()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def plan_repo(plan_session: Session) -> SqlAlchemyPlanRepository:
    """PlanRepository wired directly to the in-memory session."""
    return SqlAlchemyPlanRepository(session=plan_session)


@pytest.fixture()
def seeded_task_window(plan_session: Session):
    """Insert one MaintenanceTask and one BlockWindow; return (task, window)."""
    task = MaintenanceTask(
        task_id="TMS-PLAN-01", source_system="TMS", source_record_id="P01",
        department="Engineering", asset_id="TRK-01", corridor_id="COR_01",
        defect_type="RAIL_DEFECT", defect_severity="A",
        days_overdue=10, estimated_hours=4.0, asset_age_years=8,
        status="PENDING", criticality_score=75.0,
    )
    window = BlockWindow(
        window_id="COA-P-W01", source_system="COA", source_record_id="PW01",
        corridor_id="COR_01", window_date=date(2026, 9, 7),  # Monday
        start_time=time(1, 0), end_time=time(5, 0),
        available_hours=4.0, status="AVAILABLE",
    )
    plan_session.add_all([task, window])
    plan_session.commit()
    plan_session.refresh(task)
    plan_session.refresh(window)
    return task, window


def _make_scheduled_result(task, window) -> OptimizerResult:
    """Build a minimal OptimizerResult with one SCHEDULED assignment."""
    assignment = PlanAssignmentResponse(
        task_id=task.id,
        window_id=window.id,
        corridor_id="COR_01",
        department=Department.ENGINEERING,
        day=Weekday.MON,
        estimated_hours=task.estimated_hours,
        criticality_score=task.criticality_score,
        defect_severity=DefectSeverity.A,
        status=AssignmentStatus.SCHEDULED,
    )
    kpis = KpiResponse(
        total_tasks=1,
        scheduled_tasks=1,
        unscheduled_tasks=0,
        critical_unscheduled_tasks=0,
        asset_availability_percent=100.0,
        scheduled_hours=4.0,
        available_window_hours=4.0,
    )
    return OptimizerResult(assignments=[assignment], kpis=kpis)


def _make_unscheduled_result(task) -> OptimizerResult:
    """Build an OptimizerResult where the task is UNSCHEDULED (window_id=None)."""
    assignment = PlanAssignmentResponse(
        task_id=task.id,
        window_id=None,
        corridor_id="COR_01",
        department=Department.ENGINEERING,
        day=None,
        estimated_hours=task.estimated_hours,
        criticality_score=task.criticality_score if task.criticality_score else 0.0,
        defect_severity=DefectSeverity.A,
        status=AssignmentStatus.UNSCHEDULED,
    )
    kpis = KpiResponse(
        total_tasks=1,
        scheduled_tasks=0,
        unscheduled_tasks=1,
        critical_unscheduled_tasks=1,
        asset_availability_percent=0.0,
        scheduled_hours=0.0,
        available_window_hours=0.0,
    )
    return OptimizerResult(assignments=[assignment], kpis=kpis)


# ---------------------------------------------------------------------------
# create_pending
# ---------------------------------------------------------------------------

class TestCreatePending:
    def test_returns_plan_job_response(self, plan_repo: SqlAlchemyPlanRepository) -> None:
        result = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        assert isinstance(result, PlanJobResponse)
        assert result.accepted is True
        assert result.status == PlanStatus.PENDING
        assert result.plan_id is not None

    def test_job_id_matches_plan_id(self, plan_repo: SqlAlchemyPlanRepository) -> None:
        result = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id=None,
            department=None,
        )
        assert result.job_id == str(result.plan_id)

    def test_row_is_written_to_block_plans(
        self, plan_repo: SqlAlchemyPlanRepository, plan_session: Session
    ) -> None:
        result = plan_repo.create_pending(
            horizon_type="daily",
            horizon_start=date(2026, 9, 1),
            horizon_end=date(2026, 9, 1),
            corridor_id="COR_02",
            department=Department.TRACTION,
        )
        row = plan_session.get(BlockPlan, result.plan_id)
        assert row is not None
        assert row.status == "PENDING"
        assert row.horizon_type == "DAILY"   # DB stores uppercase
        assert row.corridor_id == "COR_02"
        assert row.department == "Traction"

    def test_multiple_pending_plans_get_distinct_ids(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        r1 = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id=None,
            department=None,
        )
        r2 = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 14),
            horizon_end=date(2026, 9, 20),
            corridor_id=None,
            department=None,
        )
        assert r1.plan_id != r2.plan_id


# ---------------------------------------------------------------------------
# save_result — scheduled assignments
# ---------------------------------------------------------------------------

class TestSaveResultScheduled:
    def test_returns_block_plan_response(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        result = _make_scheduled_result(task, window)
        response = plan_repo.save_result(plan_id=handle.plan_id, result=result)

        assert isinstance(response, BlockPlanResponse)
        assert response.plan_id == handle.plan_id
        assert response.status == PlanStatus.READY

    def test_assignment_row_written_to_db(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
        plan_session: Session,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_scheduled_result(task, window)
        )

        rows = plan_session.query(PlanAssignment).filter_by(
            plan_id=handle.plan_id
        ).all()
        assert len(rows) == 1
        assert rows[0].task_id == task.id
        assert rows[0].window_id == window.id
        assert rows[0].status == "ASSIGNED"

    def test_plan_status_updated_to_ready(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
        plan_session: Session,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_scheduled_result(task, window)
        )
        plan_session.expire_all()
        row = plan_session.get(BlockPlan, handle.plan_id)
        assert row.status == "READY"
        assert row.generated_at is not None

    def test_response_contains_hydrated_assignment(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        response = plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_scheduled_result(task, window)
        )
        assert len(response.assignments) == 1
        a = response.assignments[0]
        assert a.task_id == task.id
        assert a.window_id == window.id
        assert a.status == AssignmentStatus.SCHEDULED
        assert a.day == Weekday.MON   # 2026-09-07 is Monday
        assert a.corridor_id == "COR_01"
        assert a.estimated_hours == 4.0
        assert a.criticality_score == 75.0

    def test_kpis_computed_correctly(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        response = plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_scheduled_result(task, window)
        )
        kpis = response.kpis
        assert kpis is not None
        assert kpis.total_tasks == 1
        assert kpis.scheduled_tasks == 1
        assert kpis.unscheduled_tasks == 0
        assert kpis.asset_availability_percent == 100.0
        assert kpis.scheduled_hours == 4.0
        assert kpis.available_window_hours == 4.0
        assert kpis.block_utilization_percent == 100.0

    def test_save_result_not_found_raises(
        self, plan_repo: SqlAlchemyPlanRepository, seeded_task_window
    ) -> None:
        task, window = seeded_task_window
        from app.services.exceptions import NotFoundError
        with pytest.raises(NotFoundError):
            plan_repo.save_result(
                plan_id=99999,
                result=_make_scheduled_result(task, window),
            )


# ---------------------------------------------------------------------------
# Unscheduled task handling
# ---------------------------------------------------------------------------

class TestUnscheduledTaskHandling:
    def test_unscheduled_assignment_is_not_written_to_db(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
        plan_session: Session,
    ) -> None:
        """UNSCHEDULED tasks must NOT produce a row in plan_assignments (window_id NOT NULL)."""
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_unscheduled_result(task)
        )

        rows = plan_session.query(PlanAssignment).filter_by(
            plan_id=handle.plan_id
        ).all()
        assert len(rows) == 0, (
            "UNSCHEDULED assignments must not be stored (window_id NOT NULL)"
        )

    def test_unscheduled_total_tasks_preserved_via_side_channel(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
        plan_session: Session,
    ) -> None:
        """total_tasks from the optimizer must be durably stored so get_by_id can
        compute unscheduled_tasks = total - scheduled."""
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_unscheduled_result(task)
        )
        plan_session.expire_all()
        row = plan_session.get(BlockPlan, handle.plan_id)
        # Side-channel must encode total_tasks=1
        assert row.failure_reason is not None
        assert row.failure_reason.startswith("__ttl:")
        assert int(row.failure_reason[len("__ttl:"):]) == 1

    def test_get_by_id_reports_unscheduled_count(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
    ) -> None:
        """get_by_id must correctly compute unscheduled_tasks from side-channel."""
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_unscheduled_result(task)
        )

        loaded = plan_repo.get_by_id(handle.plan_id)
        assert loaded.kpis is not None
        assert loaded.kpis.total_tasks == 1
        assert loaded.kpis.scheduled_tasks == 0
        assert loaded.kpis.unscheduled_tasks == 1
        assert loaded.assignments == []   # No rows were stored


# ---------------------------------------------------------------------------
# mark_failed
# ---------------------------------------------------------------------------

class TestMarkFailed:
    def test_flips_status_to_failed(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        plan_session: Session,
    ) -> None:
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id=None,
            department=None,
        )
        plan_repo.mark_failed(plan_id=handle.plan_id, reason="Solver timed out")

        plan_session.expire_all()
        row = plan_session.get(BlockPlan, handle.plan_id)
        assert row.status == "FAILED"
        assert row.failure_reason == "Solver timed out"

    def test_failure_reason_truncated_to_1000_chars(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        plan_session: Session,
    ) -> None:
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id=None,
            department=None,
        )
        long_reason = "X" * 2000
        plan_repo.mark_failed(plan_id=handle.plan_id, reason=long_reason)

        plan_session.expire_all()
        row = plan_session.get(BlockPlan, handle.plan_id)
        assert len(row.failure_reason) == 1000

    def test_mark_failed_not_found_raises(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        from app.services.exceptions import NotFoundError
        with pytest.raises(NotFoundError):
            plan_repo.mark_failed(plan_id=99999, reason="irrelevant")


# ---------------------------------------------------------------------------
# get_by_id
# ---------------------------------------------------------------------------

class TestGetById:
    def test_pending_plan_has_no_kpis(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        response = plan_repo.get_by_id(handle.plan_id)

        assert response.plan_id == handle.plan_id
        assert response.status == PlanStatus.PENDING
        assert response.assignments == []
        assert response.kpis is None

    def test_ready_plan_has_kpis(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_scheduled_result(task, window)
        )
        response = plan_repo.get_by_id(handle.plan_id)

        assert response.status == PlanStatus.READY
        assert response.kpis is not None
        assert response.kpis.total_tasks == 1

    def test_failed_plan_status(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id=None,
            department=None,
        )
        plan_repo.mark_failed(plan_id=handle.plan_id, reason="Test failure")
        response = plan_repo.get_by_id(handle.plan_id)

        assert response.status == PlanStatus.FAILED
        assert response.kpis is None
        assert response.assignments == []

    def test_get_by_id_not_found_raises(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        from app.services.exceptions import NotFoundError
        with pytest.raises(NotFoundError):
            plan_repo.get_by_id(99999)

    def test_horizon_fields_round_trip_correctly(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_02",
            department=None,
        )
        response = plan_repo.get_by_id(handle.plan_id)

        assert response.horizon_type == PlanningHorizonType.WEEKLY
        assert response.horizon_start == date(2026, 9, 7)
        assert response.horizon_end == date(2026, 9, 13)


# ---------------------------------------------------------------------------
# Assignment hydration
# ---------------------------------------------------------------------------

class TestAssignmentHydration:
    def test_task_fields_mapped_from_db(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_scheduled_result(task, window)
        )
        response = plan_repo.get_by_id(handle.plan_id)

        assert len(response.assignments) == 1
        a = response.assignments[0]
        assert a.task_id == task.id
        assert a.corridor_id == task.corridor_id
        assert a.department == Department.ENGINEERING
        assert a.defect_severity == DefectSeverity.A
        assert a.estimated_hours == 4.0
        assert a.criticality_score == 75.0

    def test_window_fields_mapped_from_db(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        seeded_task_window,
    ) -> None:
        task, window = seeded_task_window
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        plan_repo.save_result(
            plan_id=handle.plan_id, result=_make_scheduled_result(task, window)
        )
        response = plan_repo.get_by_id(handle.plan_id)

        a = response.assignments[0]
        assert a.window_id == window.id
        assert a.day == Weekday.MON   # 2026-09-07 is Monday

    def test_null_criticality_becomes_zero_in_assignment(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        plan_session: Session,
    ) -> None:
        """Tasks with NULL criticality must surface as 0.0 in PlanAssignmentResponse."""
        task = MaintenanceTask(
            task_id="TMS-NULL-SCORE", source_system="TMS", source_record_id="NS01",
            department="S&T", asset_id="SIG-01", corridor_id="COR_01",
            defect_type="SIGNAL_FAIL", defect_severity="B",
            days_overdue=2, estimated_hours=2.0, asset_age_years=3,
            status="PENDING", criticality_score=None,
        )
        window = BlockWindow(
            window_id="COA-NULL-W01", source_system="COA", source_record_id="NW01",
            corridor_id="COR_01", window_date=date(2026, 9, 7),
            start_time=time(1, 0), end_time=time(3, 0),
            available_hours=2.0, status="AVAILABLE",
        )
        plan_session.add_all([task, window])
        plan_session.commit()
        plan_session.refresh(task)
        plan_session.refresh(window)

        repo = SqlAlchemyPlanRepository(session=plan_session)
        handle = repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )
        assignment = PlanAssignmentResponse(
            task_id=task.id,
            window_id=window.id,
            corridor_id="COR_01",
            department=Department.S_AND_T,
            day=Weekday.MON,
            estimated_hours=2.0,
            criticality_score=0.0,
            defect_severity=DefectSeverity.B,
            status=AssignmentStatus.SCHEDULED,
        )
        result = OptimizerResult(
            assignments=[assignment],
            kpis=KpiResponse(
                total_tasks=1, scheduled_tasks=1, unscheduled_tasks=0,
                critical_unscheduled_tasks=0, asset_availability_percent=100.0,
                scheduled_hours=2.0, available_window_hours=2.0,
            ),
        )
        response = repo.save_result(plan_id=handle.plan_id, result=result)
        assert response.assignments[0].criticality_score == 0.0


# ---------------------------------------------------------------------------
# KPI generation
# ---------------------------------------------------------------------------

class TestKpiGeneration:
    def test_kpis_reflect_partial_scheduling(
        self,
        plan_repo: SqlAlchemyPlanRepository,
        plan_session: Session,
    ) -> None:
        """2 tasks: 1 scheduled, 1 unscheduled → correct KPI counts."""
        task1 = MaintenanceTask(
            task_id="TMS-KPI-01", source_system="TMS", source_record_id="K01",
            department="Engineering", asset_id="TRK-K01", corridor_id="COR_01",
            defect_type="DEFECT_A", defect_severity="A",
            days_overdue=5, estimated_hours=3.0, asset_age_years=5,
            status="PENDING", criticality_score=80.0,
        )
        task2 = MaintenanceTask(
            task_id="TMS-KPI-02", source_system="TMS", source_record_id="K02",
            department="Engineering", asset_id="TRK-K02", corridor_id="COR_01",
            defect_type="DEFECT_B", defect_severity="A",
            days_overdue=2, estimated_hours=2.0, asset_age_years=3,
            status="PENDING", criticality_score=60.0,
        )
        window = BlockWindow(
            window_id="COA-KPI-W01", source_system="COA", source_record_id="KW01",
            corridor_id="COR_01", window_date=date(2026, 9, 8),  # Tuesday
            start_time=time(2, 0), end_time=time(5, 0),
            available_hours=3.0, status="AVAILABLE",
        )
        plan_session.add_all([task1, task2, window])
        plan_session.commit()
        plan_session.refresh(task1)
        plan_session.refresh(task2)
        plan_session.refresh(window)

        repo = SqlAlchemyPlanRepository(session=plan_session)
        handle = repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id="COR_01",
            department=None,
        )

        # task1 is scheduled; task2 is unscheduled
        result = OptimizerResult(
            assignments=[
                PlanAssignmentResponse(
                    task_id=task1.id, window_id=window.id,
                    corridor_id="COR_01", department=Department.ENGINEERING,
                    day=Weekday.TUE, estimated_hours=3.0, criticality_score=80.0,
                    defect_severity=DefectSeverity.A, status=AssignmentStatus.SCHEDULED,
                ),
                PlanAssignmentResponse(
                    task_id=task2.id, window_id=None,
                    corridor_id="COR_01", department=Department.ENGINEERING,
                    day=None, estimated_hours=2.0, criticality_score=60.0,
                    defect_severity=DefectSeverity.A, status=AssignmentStatus.UNSCHEDULED,
                ),
            ],
            kpis=KpiResponse(
                total_tasks=2, scheduled_tasks=1, unscheduled_tasks=1,
                critical_unscheduled_tasks=1, asset_availability_percent=50.0,
                scheduled_hours=3.0, available_window_hours=3.0,
            ),
        )
        response = repo.save_result(plan_id=handle.plan_id, result=result)
        kpis = response.kpis

        assert kpis is not None
        assert kpis.total_tasks == 2
        assert kpis.scheduled_tasks == 1
        assert kpis.unscheduled_tasks == 1
        assert kpis.asset_availability_percent == 50.0
        assert kpis.scheduled_hours == 3.0
        assert kpis.available_window_hours == 3.0
        assert kpis.block_utilization_percent == 100.0

    def test_kpis_zero_division_safe_when_no_tasks(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        """save_result with an empty assignment list must not divide by zero."""
        handle = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 9, 7),
            horizon_end=date(2026, 9, 13),
            corridor_id=None,
            department=None,
        )
        empty_result = OptimizerResult(
            assignments=[],
            kpis=KpiResponse(
                total_tasks=0, scheduled_tasks=0, unscheduled_tasks=0,
                critical_unscheduled_tasks=0, asset_availability_percent=0.0,
                scheduled_hours=0.0, available_window_hours=0.0,
            ),
        )
        response = plan_repo.save_result(plan_id=handle.plan_id, result=empty_result)
        kpis = response.kpis
        assert kpis is not None
        assert kpis.total_tasks == 0
        assert kpis.asset_availability_percent == 0.0
        assert kpis.block_utilization_percent == 0.0


# ---------------------------------------------------------------------------
# Protocol conformance check
# ---------------------------------------------------------------------------

class TestProtocolConformance:
    def test_plan_repo_satisfies_plan_repository_protocol(
        self, plan_repo: SqlAlchemyPlanRepository
    ) -> None:
        from app.services.repositories import PlanRepository
        assert isinstance(plan_repo, PlanRepository)

    def test_override_repo_satisfies_override_repository_protocol(
        self, plan_session: Session
    ) -> None:
        from app.services.repositories import OverrideRepository
        from app.services.sql_repositories import SqlAlchemyOverrideRepository

        repo = SqlAlchemyOverrideRepository(session=plan_session)
        assert isinstance(repo, OverrideRepository)


# ===========================================================================
# SqlAlchemyOverrideRepository tests
# ===========================================================================

from app.schemas.enums import OverrideAction  # noqa: E402
from app.schemas.overrides import PlannerOverrideCreate  # noqa: E402
from app.services.sql_repositories import SqlAlchemyOverrideRepository  # noqa: E402
from database.models import PlannerOverride  # noqa: E402


@pytest.fixture()
def override_repo(plan_session: Session) -> SqlAlchemyOverrideRepository:
    return SqlAlchemyOverrideRepository(session=plan_session)


@pytest.fixture()
def ready_plan_with_assignment(
    plan_session: Session,
    seeded_task_window,
) -> tuple[int, MaintenanceTask, BlockWindow, BlockWindow]:
    """Create a READY BlockPlan with 1 assignment and 2 windows; return (plan_id, task, window1, window2)."""
    task, window1 = seeded_task_window

    window2 = BlockWindow(
        window_id="COA-P-W02",
        source_system="COA",
        source_record_id="PW02",
        corridor_id="COR_01",
        window_date=date(2026, 9, 8),
        start_time=time(1, 0),
        end_time=time(5, 0),
        available_hours=4.0,
        status="AVAILABLE",
    )
    plan_session.add(window2)
    plan_session.commit()
    plan_session.refresh(window2)

    plan_repo = SqlAlchemyPlanRepository(session=plan_session)
    handle = plan_repo.create_pending(
        horizon_type="weekly",
        horizon_start=date(2026, 9, 7),
        horizon_end=date(2026, 9, 13),
        corridor_id="COR_01",
        department=None,
    )
    result = _make_scheduled_result(task, window1)
    plan_repo.save_result(plan_id=handle.plan_id, result=result)

    return handle.plan_id, task, window1, window2


class TestSqlAlchemyOverrideRepository:
    def test_reassign_override_updates_assignment_and_persists_audit(
        self,
        override_repo: SqlAlchemyOverrideRepository,
        ready_plan_with_assignment,
        plan_session: Session,
    ) -> None:
        plan_id, task, window1, window2 = ready_plan_with_assignment

        payload = PlannerOverrideCreate(
            plan_id=plan_id,
            task_id=task.id,
            action=OverrideAction.REASSIGN,
            target_window_id=window2.id,
            reason="Track possession conflict requires reassignment to Tuesday window.",
        )

        resp = override_repo.record_override(
            plan_id=plan_id,
            payload=payload,
            overridden_by="senior_planner_01",
        )

        assert resp.override_id is not None
        assert resp.plan_id == plan_id
        assert resp.task_id == task.id
        assert resp.action == OverrideAction.REASSIGN
        assert resp.target_window_id == window2.id
        assert resp.overridden_by == "senior_planner_01"
        assert resp.overridden_at is not None

        # Verify DB state of plan_assignment
        assignment = plan_session.query(PlanAssignment).filter_by(
            plan_id=plan_id, task_id=task.id
        ).first()
        assert assignment is not None
        assert assignment.window_id == window2.id
        assert assignment.status == "OVERRIDDEN"

        # Verify DB state of planner_override
        audit = plan_session.query(PlannerOverride).filter_by(id=resp.override_id).first()
        assert audit is not None
        assert audit.action == "REASSIGN"
        assert audit.target_window_id == window2.id
        assert audit.overridden_by == "senior_planner_01"

    def test_unschedule_override_cancels_assignment_and_persists_audit(
        self,
        override_repo: SqlAlchemyOverrideRepository,
        ready_plan_with_assignment,
        plan_session: Session,
    ) -> None:
        plan_id, task, window1, window2 = ready_plan_with_assignment

        payload = PlannerOverrideCreate(
            plan_id=plan_id,
            task_id=task.id,
            action=OverrideAction.UNSCHEDULE,
            reason="Rolling stock movement emergency requires cancelling this maintenance block.",
        )

        resp = override_repo.record_override(
            plan_id=plan_id,
            payload=payload,
            overridden_by=None,
        )

        assert resp.action == OverrideAction.UNSCHEDULE
        assert resp.target_window_id is None
        assert resp.overridden_by == "system"

        # Verify DB state of assignment
        assignment = plan_session.query(PlanAssignment).filter_by(
            plan_id=plan_id, task_id=task.id
        ).first()
        assert assignment is not None
        assert assignment.status == "CANCELLED"

    def test_force_schedule_override_persists_audit(
        self,
        override_repo: SqlAlchemyOverrideRepository,
        ready_plan_with_assignment,
        plan_session: Session,
    ) -> None:
        plan_id, task, window1, window2 = ready_plan_with_assignment

        payload = PlannerOverrideCreate(
            plan_id=plan_id,
            task_id=task.id,
            action=OverrideAction.FORCE_SCHEDULE,
            target_window_id=window2.id,
            reason="Critical safety mandate overrides possession capacity limits.",
        )

        resp = override_repo.record_override(
            plan_id=plan_id,
            payload=payload,
            overridden_by="chief_controller",
        )

        assert resp.action == OverrideAction.FORCE_SCHEDULE
        assert resp.target_window_id == window2.id

        assignment = plan_session.query(PlanAssignment).filter_by(
            plan_id=plan_id, task_id=task.id
        ).first()
        assert assignment is not None
        assert assignment.window_id == window2.id
        assert assignment.status == "OVERRIDDEN"

    def test_override_nonexistent_plan_raises_not_found(
        self,
        override_repo: SqlAlchemyOverrideRepository,
        ready_plan_with_assignment,
    ) -> None:
        _, task, window1, window2 = ready_plan_with_assignment
        payload = PlannerOverrideCreate(
            plan_id=99999,
            task_id=task.id,
            action=OverrideAction.UNSCHEDULE,
            reason="Valid explanation for unscheduling task due to conflict.",
        )

        with pytest.raises(NotFoundError, match="Block plan 99999 not found"):
            override_repo.record_override(
                plan_id=99999,
                payload=payload,
                overridden_by="user",
            )

    def test_override_nonexistent_assignment_raises_not_found(
        self,
        override_repo: SqlAlchemyOverrideRepository,
        ready_plan_with_assignment,
    ) -> None:
        plan_id, task, window1, window2 = ready_plan_with_assignment
        payload = PlannerOverrideCreate(
            plan_id=plan_id,
            task_id=99999,
            action=OverrideAction.UNSCHEDULE,
            reason="Valid explanation for unscheduling task due to conflict.",
        )

        with pytest.raises(NotFoundError, match="Assignment for plan"):
            override_repo.record_override(
                plan_id=plan_id,
                payload=payload,
                overridden_by="user",
            )
