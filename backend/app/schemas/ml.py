"""DTOs and validation models for ML Criticality Scoring integration.

These models define the integration contract between the FastAPI backend
and the Group 1 ML Criticality Scoring model.
"""

from __future__ import annotations

from typing import Any

from pydantic import ConfigDict, Field

from app.schemas.common import (
    ApiModel,
    CorridorId,
    CriticalityScore,
    DurationHours,
    EntityId,
)
from app.schemas.enums import DefectSeverity, Department


class MLTaskFeature(ApiModel):
    """Features extracted from a maintenance task for criticality scoring.

    Matches the exact feature set required by the ML model.
    """

    task_id: EntityId
    department: Department
    corridor_id: CorridorId
    defect_severity: DefectSeverity
    days_overdue: int = Field(ge=0, le=3650, description="Number of days task is overdue.")
    estimated_hours: DurationHours = Field(
        description="Estimated duration required for maintenance in hours."
    )
    asset_age_years: int = Field(ge=0, le=120, description="Age of the railway asset in years.")


class MLTaskScoreItem(ApiModel):
    """Scored output for a single maintenance task from the ML component."""

    task_id: EntityId
    criticality_score: CriticalityScore = Field(
        description="Predicted criticality score on a strict 0.0–100.0 scale."
    )
    predicted_risk: float | None = Field(
        default=None,
        description="Raw regression/risk prediction prior to 0–100 normalization (optional).",
    )
    ranking_metadata: dict[str, Any] | None = Field(
        default=None,
        description="Optional metadata such as feature importances, confidence intervals, or flags.",
    )


class MLBatchScoringRequest(ApiModel):
    """Batch request envelope containing tasks to be scored."""

    model_config = ConfigDict(protected_namespaces=())

    tasks: list[MLTaskFeature] = Field(
        min_length=1,
        description="Non-empty list of task feature items to score in batch.",
    )
    model_version: str | None = Field(
        default=None,
        description="Optional expected model version tag or experiment ID.",
    )


class MLBatchScoringResponse(ApiModel):
    """Batch response envelope containing scored task items from the ML component."""

    model_config = ConfigDict(protected_namespaces=())

    scores: list[MLTaskScoreItem] = Field(
        description="List of scored results corresponding to requested tasks.",
    )
    model_version: str | None = Field(
        default=None,
        description="Version/tag of the model that performed the inference.",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Optional inference metadata (batch execution time, backend engine, etc.).",
    )

