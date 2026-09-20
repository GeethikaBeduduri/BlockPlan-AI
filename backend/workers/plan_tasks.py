"""Celery tasks for background block-plan generation.

Architecture Boundary
---------------------
This module contains ONLY Celery task registration, serialization, and retry logic.
ALL business logic, ML orchestration, and solver invocations remain in ``PlanService``.
"""

from __future__ import annotations

import logging
from typing import Any

from app.schemas.enums import PlanStatus
from app.schemas.horizon import PlanGenerateRequest
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="workers.plan_tasks.generate_plan_background_task",
    max_retries=3,
    default_retry_delay=10,
    retry_backoff=True,
    autoretry_for=(ConnectionError,),
)
def generate_plan_background_task(
    self: Any,
    plan_id: int,
    payload_dict: dict[str, Any],
) -> dict[str, Any]:
    """Execute asynchronous block-plan generation in the worker process.

    Workflow:
      1. Deserializes and validates ``PlanGenerateRequest``.
      2. Invokes application ``PlanService`` to fetch data, score via ML,
         and solve via OR-Tools.
      3. Persists the resulting assignments and KPIs through the repository.
      4. On unrecoverable failure, marks the plan as FAILED in persistence.
    """
    from app.services import get_plan_service
    from app.services.plan_service import ConcretePlanService

    logger.info("Executing background plan generation task for plan_id=%s", plan_id)
    plan_service = get_plan_service()

    try:
        payload = PlanGenerateRequest.model_validate(payload_dict)

        if isinstance(plan_service, ConcretePlanService):
            result = plan_service.execute_generation(plan_id, payload)
            return {
                "plan_id": plan_id,
                "status": PlanStatus.READY.value,
                "total_tasks": result.kpis.total_tasks,
                "scheduled_tasks": result.kpis.scheduled_tasks,
                "asset_availability_percent": result.kpis.asset_availability_percent,
            }
        else:
            # Fallback for stub services
            job = plan_service.generate_plan(payload)
            return {
                "plan_id": plan_id,
                "status": job.status.value,
            }

    except ConnectionError:
        logger.warning(
            "Transient network error during plan generation for plan_id=%s. Retrying...",
            plan_id,
        )
        raise
    except Exception as exc:
        logger.error(
            "Background plan generation failed for plan_id=%s: %s",
            plan_id,
            exc,
            exc_info=True,
        )
        if isinstance(plan_service, ConcretePlanService):
            plan_service.mark_failed(plan_id, str(exc))
        raise
