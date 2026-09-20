"""Integration-style tests for the FastAPI application endpoints.

These tests use TestClient with dependency overrides to replace real services
with typed in-memory stubs. No real database, Redis, or ML model is needed.

Covers:
- Health endpoints (GET / and GET /health).
- Tasks endpoints: list, get, unscheduled (503, 404, 422, 200).
- Plans endpoints: generate (202, 422, 503), get plan (200, 404, 503).
- KPI endpoints: availability, utilization, critical-tasks (200, 503, 422).
- Override endpoint: apply override (200, 409, 404, 422, 503).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import PageMeta, PaginationParams
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
from app.schemas.kpis import CriticalTasksKpiResponse, KpiQuery, KpiResponse
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.schemas.tasks import (
    MaintenanceTaskListResponse,
    MaintenanceTaskResponse,
    UnscheduledCriticalTaskResponse,
)
from app.services import get_kpi_service, get_override_service, get_plan_service, get_task_service
from app.services.exceptions import ApiServiceError, DependencyNotReady, NotFoundError
from app.services.kpis import UnavailableKpiService
from app.services.overrides import UnavailableOverrideService
from app.services.plans import UnavailablePlanService
from app.services.tasks import UnavailableTaskService


# ---------------------------------------------------------------------------
# Shared stubs
# ---------------------------------------------------------------------------

def _task(task_id: int = 1) -> MaintenanceTaskResponse:
    return MaintenanceTaskResponse(
        task_id=task_id,
        department=Department.ENGINEERING,
        corridor_id="COR_01",
        defect_severity=DefectSeverity.A,
        days_overdue=3,
        estimated_hours=4.0,
        asset_age_years=5,
        status=TaskStatus.OPEN,
        criticality_score=85.0,
    )


def _plan_response() -> BlockPlanResponse:
    return BlockPlanResponse(
        plan_id=1,
        horizon_type=PlanningHorizonType.WEEKLY,
        horizon_start=date(2026, 8, 24),
        horizon_end=date(2026, 8, 30),
        status=PlanStatus.READY,
        assignments=[
            PlanAssignmentResponse(
                task_id=1, window_id=10, corridor_id="COR_01",
                department=Department.ENGINEERING, day=Weekday.MON,
                estimated_hours=4.0, criticality_score=85.0,
                defect_severity=DefectSeverity.A, status=AssignmentStatus.SCHEDULED,
            )
        ],
        kpis=KpiResponse(
            plan_id=1, total_tasks=1, scheduled_tasks=1,
            unscheduled_tasks=0, critical_unscheduled_tasks=0,
            asset_availability_percent=100.0,
        ),
    )


def _kpi_response() -> KpiResponse:
    return KpiResponse(
        plan_id=1, total_tasks=10, scheduled_tasks=8,
        unscheduled_tasks=2, critical_unscheduled_tasks=1,
        asset_availability_percent=80.0, scheduled_hours=32.0,
        available_window_hours=40.0, block_utilization_percent=80.0,
    )


# ---------------------------------------------------------------------------
# Stub service implementations
# ---------------------------------------------------------------------------

class _StubTaskService:
    def list_tasks(self, *, pagination, corridor_id, department, status):
        return MaintenanceTaskListResponse(
            items=[_task()],
            meta=PageMeta(limit=pagination.limit, offset=0, total=1),
        )

    def get_task(self, task_id: int):
        if task_id == 1:
            return _task(1)
        raise NotFoundError(f"Task {task_id} not found")

    def list_unscheduled(self, *, pagination, plan_id, corridor_id, critical_only):
        return MaintenanceTaskListResponse(
            items=[_task()],
            meta=PageMeta(limit=50, offset=0, total=1),
        )


class _StubPlanService:
    def generate_plan(self, payload):
        return PlanJobResponse(
            accepted=True,
            job_id="test-job-001",
            plan_id=1,
            horizon_type=payload.horizon_type.value,
            status=PlanStatus.PENDING,
        )

    def get_plan(self, plan_id: int):
        if plan_id == 1:
            return _plan_response()
        raise NotFoundError(f"Plan {plan_id} not found")


class _StubKpiService:
    def availability(self, query: KpiQuery) -> KpiResponse:
        return _kpi_response()

    def utilization(self, query: KpiQuery) -> KpiResponse:
        return _kpi_response()

    def critical_tasks(self, query: KpiQuery, pagination: PaginationParams) -> CriticalTasksKpiResponse:
        return CriticalTasksKpiResponse(
            items=[
                UnscheduledCriticalTaskResponse(
                    plan_id=query.plan_id or 1, task_id=99,
                    department=Department.ENGINEERING, corridor_id="COR_01",
                    defect_severity=DefectSeverity.A, days_overdue=7,
                    estimated_hours=3.0, criticality_score=90.0,
                    status=TaskStatus.UNSCHEDULED,
                )
            ],
            meta=PageMeta(limit=pagination.limit, offset=0, total=1),
        )


class _StubOverrideService:
    def apply_override(self, plan_id: int, payload: PlannerOverrideCreate):
        if payload.plan_id != plan_id:
            from app.services.exceptions import ConflictError
            raise ConflictError("plan_id mismatch")
        return PlannerOverrideResponse(
            override_id=1, plan_id=plan_id, task_id=payload.task_id,
            action=payload.action, target_window_id=payload.target_window_id,
            reason=payload.reason, overridden_by=None,
            overridden_at=datetime.now(timezone.utc),
        )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client_with_stubs() -> TestClient:
    app.dependency_overrides[get_task_service] = lambda: _StubTaskService()
    app.dependency_overrides[get_plan_service] = lambda: _StubPlanService()
    app.dependency_overrides[get_kpi_service] = lambda: _StubKpiService()
    app.dependency_overrides[get_override_service] = lambda: _StubOverrideService()
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client_default() -> TestClient:
    app.dependency_overrides[get_task_service] = lambda: UnavailableTaskService()
    app.dependency_overrides[get_plan_service] = lambda: UnavailablePlanService()
    app.dependency_overrides[get_kpi_service] = lambda: UnavailableKpiService()
    app.dependency_overrides[get_override_service] = lambda: UnavailableOverrideService()
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Health endpoint tests
# ---------------------------------------------------------------------------

class TestHealthEndpoints:
    def test_root_returns_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "SIH26027 Block Planning API"

    def test_health_returns_healthy(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    def test_openapi_schema_is_accessible(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/openapi.json")
        assert resp.status_code == 200
        assert "paths" in resp.json()


# ---------------------------------------------------------------------------
# Task endpoint tests
# ---------------------------------------------------------------------------

class TestTaskEndpoints:
    def test_list_tasks_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks", params={"limit": 10, "offset": 0})
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert len(data["items"]) == 1

    def test_list_tasks_503_without_service(self, client_default) -> None:
        resp = client_default.get("/tasks")
        assert resp.status_code == 503

    def test_get_task_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks/1")
        assert resp.status_code == 200
        assert resp.json()["task_id"] == 1

    def test_get_task_404_for_unknown(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks/999")
        assert resp.status_code == 404

    def test_get_task_422_for_id_zero(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks/0")
        assert resp.status_code == 422

    def test_list_unscheduled_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks/unscheduled")
        assert resp.status_code == 200

    def test_list_tasks_503_when_default_service(self, client_default) -> None:
        resp = client_default.get("/tasks/1")
        assert resp.status_code == 503

    def test_list_tasks_accepts_pagination_params(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks", params={"limit": 5, "offset": 10})
        assert resp.status_code == 200

    def test_list_tasks_rejects_zero_limit(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks", params={"limit": 0})
        assert resp.status_code == 422

    def test_list_tasks_filters_by_corridor(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/tasks", params={"corridor_id": "COR_01"})
        assert resp.status_code == 200

    def test_score_tasks_endpoint_200(self, client_with_stubs) -> None:
        payload = {
            "tasks": [
                {
                    "task_id": 1,
                    "department": "Engineering",
                    "corridor_id": "COR_01",
                    "defect_severity": "A",
                    "days_overdue": 5,
                    "estimated_hours": 4.0,
                    "asset_age_years": 10,
                },
                {
                    "task_id": 2,
                    "department": "S&T",
                    "corridor_id": "COR_02",
                    "defect_severity": "B",
                    "days_overdue": 2,
                    "estimated_hours": 2.0,
                    "asset_age_years": 8,
                },
            ]
        }
        resp = client_with_stubs.post("/tasks/score", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert "scores" in data
        assert len(data["scores"]) == 2
        assert data["scores"][0]["task_id"] == 1
        assert data["scores"][1]["task_id"] == 2
        assert 0.0 <= data["scores"][0]["criticality_score"] <= 100.0
        assert 0.0 <= data["scores"][1]["criticality_score"] <= 100.0

    def test_score_tasks_endpoint_422_empty_tasks(self, client_with_stubs) -> None:
        resp = client_with_stubs.post("/tasks/score", json={"tasks": []})
        assert resp.status_code == 422



# ---------------------------------------------------------------------------
# Plan endpoint tests
# ---------------------------------------------------------------------------

class TestPlanEndpoints:
    def test_generate_plan_returns_202(self, client_with_stubs) -> None:
        resp = client_with_stubs.post("/generate-plan", json={
            "horizon_type": "weekly",
            "horizon_start": "2026-08-24",
            "horizon_end": "2026-08-30",
        })
        assert resp.status_code == 202
        data = resp.json()
        assert data["accepted"] is True
        assert data["status"] == "pending"
        assert data["job_id"] == "test-job-001"

    def test_generate_plan_422_for_bad_dates(self, client_with_stubs) -> None:
        resp = client_with_stubs.post("/generate-plan", json={
            "horizon_type": "weekly",
            "horizon_start": "2026-08-24",
            "horizon_end": "2026-08-28",  # Only 5 days, not 7
        })
        assert resp.status_code == 422

    def test_generate_plan_503_when_no_service(self, client_default) -> None:
        resp = client_default.post("/generate-plan", json={
            "horizon_type": "weekly",
            "horizon_start": "2026-08-24",
            "horizon_end": "2026-08-30",
        })
        assert resp.status_code == 503

    def test_get_plan_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/plan/1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["plan_id"] == 1
        assert data["status"] == "ready"

    def test_get_plan_404_for_unknown(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/plan/999")
        assert resp.status_code == 404

    def test_get_plan_422_for_id_zero(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/plan/0")
        assert resp.status_code == 422

    def test_generate_plan_with_filters(self, client_with_stubs) -> None:
        resp = client_with_stubs.post("/generate-plan", json={
            "horizon_type": "monthly",
            "horizon_start": "2026-08-01",
            "horizon_end": "2026-08-31",
            "corridor_id": "COR_01",
            "department": "Engineering",
        })
        assert resp.status_code == 202


# ---------------------------------------------------------------------------
# KPI endpoint tests
# ---------------------------------------------------------------------------

class TestKpiEndpoints:
    def test_availability_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/kpis/availability", params={"plan_id": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert "asset_availability_percent" in data
        assert 0 <= data["asset_availability_percent"] <= 100

    def test_availability_503_no_service(self, client_default) -> None:
        resp = client_default.get("/kpis/availability")
        assert resp.status_code == 503

    def test_utilization_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/kpis/utilization")
        assert resp.status_code == 200
        data = resp.json()
        assert "block_utilization_percent" in data

    def test_utilization_503_no_service(self, client_default) -> None:
        resp = client_default.get("/kpis/utilization")
        assert resp.status_code == 503

    def test_critical_tasks_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/kpis/critical-tasks", params={"plan_id": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert len(data["items"]) == 1

    def test_critical_tasks_503_no_service(self, client_default) -> None:
        resp = client_default.get("/kpis/critical-tasks")
        assert resp.status_code == 503

    def test_kpi_invalid_plan_id_422(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/kpis/availability", params={"plan_id": 0})
        assert resp.status_code == 422

    def test_critical_tasks_pagination(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/kpis/critical-tasks", params={"limit": 5, "offset": 0})
        assert resp.status_code == 200

    def test_kpi_corridor_filter_accepted(self, client_with_stubs) -> None:
        resp = client_with_stubs.get("/kpis/availability", params={"corridor_id": "COR_01"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Override endpoint tests
# ---------------------------------------------------------------------------

class TestOverrideEndpoints:
    def _override_body(self, plan_id=1, task_id=1, action="unschedule", window_id=None):
        body: dict = {
            "plan_id": plan_id, "task_id": task_id,
            "action": action,
            "reason": "Required override due to track maintenance conflict.",
        }
        if window_id is not None:
            body["target_window_id"] = window_id
        return body

    def test_override_unschedule_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.put("/plan/1/override", json=self._override_body())
        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "unschedule"
        assert "override_id" in data
        assert "reason" in data

    def test_override_reassign_200(self, client_with_stubs) -> None:
        resp = client_with_stubs.put(
            "/plan/1/override",
            json=self._override_body(action="reassign", window_id=20),
        )
        assert resp.status_code == 200

    def test_override_503_no_service(self, client_default) -> None:
        resp = client_default.put("/plan/1/override", json=self._override_body())
        assert resp.status_code == 503

    def test_override_422_for_plan_id_zero(self, client_with_stubs) -> None:
        resp = client_with_stubs.put("/plan/0/override", json=self._override_body(plan_id=0))
        assert resp.status_code == 422

    def test_override_409_for_plan_id_mismatch(self, client_with_stubs) -> None:
        # Path is /plan/1 but body has plan_id=2
        body = self._override_body(plan_id=2)
        resp = client_with_stubs.put("/plan/1/override", json=body)
        assert resp.status_code == 409

    def test_override_422_for_short_reason(self, client_with_stubs) -> None:
        body = self._override_body()
        body["reason"] = "short"  # Less than 10 chars
        resp = client_with_stubs.put("/plan/1/override", json=body)
        assert resp.status_code == 422

    def test_override_response_has_audit_fields(self, client_with_stubs) -> None:
        resp = client_with_stubs.put("/plan/1/override", json=self._override_body())
        data = resp.json()
        assert "override_id" in data
        assert "overridden_at" in data
        assert "reason" in data
