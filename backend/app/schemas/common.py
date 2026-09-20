"""Shared field types, pagination, and error envelopes."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.enums import ErrorCode

# Positive integers match the prototype CSV identifiers (task_id, window_id).
# Person 2 must confirm whether production PKs stay integer or become UUID.
EntityId = Annotated[int, Field(gt=0, description="Positive integer entity identifier.")]

CorridorId = Annotated[
    str,
    StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$"),
    Field(description="Corridor identifier, e.g. COR_01."),
]

CriticalityScore = Annotated[
    float,
    Field(
        ge=0,
        le=100,
        description="ML criticality on the project's 0–100 scale.",
    ),
]

DurationHours = Annotated[
    float,
    Field(gt=0, le=24, description="Duration in hours for a single day window or task."),
]

OverrideReason = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=10, max_length=2000),
    Field(description="Planner justification; SIH requires override reasons to be logged."),
]


class ApiModel(BaseModel):
    """Base model: strip strings, reject unknown fields, ORM-compatible later."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        from_attributes=True,
    )


class PaginationParams(ApiModel):
    limit: int = Field(default=50, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class PageMeta(ApiModel):
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
    total: int = Field(ge=0)


class FieldError(ApiModel):
    field: str
    message: str


class ErrorResponse(ApiModel):
    error: ErrorCode
    message: str
    details: list[FieldError] | None = None


class MessageResponse(ApiModel):
    message: str
    extra: dict[str, Any] | None = None
