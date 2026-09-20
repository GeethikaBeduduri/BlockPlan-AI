"""Integration tests for KPI endpoints using real SQLAlchemy repositories.

Tests verify the full stack:
  HTTP GET /kpis/availability
  HTTP GET /kpis/utilization
  HTTP GET /kpis/critical-tasks
    -> FastAPI router (kpis.py)
    -> get_kpi_service dependency override -> ConcreteKpiService
    -> SqlAlchemyPlanRepository + SqlAlchemyTaskRepository (SQLite in-memory)
    -> Person 2 BlockPlan + PlanAssignment + MaintenanceTask + BlockWindow models

Coverage:
  - availability with real stored ready plan (2/3 scheduled -> ~66.67%)
  - availability department filter (Engineering -> 100%)
  - availability unknown plan_id -> 404
  - availability no plan_id -> aggregate from tasks table
  - availability zero-division: plan with 0 assignments -> 100%
  - availability response has all required KpiResponse fields
  - availability percent bounded 0-100
  - utilization with real plan (6h scheduled / 6h available -> 100%)
  - utilization unknown plan_id -> 404
  - utilization percent bounded 0-100
  - utilization zero-division: 0 assignments -> 0%
  - critical-tasks paginated envelope
  - critical-tasks all items are severity-A only
  - critical-tasks unknown plan_id -> 404
  - critical-tasks limit=0 -> 422
  - critical-tasks corridor filter accepted
  - critical-tasks department filter accepted
  - critical-tasks no plan_id -> global aggregation
"""

from __future__ import annotations

from datetime import date, time

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.models import Base, BlockPlan, BlockWindow, MaintenanceTask, PlanAssignment

from app.config import Settings
from app.main import create_app
from app.services import get_kpi_service
from app.services.kpi_service import ConcreteKpiService
from app.services.sql_repositories import SqlAlchemyPlanRepository, SqlAlchemyTaskRepository


# ---------------------------------------------------------------------------
# Module-scoped SQLite in-memory DB (StaticPool: same connection everywhere)
# Mirrors the db_engine fixture pattern from test_person1_person2_integration.py
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def kpi_engine():
    """Shared SQLite engine with INTEGER PK AUTOINCREMENT for plan/assignment tables.

    BigInteger PK maps to BIGINT which SQLite does not support for autoincrement.
    We create the plan/assignment/override tables manually with INTEGER PK to match
    the same workaround used in test_person1_person2_integration.py.
    """
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Create task and window tables from ORM (they use Integer PK which SQLite handles fine)
    Base.metadata.create_all(
        engine,
        tables=[
            Base.metadata.tables["maintenance_tasks"],
            Base.metadata.tables["block_windows"],
        ],
    )

    # Create plan, assignment tables with explicit INTEGER PK for SQLite compatibility
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
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
def kpi_sf(kpi_engine):
    """Session factory bound to the shared engine."""
    return sessionmaker(bind=kpi_engine, autoflush=False, autocommit=False)


# ---------------------------------------------------------------------------
# Seed data (module-scoped: run once for all tests in this file)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def kpi_seed(kpi_sf) -> dict:
    """
    Seed the in-memory DB and return useful IDs.

    Schema:
      Tasks (3):
        KPI-T01  Engineering  COR_KPI  severity=A  status=PENDING  hours=4.0
        KPI-T02  S&T          COR_KPI  severity=B  status=PENDING  hours=2.0
        KPI-T03  Engineering  COR_KPI  severity=A  status=PENDING  hours=3.0

      Windows (1):
        KPI-W01  COR_KPI  2026-08-25  22:00-23:59  6.0h  AVAILABLE

      Plans:
        Plan 1 (READY): 3 total tasks, 2 ASSIGNED (T01+T02), T03 unscheduled
        Plan 2 (READY): 0 total tasks, no assignments (zero-division test)
    """
    tasks = [
        MaintenanceTask(
            task_id="KPI-T01", source_system="TMS", source_record_id="KPI-1",
            department="Engineering", asset_id="TRK-KPI-1", corridor_id="COR_KPI",
            defect_type="RAIL_FRACTURE", defect_severity="A",
            days_overdue=10, estimated_hours=4.0, asset_age_years=5,
            status="PENDING", criticality_score=90.0,
        ),
        MaintenanceTask(
            task_id="KPI-T02", source_system="SMMS", source_record_id="KPI-2",
            department="S&T", asset_id="SIG-KPI-1", corridor_id="COR_KPI",
            defect_type="SIGNAL_FAILURE", defect_severity="B",
            days_overdue=2, estimated_hours=2.0, asset_age_years=3,
            status="PENDING", criticality_score=60.0,
        ),
        MaintenanceTask(
            task_id="KPI-T03", source_system="TMS", source_record_id="KPI-3",
            department="Engineering", asset_id="TRK-KPI-2", corridor_id="COR_KPI",
            defect_type="SLEEPER_EROSION", defect_severity="A",
            days_overdue=7, estimated_hours=3.0, asset_age_years=8,
            status="PENDING", criticality_score=85.0,
        ),
    ]
    window = BlockWindow(
        window_id="KPI-W01", source_system="COA", source_record_id="KPI-W01",
        corridor_id="COR_KPI", window_date=date(2026, 8, 25),
        start_time=time(22, 0), end_time=time(23, 59),
        available_hours=6.0, status="AVAILABLE",
    )

    with kpi_sf() as session:
        for t in tasks:
            session.add(t)
        session.add(window)
        session.commit()

        # Re-fetch IDs
        t1 = session.scalar(select(MaintenanceTask).where(MaintenanceTask.task_id == "KPI-T01"))
        t2 = session.scalar(select(MaintenanceTask).where(MaintenanceTask.task_id == "KPI-T02"))
        w1 = session.scalar(select(BlockWindow).where(BlockWindow.window_id == "KPI-W01"))

        # Plan 1: 3 total tasks, 2 ASSIGNED (T01 + T02)
        # Using plan_repo so BigInteger PK is handled properly by the ORM on the
        # INTEGER-typed SQLite column we created above.
        plan_repo = SqlAlchemyPlanRepository(session_factory=kpi_sf)
        job1 = plan_repo.create_pending(
            horizon_type="weekly",
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_KPI",
            department=None,
        )
        plan1_id = job1.plan_id

        # Manually insert ASSIGNED rows for T01 and T02
        with kpi_sf() as s:
            s.execute(sa.text("""
                INSERT INTO plan_assignments (plan_id, task_id, window_id, department, joint_block_flag, status)
                VALUES (:plan_id, :task_id, :window_id, :dept, 0, 'ASSIGNED')
            """), {"plan_id": plan1_id, "task_id": t1.id, "window_id": w1.id, "dept": "Engineering"})
            s.execute(sa.text("""
                INSERT INTO plan_assignments (plan_id, task_id, window_id, department, joint_block_flag, status)
                VALUES (:plan_id, :task_id, :window_id, :dept, 0, 'ASSIGNED')
            """), {"plan_id": plan1_id, "task_id": t2.id, "window_id": w1.id, "dept": "S&T"})
            # Mark the plan as READY with __ttl:3 (3 total tasks)
            s.execute(sa.text("""
                UPDATE block_plans SET status='READY', failure_reason='__ttl:3' WHERE id=:pid
            """), {"pid": plan1_id})
            s.commit()

        # Plan 2: 0 total tasks, 0 assignments (zero-division test)
        job2 = plan_repo.create_pending(
            horizon_type="daily",
            horizon_start=date(2026, 9, 1),
            horizon_end=date(2026, 9, 1),
            corridor_id=None,
            department=None,
        )
        plan2_id = job2.plan_id
        with kpi_sf() as s:
            s.execute(sa.text("""
                UPDATE block_plans SET status='READY', failure_reason='__ttl:0' WHERE id=:pid
            """), {"pid": plan2_id})
            s.commit()

    return {"plan_id": plan1_id, "empty_plan_id": plan2_id}


# ---------------------------------------------------------------------------
# FastAPI test client wired to in-memory SQLite repos
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def kpi_client(kpi_sf, kpi_seed):
    """HTTP TestClient with ConcreteKpiService backed by in-memory SQLite."""
    settings = Settings(
        app_title="SIH26027 KPI Integration Tests",
        app_version="0.1.0",
        environment="test",
        debug=False,
    )
    app = create_app(settings)

    plan_repo = SqlAlchemyPlanRepository(session_factory=kpi_sf)
    task_repo = SqlAlchemyTaskRepository(session_factory=kpi_sf)
    kpi_service = ConcreteKpiService(plan_repo=plan_repo, task_repo=task_repo)
    app.dependency_overrides[get_kpi_service] = lambda: kpi_service

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


# ---------------------------------------------------------------------------
# Tests: GET /kpis/availability
# ---------------------------------------------------------------------------

class TestKpiAvailabilityEndpoint:
    def test_availability_with_ready_plan(self, kpi_client, kpi_seed):
        """2 of 3 tasks scheduled -> availability ~66.67%."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(f"/kpis/availability?plan_id={plan_id}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["plan_id"] == plan_id
        assert body["total_tasks"] == 3
        assert body["scheduled_tasks"] == 2
        assert body["unscheduled_tasks"] == 1
        pct = body["asset_availability_percent"]
        assert 66.0 <= pct <= 67.0, f"Expected ~66.67%, got {pct}"

    def test_availability_department_filter_engineering(self, kpi_client, kpi_seed):
        """Filter by Engineering: 1 ASSIGNED task -> 100% availability."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(
            f"/kpis/availability?plan_id={plan_id}&department=Engineering"
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["scheduled_tasks"] == 1
        assert body["asset_availability_percent"] == 100.0

    def test_availability_department_filter_s_and_t(self, kpi_client, kpi_seed):
        """Filter by S&T: 1 ASSIGNED task -> 100%."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(
            f"/kpis/availability?plan_id={plan_id}&department=S%26T"
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["scheduled_tasks"] == 1
        assert body["asset_availability_percent"] == 100.0

    def test_availability_unknown_plan_id_returns_404(self, kpi_client):
        """Non-existent plan_id must return HTTP 404 with error=not_found."""
        resp = kpi_client.get("/kpis/availability?plan_id=99999")
        assert resp.status_code == 404
        assert resp.json()["error"] == "not_found"

    def test_availability_no_plan_id_aggregates_from_tasks_table(self, kpi_client):
        """Without plan_id, endpoint aggregates directly from maintenance_tasks."""
        resp = kpi_client.get("/kpis/availability")
        assert resp.status_code == 200
        body = resp.json()
        assert body["plan_id"] is None
        assert 0.0 <= body["asset_availability_percent"] <= 100.0

    def test_availability_zero_division_empty_plan_returns_100_percent(self, kpi_client, kpi_seed):
        """Plan with __ttl:0 (zero total tasks) returns 100.0% (safe zero-division default)."""
        empty_plan_id = kpi_seed["empty_plan_id"]
        resp = kpi_client.get(f"/kpis/availability?plan_id={empty_plan_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_tasks"] == 0
        assert body["scheduled_tasks"] == 0
        assert body["asset_availability_percent"] == 100.0

    def test_availability_percent_bounded_0_to_100(self, kpi_client, kpi_seed):
        """asset_availability_percent must satisfy 0 <= x <= 100."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(f"/kpis/availability?plan_id={plan_id}")
        assert resp.status_code == 200
        pct = resp.json()["asset_availability_percent"]
        assert 0.0 <= pct <= 100.0

    def test_availability_response_has_all_required_kpi_fields(self, kpi_client, kpi_seed):
        """Verify every KpiResponse field is present in the JSON response."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(f"/kpis/availability?plan_id={plan_id}")
        assert resp.status_code == 200
        body = resp.json()
        required = [
            "plan_id", "total_tasks", "scheduled_tasks", "unscheduled_tasks",
            "critical_unscheduled_tasks", "asset_availability_percent",
            "scheduled_hours", "available_window_hours", "block_utilization_percent",
        ]
        for field in required:
            assert field in body, f"Missing required KpiResponse field: {field}"


# ---------------------------------------------------------------------------
# Tests: GET /kpis/utilization
# ---------------------------------------------------------------------------

class TestKpiUtilizationEndpoint:
    def test_utilization_with_ready_plan(self, kpi_client, kpi_seed):
        """T01(4h) + T02(2h) = 6h scheduled; one window of 6h -> 100% utilization."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(f"/kpis/utilization?plan_id={plan_id}")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["scheduled_hours"] == 6.0
        assert body["available_window_hours"] == 6.0
        assert body["block_utilization_percent"] == 100.0

    def test_utilization_unknown_plan_id_returns_404(self, kpi_client):
        """Non-existent plan_id -> HTTP 404."""
        resp = kpi_client.get("/kpis/utilization?plan_id=99999")
        assert resp.status_code == 404
        assert resp.json()["error"] == "not_found"

    def test_utilization_zero_division_plan_with_no_assignments(self, kpi_client, kpi_seed):
        """Empty plan has 0 assignments -> scheduled_hours=0 -> available=0 -> utilization=0%."""
        empty_plan_id = kpi_seed["empty_plan_id"]
        resp = kpi_client.get(f"/kpis/utilization?plan_id={empty_plan_id}")
        assert resp.status_code == 200
        body = resp.json()
        # No assignments -> plan.kpis is None -> available_window_hours=0 -> utilization=0%
        assert body["block_utilization_percent"] == 0.0

    def test_utilization_percent_bounded_0_to_100(self, kpi_client, kpi_seed):
        """block_utilization_percent must satisfy 0 <= x <= 100."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(f"/kpis/utilization?plan_id={plan_id}")
        assert resp.status_code == 200
        pct = resp.json()["block_utilization_percent"]
        assert 0.0 <= pct <= 100.0


# ---------------------------------------------------------------------------
# Tests: GET /kpis/critical-tasks
# ---------------------------------------------------------------------------

class TestKpiCriticalTasksEndpoint:
    def test_critical_tasks_returns_paginated_envelope(self, kpi_client, kpi_seed):
        """Response must have items list + meta with limit/offset."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(
            f"/kpis/critical-tasks?plan_id={plan_id}&limit=10&offset=0"
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "items" in body
        assert "meta" in body
        assert isinstance(body["items"], list)
        assert body["meta"]["limit"] == 10
        assert body["meta"]["offset"] == 0

    def test_critical_tasks_all_items_are_severity_a_only(self, kpi_client):
        """All returned items must have defect_severity='A' -- no B/C leakage."""
        resp = kpi_client.get("/kpis/critical-tasks?limit=100&offset=0")
        assert resp.status_code == 200
        for item in resp.json()["items"]:
            assert item["defect_severity"] == "A", (
                f"Non-severity-A item returned: {item}"
            )

    def test_critical_tasks_unknown_plan_id_returns_404(self, kpi_client):
        """Non-existent plan_id -> HTTP 404 with error=not_found."""
        resp = kpi_client.get("/kpis/critical-tasks?plan_id=99999")
        assert resp.status_code == 404
        assert resp.json()["error"] == "not_found"

    def test_critical_tasks_limit_zero_returns_422(self, kpi_client):
        """limit=0 violates Query(ge=1) constraint -> HTTP 422 before service is called."""
        resp = kpi_client.get("/kpis/critical-tasks?limit=0")
        assert resp.status_code == 422

    def test_critical_tasks_corridor_filter_accepted(self, kpi_client, kpi_seed):
        """corridor_id query param is accepted without raising 5xx."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(
            f"/kpis/critical-tasks?plan_id={plan_id}&corridor_id=COR_KPI"
        )
        assert resp.status_code == 200

    def test_critical_tasks_department_filter_accepted(self, kpi_client, kpi_seed):
        """department query param is accepted without raising 5xx."""
        plan_id = kpi_seed["plan_id"]
        resp = kpi_client.get(
            f"/kpis/critical-tasks?plan_id={plan_id}&department=Engineering"
        )
        assert resp.status_code == 200

    def test_critical_tasks_no_plan_id_returns_global_aggregate(self, kpi_client):
        """Without plan_id, endpoint returns global unscheduled severity-A tasks."""
        resp = kpi_client.get("/kpis/critical-tasks?limit=50&offset=0")
        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert "meta" in body
