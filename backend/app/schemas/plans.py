"""Block plan request and response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import ApiModel, EntityId, PageMeta
from app.schemas.enums import PlanStatus
from app.schemas.horizon import PlanGenerateRequest, PlanningHorizonSpec
from app.schemas.kpis import KpiResponse


class BlockPlanResponse(PlanningHorizonSpec):
    plan_id: EntityId
    status: PlanStatus
    assignments: list[PlanAssignmentResponse] = Field(default_factory=list)
    kpis: KpiResponse | None = None
    generated_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BlockPlanSummaryResponse(PlanningHorizonSpec):
    plan_id: EntityId
    status: PlanStatus
    generated_at: datetime | None = None


class BlockPlanListResponse(ApiModel):
    items: list[BlockPlanSummaryResponse]
    meta: PageMeta


class PlanJobResponse(ApiModel):
    """Handle returned when plan generation is accepted for async processing."""

    accepted: bool = Field(
        default=True,
        description="Whether the plan generation job was accepted for queueing.",
    )
    job_id: str = Field(
        description="Unique asynchronous task identifier (Celery task UUID or job handle).",
    )
    plan_id: EntityId | None = Field(
        default=None,
        description="Reserved plan record ID in the persistence layer.",
    )
    horizon_type: str | None = Field(
        default=None,
        description="Planning horizon type (daily, weekly, or monthly).",
    )
    status: PlanStatus = Field(
        default=PlanStatus.PENDING,
        description="Current status of the queued plan (pending / generating / ready / failed).",
    )



__all__ = [
    "BlockPlanListResponse",
    "BlockPlanResponse",
    "BlockPlanSummaryResponse",
    "PlanGenerateRequest",
    "PlanJobResponse",
]
