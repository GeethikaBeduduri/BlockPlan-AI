"""Planner override request and response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field, model_validator

from app.schemas.common import ApiModel, EntityId, OverrideReason, PageMeta
from app.schemas.enums import OverrideAction


class PlannerOverrideCreate(ApiModel):
    """Manual change to a generated plan. Reason is mandatory for SIH audit logging."""

    plan_id: EntityId
    task_id: EntityId
    action: OverrideAction
    target_window_id: EntityId | None = None
    reason: OverrideReason

    @model_validator(mode="after")
    def validate_action_window(self) -> "PlannerOverrideCreate":
        needs_window = self.action in {
            OverrideAction.REASSIGN,
            OverrideAction.FORCE_SCHEDULE,
        }
        if needs_window and self.target_window_id is None:
            raise ValueError("reassign and force_schedule require target_window_id")
        if self.action is OverrideAction.UNSCHEDULE and self.target_window_id is not None:
            raise ValueError("unschedule must not include target_window_id")
        return self


class PlannerOverrideResponse(ApiModel):
    override_id: EntityId
    plan_id: EntityId
    task_id: EntityId
    action: OverrideAction
    target_window_id: EntityId | None = None
    reason: OverrideReason
    overridden_by: str | None = Field(
        default=None,
        description="Planner identity. Auth/user store is not defined yet.",
        min_length=1,
        max_length=128,
    )
    overridden_at: datetime | None = None


class PlannerOverrideListResponse(ApiModel):
    items: list[PlannerOverrideResponse]
    meta: PageMeta
