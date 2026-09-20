"""Daily, weekly, and monthly planning-horizon validation."""

from __future__ import annotations

from datetime import date

from pydantic import model_validator

from app.schemas.common import ApiModel, CorridorId
from app.schemas.enums import Department, PlanningHorizonType


class PlanningHorizonSpec(ApiModel):
    """Inclusive calendar range for a generated block plan."""

    horizon_type: PlanningHorizonType
    horizon_start: date
    horizon_end: date

    @model_validator(mode="after")
    def validate_horizon_span(self) -> "PlanningHorizonSpec":
        if self.horizon_end < self.horizon_start:
            raise ValueError("horizon_end must be on or after horizon_start")
        span_days = (self.horizon_end - self.horizon_start).days
        if self.horizon_type is PlanningHorizonType.DAILY:
            if span_days != 0:
                raise ValueError(
                    "daily horizon must cover a single inclusive day "
                    "(horizon_end = horizon_start)"
                )
        elif self.horizon_type is PlanningHorizonType.WEEKLY:
            if span_days != 6:
                raise ValueError(
                    "weekly horizon must cover exactly 7 inclusive days "
                    "(horizon_end = horizon_start + 6 days)"
                )
        elif self.horizon_type is PlanningHorizonType.MONTHLY:
            # Inclusive lengths 28–31 days => span 27–30.
            if span_days < 27 or span_days > 30:
                raise ValueError(
                    "monthly horizon must cover 28–31 inclusive days "
                    "(horizon_end - horizon_start between 27 and 30)"
                )
        return self


class PlanGenerateRequest(PlanningHorizonSpec):
    """Request body for asynchronous plan generation (routers come later)."""

    corridor_id: CorridorId | None = None
    department: Department | None = None
