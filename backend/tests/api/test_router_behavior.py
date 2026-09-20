"""API routing and validation behaviour tests for all domain routers.

Strategy
--------
* All service dependencies are overridden with deterministic test doubles —
  either raising ``DependencyNotReady`` (the default stub) or returning a
  canned fixture when the route logic itself must succeed.
* No database, ML, or optimizer code is involved.
* Tests verify HTTP status codes, response shapes, and error envelopes.
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

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
    Weekday,
)
from app.schemas.kpis import CriticalTasksKpiResponse, KpiResponse
from app.schemas.overrides import PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.schemas.common import PageMeta
from app.services import (
    get_kpi_service,
    get_ml_service,
    get_override_service,
    get_plan_service,
    get_task_service,
)
from app.services.exceptions import DependencyNotReady
from app.services.kpis import UnavailableKpiService
from app.services.overrides import UnavailableOverrideService
from app.services.plans import UnavailablePlanService
from app.services.tasks import UnavailableTaskService


# ---------------------------------------------------------------------------
# App factory for tests
# ---------------------------------------------------------------------------

def _make_app(**service_overrides: object) -> tuple[FastAPI, TestClient]:
    settings = Settings(
        app_title="SIH26027 Block Planning API",
        app_version="0.1.0",
        environment="test",
        debug=False,
    )
    app = create_app(settings)
    for dep, override in service_overrides.items():
        dep_fn = {
            "task": get_task_service,
            "plan": get_plan_service,
            "kpi": get_kpi_service,
            "override": get_override_service,
            "ml": get_ml_service,
        }[dep]
        app.dependency_overrides[dep_fn] = lambda svc=override: svc
    return app, TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Clients with all services *explicitly* unavailable (guarantee 503)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client() -> TestClient:
    """All services explicitly replaced with Unavailable stubs to guarantee 503."""
    _, c = _make_app(
        task=UnavailableTaskService(),
        plan=UnavailablePlanService(),
        kpi=UnavailableKpiService(),
        override=UnavailableOverrideService(),
    )
    return c


# ---------------------------------------------------------------------------
# TASKS router
# ---------------------------------------------------------------------------

class TestTasksRouter:
    def test_list_tasks_503_when_db_not_ready(self, client: TestClient) -> None:
        resp = client.get("/tasks")
        assert resp.status_code == 503
        body = resp.json()
        assert body["error"] == "dependency_not_ready"
        assert "message" in body

    def test_get_task_503_when_db_not_ready(self, client: TestClient) -> None:
        resp = client.get("/tasks/1")
        assert resp.status_code == 503

    def test_get_task_422_for_invalid_id(self, client: TestClient) -> None:
        resp = client.get("/tasks/0")
        assert resp.status_code == 422

    def test_list_unscheduled_503_when_db_not_ready(self, client: TestClient) -> None:
        resp = client.get("/tasks/unscheduled")
        assert resp.status_code == 503

    def test_score_tasks_503_when_ml_not_ready(self) -> None:
        class _StubMlUnavailable:
            def score_batch(self, request):
                raise DependencyNotReady("ML not wired")

        _, c = _make_app(ml=_StubMlUnavailable())
        resp = c.post(
            "/tasks/score",
            json={
                "tasks": [
                    {
                        "task_id": 1,
                        "department": "Engineering",
                        "corridor_id": "COR_01",
                        "defect_severity": "A",
                        "days_overdue": 1,
                        "estimated_hours": 2.0,
                        "asset_age_years": 5,
                    }
                ]
            },
        )
        assert resp.status_code == 503
        assert resp.json()["error"] == "dependency_not_ready"

    def test_list_tasks_pagination_query_params_validated(self, client: TestClient) -> None:
        # limit=0 is out of range (ge=1)
        resp = client.get("/tasks?limit=0")
        assert resp.status_code == 422

    def test_list_tasks_returns_correct_shape_when_service_works(self) -> None:
        stub_response = MaintenanceTaskListResponse(
            items=[],
            meta=PageMeta(limit=50, offset=0, total=0),
        )

        class _StubTaskService:
            def list_tasks(self, *, pagination, corridor_id, department, status):
                return stub_response

            def get_task(self, task_id):
                raise DependencyNotReady("not needed")

            def list_unscheduled(self, *, pagination, plan_id, corridor_id, critical_only):
                raise DependencyNotReady("not needed")

        _, c = _make_app(task=_StubTaskService())
        resp = c.get("/tasks")
        assert resp.status_code == 200
        body = resp.json()
        assert body["items"] == []
        assert body["meta"]["total"] == 0


# ---------------------------------------------------------------------------
# PLANS router
# ---------------------------------------------------------------------------

class TestPlansRouter:
    def test_generate_plan_503_when_service_not_ready(self, client: TestClient) -> None:
        payload = {
            "horizon_type": "weekly",
            "horizon_start": "2026-08-24",
            "horizon_end": "2026-08-30",
        }
        resp = client.post("/generate-plan", json=payload)
        assert resp.status_code == 503
        assert resp.json()["error"] == "dependency_not_ready"

    def test_generate_plan_422_for_bad_horizon(self, client: TestClient) -> None:
        # daily horizon but end != start
        payload = {
            "horizon_type": "daily",
            "horizon_start": "2026-08-24",
            "horizon_end": "2026-08-25",
        }
        resp = client.post("/generate-plan", json=payload)
        assert resp.status_code == 422

    def test_generate_plan_accepts_monthly_horizon(self, client: TestClient) -> None:
        payload = {
            "horizon_type": "monthly",
            "horizon_start": "2026-08-01",
            "horizon_end": "2026-08-31",
        }
        # DB is not ready → 503, but schema accepted (no 422)
        resp = client.post("/generate-plan", json=payload)
        assert resp.status_code == 503

    def test_get_plan_503_when_service_not_ready(self, client: TestClient) -> None:
        resp = client.get("/plan/1")
        assert resp.status_code == 503

    def test_get_plan_422_for_invalid_id(self, client: TestClient) -> None:
        resp = client.get("/plan/0")
        assert resp.status_code == 422

    def test_generate_plan_returns_job_handle_when_service_works(self) -> None:
        canned = PlanJobResponse(
            job_id="job-abc-123",
            plan_id=None,
            status=PlanStatus.PENDING,
        )

        class _StubPlanService:
            def generate_plan(self, payload):
                return canned

            def get_plan(self, plan_id):
                raise DependencyNotReady("not needed")

        _, c = _make_app(plan=_StubPlanService())
        resp = c.post(
            "/generate-plan",
            json={
                "horizon_type": "weekly",
                "horizon_start": "2026-08-24",
                "horizon_end": "2026-08-30",
            },
        )
        assert resp.status_code == 202
        body = resp.json()
        assert body["job_id"] == "job-abc-123"
        assert body["status"] == "pending"

    def test_get_plan_returns_full_plan_when_service_works(self) -> None:
        canned = BlockPlanResponse(
            plan_id=7,
            horizon_type=PlanningHorizonType.WEEKLY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            status=PlanStatus.READY,
            assignments=[],
            kpis=None,
        )

        class _StubPlanService:
            def generate_plan(self, payload):
                raise DependencyNotReady("not needed")

            def get_plan(self, plan_id):
                return canned

        _, c = _make_app(plan=_StubPlanService())
        resp = c.get("/plan/7")
        assert resp.status_code == 200
        body = resp.json()
        assert body["plan_id"] == 7
        assert body["status"] == "ready"


# ---------------------------------------------------------------------------
# KPIs router
# ---------------------------------------------------------------------------

class TestKpisRouter:
    def test_availability_503_when_service_not_ready(self, client: TestClient) -> None:
        """Verifies HTTP 503 is returned when KPI service is explicitly unavailable."""
        resp = client.get("/kpis/availability")
        assert resp.status_code == 503
        assert resp.json()["error"] == "dependency_not_ready"

    def test_utilization_503_when_service_not_ready(self, client: TestClient) -> None:
        """Verifies HTTP 503 is returned when KPI service is explicitly unavailable."""
        resp = client.get("/kpis/utilization")
        assert resp.status_code == 503
        assert resp.json()["error"] == "dependency_not_ready"

    def test_critical_tasks_503_when_service_not_ready(self, client: TestClient) -> None:
        """Verifies HTTP 503 is returned when KPI service is explicitly unavailable."""
        resp = client.get("/kpis/critical-tasks")
        assert resp.status_code == 503
        assert resp.json()["error"] == "dependency_not_ready"

    def test_availability_plan_id_query_accepted_not_422(self, client: TestClient) -> None:
        """Verifies plan_id=1 query param is accepted (not rejected as 422) even when unavailable."""
        resp = client.get("/kpis/availability?plan_id=1")
        assert resp.status_code == 503  # still 503 not 422 — query param is valid

    def test_critical_tasks_pagination_validated(self, client: TestClient) -> None:
        """Verifies limit=0 is rejected with 422 before service is consulted."""
        resp = client.get("/kpis/critical-tasks?limit=0")
        assert resp.status_code == 422

    def test_availability_returns_kpi_when_service_works(self) -> None:
        canned = KpiResponse(
            plan_id=1,
            total_tasks=10,
            scheduled_tasks=8,
            unscheduled_tasks=2,
            critical_unscheduled_tasks=1,
            asset_availability_percent=80.0,
        )

        class _StubKpiService:
            def availability(self, query):
                return canned

            def utilization(self, query):
                raise DependencyNotReady("not needed")

            def critical_tasks(self, query, pagination):
                raise DependencyNotReady("not needed")

        _, c = _make_app(kpi=_StubKpiService())
        resp = c.get("/kpis/availability?plan_id=1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["asset_availability_percent"] == 80.0
        assert body["plan_id"] == 1


# ---------------------------------------------------------------------------
# OVERRIDES router
# ---------------------------------------------------------------------------

class TestOverridesRouter:
    _valid_override = {
        "plan_id": 1,
        "task_id": 18,
        "action": "unschedule",
        "reason": "Track possession conflict with coaching stock movement.",
    }

    def test_override_503_when_service_not_ready(self, client: TestClient) -> None:
        resp = client.put("/plan/1/override", json=self._valid_override)
        assert resp.status_code == 503
        assert resp.json()["error"] == "dependency_not_ready"

    def test_override_422_for_invalid_plan_id(self, client: TestClient) -> None:
        resp = client.put("/plan/0/override", json=self._valid_override)
        assert resp.status_code == 422

    def test_override_409_when_path_body_plan_id_mismatch(self, client: TestClient) -> None:
        mismatched = {**self._valid_override, "plan_id": 99}
        resp = client.put("/plan/1/override", json=mismatched)
        # ConflictError raised by UnavailableOverrideService → 409
        assert resp.status_code == 409
        assert resp.json()["error"] == "conflict"

    def test_override_422_for_short_reason(self, client: TestClient) -> None:
        short_reason = {**self._valid_override, "reason": "short"}
        resp = client.put("/plan/1/override", json=short_reason)
        assert resp.status_code == 422

    def test_override_422_for_missing_window_on_reassign(self, client: TestClient) -> None:
        payload = {
            "plan_id": 1,
            "task_id": 18,
            "action": "reassign",
            "reason": "Move work to a later possession window on this corridor.",
        }
        resp = client.put("/plan/1/override", json=payload)
        assert resp.status_code == 422

    def test_override_returns_response_when_service_works(self) -> None:
        canned = PlannerOverrideResponse(
            override_id=5,
            plan_id=1,
            task_id=18,
            action=OverrideAction.UNSCHEDULE,
            reason="Track possession conflict with coaching stock movement.",
            overridden_by="planner.1",
        )

        class _StubOverrideService:
            def apply_override(self, plan_id, payload):
                return canned

        _, c = _make_app(override=_StubOverrideService())
        resp = c.put("/plan/1/override", json=self._valid_override)
        assert resp.status_code == 200
        body = resp.json()
        assert body["override_id"] == 5
        assert body["action"] == "unschedule"
        assert "possession" in body["reason"]
