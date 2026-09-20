"""Maintenance task request and response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import (
    ApiModel,
    CorridorId,
    CriticalityScore,
    DurationHours,
    EntityId,
    PageMeta,
)
from app.schemas.enums import DefectSeverity, Department, TaskStatus


class MaintenanceTaskBase(ApiModel):
    """Fields shared with the current task CSV / scoring feature set."""

    department: Department
    corridor_id: CorridorId
    defect_severity: DefectSeverity
    days_overdue: int = Field(ge=0, le=3650)
    estimated_hours: DurationHours
    asset_age_years: int = Field(ge=0, le=120)


class MaintenanceTaskCreate(MaintenanceTaskBase):
    """Client-provided task. Criticality is produced by the ML service, not the client."""


class MaintenanceTaskUpdate(ApiModel):
    department: Department | None = None
    corridor_id: CorridorId | None = None
    defect_severity: DefectSeverity | None = None
    days_overdue: int | None = Field(default=None, ge=0, le=3650)
    estimated_hours: DurationHours | None = None
    asset_age_years: int | None = Field(default=None, ge=0, le=120)
    status: TaskStatus | None = None


class MaintenanceTaskResponse(MaintenanceTaskBase):
    task_id: EntityId
    status: TaskStatus = TaskStatus.OPEN
    criticality_score: CriticalityScore | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class MaintenanceTaskListResponse(ApiModel):
    items: list[MaintenanceTaskResponse]
    meta: PageMeta


class UnscheduledCriticalTaskResponse(ApiModel):
    """Severity-A (or equivalently critical) work left out of a plan."""

    plan_id: EntityId
    task_id: EntityId
    department: Department
    corridor_id: CorridorId
    defect_severity: DefectSeverity
    days_overdue: int = Field(ge=0, le=3650)
    estimated_hours: DurationHours
    criticality_score: CriticalityScore
    status: TaskStatus = TaskStatus.UNSCHEDULED
