"""Plan assignment (task placed in a window, or left unscheduled)."""

from __future__ import annotations

from pydantic import model_validator

from app.schemas.common import (
    ApiModel,
    CorridorId,
    CriticalityScore,
    DurationHours,
    EntityId,
)
from app.schemas.enums import AssignmentStatus, DefectSeverity, Department, Weekday


class PlanAssignmentResponse(ApiModel):
    """One row of a generated block plan, aligned with schedule.csv semantics."""

    task_id: EntityId
    window_id: EntityId | None = None
    corridor_id: CorridorId
    department: Department
    day: Weekday | None = None
    estimated_hours: DurationHours
    criticality_score: CriticalityScore
    defect_severity: DefectSeverity
    status: AssignmentStatus

    @model_validator(mode="after")
    def validate_assignment_consistency(self) -> "PlanAssignmentResponse":
        if self.status is AssignmentStatus.UNSCHEDULED:
            if self.window_id is not None or self.day is not None:
                raise ValueError("unscheduled assignments must not include window_id or day")
        elif self.status in {AssignmentStatus.SCHEDULED, AssignmentStatus.OVERRIDDEN}:
            if self.window_id is None or self.day is None:
                raise ValueError("scheduled assignments require window_id and day")
        return self
