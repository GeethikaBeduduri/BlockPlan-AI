"""Block-window request and response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import model_validator

from app.schemas.common import ApiModel, CorridorId, DurationHours, EntityId, PageMeta
from app.schemas.enums import Weekday

_PYTHON_WEEKDAY_TO_LABEL = {
    0: Weekday.MON,
    1: Weekday.TUE,
    2: Weekday.WED,
    3: Weekday.THU,
    4: Weekday.FRI,
    5: Weekday.SAT,
    6: Weekday.SUN,
}


class BlockWindowBase(ApiModel):
    corridor_id: CorridorId
    day: Weekday
    available_hours: DurationHours
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="after")
    def validate_window_bounds(self) -> "BlockWindowBase":
        if (self.starts_at is None) ^ (self.ends_at is None):
            raise ValueError("starts_at and ends_at must both be set or both omitted")
        if self.starts_at is not None and self.ends_at is not None:
            if self.ends_at <= self.starts_at:
                raise ValueError("ends_at must be after starts_at")
            elapsed_hours = (self.ends_at - self.starts_at).total_seconds() / 3600
            if self.available_hours > elapsed_hours + 1e-6:
                raise ValueError("available_hours cannot exceed elapsed window time")
            actual_day = _PYTHON_WEEKDAY_TO_LABEL[self.starts_at.weekday()]
            if actual_day != self.day:
                raise ValueError("day must match starts_at weekday")
        return self


class BlockWindowCreate(BlockWindowBase):
    """Client-provided possession/block window."""


class BlockWindowUpdate(ApiModel):
    corridor_id: CorridorId | None = None
    day: Weekday | None = None
    available_hours: DurationHours | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class BlockWindowResponse(BlockWindowBase):
    window_id: EntityId
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BlockWindowListResponse(ApiModel):
    items: list[BlockWindowResponse]
    meta: PageMeta
