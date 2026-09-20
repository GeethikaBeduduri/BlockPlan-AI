"""Internal DTOs for ML scoring and optimizer services (not public HTTP models).

These exist so routers/services can share a typed contract later without
coupling to CSV files or to Person 2's ORM.
"""

from __future__ import annotations

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import (
    ApiModel,
    CorridorId,
    CriticalityScore,
    DurationHours,
    EntityId,
)
from app.schemas.enums import DefectSeverity, Department, Weekday
from app.schemas.kpis import KpiResponse


class ScoredTask(ApiModel):
    """Maintenance task after ML criticality scoring."""

    task_id: EntityId
    department: Department
    corridor_id: CorridorId
    defect_severity: DefectSeverity
    days_overdue: int
    estimated_hours: DurationHours
    asset_age_years: int
    criticality_score: CriticalityScore


from app.schemas.optimizer import (
    OptimizerConstraints,
    OptimizerInput,
    OptimizerMetadata,
    OptimizerResult,
    OptimizerWindow,
)

__all__ = [
    "OptimizerConstraints",
    "OptimizerInput",
    "OptimizerMetadata",
    "OptimizerResult",
    "OptimizerWindow",
    "ScoredTask",
]

