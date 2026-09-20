"""Unit tests for Celery asynchronous plan generation tasks and worker configuration.

Tests verify:
  - Celery application settings and broker configuration.
  - Task submission and background execution.
  - Failure handling and durable failure recording in persistence.
  - Transient network error handling.
  - Response contract compliance (accepted, job_id, status=pending).
"""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    PlanStatus,
    PlanningHorizonType,
    Weekday,
)
from app.schemas.horizon import PlanGenerateRequest
from app.schemas.internal import OptimizerInput, OptimizerResult, OptimizerWindow, ScoredTask
from app.schemas.kpis import KpiResponse
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.services.exceptions import ApiServiceError
from app.services.plan_service import ConcretePlanService
from workers.celery_app import celery_app
from workers.plan_tasks import generate_plan_background_task


_WEEKLY_PAYLOAD = {
    "horizon_type": "weekly",
    "horizon_start": "2026-08-24",
    "horizon_end": "2026-08-30",
    "corridor_id": "COR_01",
    "department": "Engineering",
}


def _dummy_optimizer_result() -> OptimizerResult:
    return OptimizerResult(
        assignments=[
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
            )
        ],
        kpis=KpiResponse(
            total_tasks=1,
            scheduled_tasks=1,
            unscheduled_tasks=0,
            critical_unscheduled_tasks=0,
            asset_availability_percent=100.0,
            scheduled_hours=4.0,
            available_window_hours=8.0,
        ),
    )


class TestCeleryAppConfig:
    def test_celery_app_is_configured(self) -> None:
        assert celery_app.main == "block_planning_workers"
        assert celery_app.conf.task_serializer == "json"
        assert celery_app.conf.result_serializer == "json"
        assert celery_app.conf.timezone == "UTC"
        assert "workers.plan_tasks" in celery_app.conf.imports


class TestPlanTasksWorker:
    def test_generate_plan_background_task_success(self) -> None:
        mock_plan_service = MagicMock(spec=ConcretePlanService)
        mock_plan_service.execute_generation.return_value = _dummy_optimizer_result()

        with patch("app.services.get_plan_service", return_value=mock_plan_service):
            result = generate_plan_background_task(
                plan_id=42,
                payload_dict=_WEEKLY_PAYLOAD,
            )

        assert result["plan_id"] == 42
        assert result["status"] == PlanStatus.READY.value
        assert result["scheduled_tasks"] == 1
        assert result["asset_availability_percent"] == 100.0
        mock_plan_service.execute_generation.assert_called_once()

    def test_generate_plan_background_task_failure_marks_plan_failed(self) -> None:
        mock_plan_service = MagicMock(spec=ConcretePlanService)
        mock_plan_service.execute_generation.side_effect = ApiServiceError(
            "Optimizer timed out after 30 seconds"
        )

        with patch("app.services.get_plan_service", return_value=mock_plan_service):
            with pytest.raises(ApiServiceError, match="Optimizer timed out"):
                generate_plan_background_task(
                    plan_id=42,
                    payload_dict=_WEEKLY_PAYLOAD,
                )

        # Verify failure was durably logged to repository
        mock_plan_service.mark_failed.assert_called_once()
        args, _ = mock_plan_service.mark_failed.call_args
        assert args[0] == 42
        assert "Optimizer timed out" in args[1]

    def test_generate_plan_background_task_transient_connection_error_raises_for_retry(
        self,
    ) -> None:
        mock_plan_service = MagicMock(spec=ConcretePlanService)
        mock_plan_service.execute_generation.side_effect = ConnectionError(
            "Redis connection reset by peer"
        )

        with patch("app.services.get_plan_service", return_value=mock_plan_service):
            with pytest.raises(ConnectionError, match="connection reset"):
                generate_plan_background_task(
                    plan_id=42,
                    payload_dict=_WEEKLY_PAYLOAD,
                )


class TestPlanServiceCeleryDispatch:
    def test_generate_plan_dispatches_celery_task(self) -> None:
        mock_task_repo = MagicMock()
        mock_window_repo = MagicMock()
        mock_plan_repo = MagicMock()
        mock_ml = MagicMock()
        mock_optimizer = MagicMock()

        mock_plan_repo.create_pending.return_value = PlanJobResponse(
            accepted=True,
            job_id="pending-repo-id-42",
            plan_id=42,
            horizon_type="weekly",
            status=PlanStatus.PENDING,
        )

        service = ConcretePlanService(
            task_repo=mock_task_repo,
            window_repo=mock_window_repo,
            plan_repo=mock_plan_repo,
            ml=mock_ml,
            optimizer=mock_optimizer,
        )

        request = PlanGenerateRequest(
            horizon_type=PlanningHorizonType.WEEKLY,
            horizon_start=date(2026, 8, 24),
            horizon_end=date(2026, 8, 30),
            corridor_id="COR_01",
        )

        with patch(
            "workers.plan_tasks.generate_plan_background_task.delay"
        ) as mock_delay:
            mock_async_result = MagicMock()
            mock_async_result.id = "celery-task-uuid-999"
            mock_delay.return_value = mock_async_result

            job = service.generate_plan(request)

        assert job.accepted is True
        assert job.job_id == "celery-task-uuid-999"
        assert job.plan_id == 42
        assert job.status is PlanStatus.PENDING
        mock_delay.assert_called_once()
