"""KPI query and response schemas."""

from __future__ import annotations

from datetime import date

from pydantic import Field

from app.schemas.common import ApiModel, CorridorId, EntityId, PageMeta
from app.schemas.enums import Department, PlanningHorizonType
from app.schemas.tasks import UnscheduledCriticalTaskResponse



class KpiQuery(ApiModel):
    plan_id: EntityId | None = None
    corridor_id: CorridorId | None = None
    department: Department | None = None
    horizon_type: PlanningHorizonType | None = None
    horizon_start: date | None = None



class KpiResponse(ApiModel):
    """Plan quality metrics. Prototype asset availability is scheduled/total * 100."""

    plan_id: EntityId | None = None
    horizon_type: PlanningHorizonType | None = None
    horizon_start: date | None = None
    horizon_end: date | None = None
    corridor_id: CorridorId | None = None
    department: Department | None = None
    total_tasks: int = Field(ge=0)
    scheduled_tasks: int = Field(ge=0)
    unscheduled_tasks: int = Field(ge=0)
    critical_unscheduled_tasks: int = Field(
        ge=0,
        description="Unscheduled tasks with defect severity A.",
    )
    asset_availability_percent: float = Field(
        ge=0,
        le=100,
        description=(
            "Prototype definition: scheduled_tasks / total_tasks * 100. "
            "Evaluates overall task fulfillment."
        ),
    )
    scheduled_hours: float = Field(default=0, ge=0)
    available_window_hours: float = Field(default=0, ge=0)
    block_utilization_percent: float = Field(
        default=0.0,
        ge=0,
        description="Window utilization definition: (scheduled_hours / available_window_hours) * 100.",
    )
    plan_generation_seconds: float | None = Field(
        default=None,
        ge=0,
        description="Duration in seconds taken by the ML + OR-Tools solver optimization pipeline.",
    )



class CriticalTasksKpiResponse(ApiModel):
    """Unscheduled critical work for the KPI surface."""

    items: list[UnscheduledCriticalTaskResponse]
    meta: PageMeta
