"""Block-plan HTTP routes. Business rules live in ``PlanService``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.routers.responses import NOT_FOUND_RESPONSES, UNAVAILABLE_RESPONSES
from app.schemas.horizon import PlanGenerateRequest
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.services import get_plan_service
from app.services.plans import PlanService

router = APIRouter(tags=["plans"])


@router.post(
    "/generate-plan",
    response_model=PlanJobResponse,
    status_code=202,
    responses=UNAVAILABLE_RESPONSES,
    summary="Request asynchronous block-plan generation",
    description=(
        "Accepts a planning horizon and optional corridor/department filter. "
        "Enqueues background optimization job in Celery worker and returns "
        "a job handle immediately (HTTP 202 Accepted). "
        "Poll GET /plan/{plan_id} for the completed plan status."
    ),
)
def generate_plan(
    payload: PlanGenerateRequest,
    service: Annotated[PlanService, Depends(get_plan_service)],
) -> PlanJobResponse:
    return service.generate_plan(payload)


@router.get(
    "/plan/{plan_id}",
    response_model=BlockPlanResponse,
    responses=NOT_FOUND_RESPONSES,
    summary="Retrieve a completed block plan by ID",
)
def get_plan(
    plan_id: int,
    service: Annotated[PlanService, Depends(get_plan_service)],
) -> BlockPlanResponse:
    if plan_id < 1:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="plan_id must be greater than 0")
    return service.get_plan(plan_id)
