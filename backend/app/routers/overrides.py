"""Planner-override HTTP routes. Business rules live in ``OverrideService``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.routers.responses import OVERRIDE_RESPONSES
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.services import get_override_service
from app.services.overrides import OverrideService

router = APIRouter(tags=["overrides"])


@router.put(
    "/plan/{plan_id}/override",
    response_model=PlannerOverrideResponse,
    status_code=200,
    responses=OVERRIDE_RESPONSES,
    summary="Apply a planner override to an existing plan",
    description=(
        "Manually reassigns, force-schedules, or removes a task from a generated plan. "
        "A logged reason is mandatory for SIH audit requirements. "
        "The plan_id in the URL path must match the plan_id in the request body. "
        "Returns 503 until Person 2 persistence is ready."
    ),
)
def apply_override(
    plan_id: int,
    payload: PlannerOverrideCreate,
    service: Annotated[OverrideService, Depends(get_override_service)],
) -> PlannerOverrideResponse:
    if plan_id < 1:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="plan_id must be greater than 0")
    return service.apply_override(plan_id, payload)
