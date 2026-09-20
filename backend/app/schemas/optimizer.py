"""DTOs and validation models for OR-Tools Scheduling Optimizer integration.

These models define the integration contract between the FastAPI backend
and the Group 1 Scheduling Optimizer (OR-Tools / CP-SAT).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import (
    ApiModel,
    CorridorId,
    CriticalityScore,
    DurationHours,
    EntityId,
)
from app.schemas.enums import DefectSeverity, Department, Weekday
from app.schemas.horizon import PlanningHorizonSpec
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



class OptimizerWindow(ApiModel):
    """Block window model passed to the scheduling optimizer."""

    window_id: EntityId
    corridor_id: CorridorId
    day: Weekday
    available_hours: DurationHours
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class OptimizerConstraints(ApiModel):
    """Optional solver hyperparameters and operational constraints."""

    max_solver_duration_seconds: float = Field(
        default=30.0,
        gt=0,
        le=600.0,
        description="Maximum solver execution time before timeout.",
    )
    enforce_corridor_matching: bool = Field(
        default=True,
        description="Whether a task must strictly be placed into a window of the same corridor.",
    )
    enforce_capacity_limits: bool = Field(
        default=True,
        description="Whether window available_hours cannot be exceeded.",
    )
    custom_parameters: dict[str, Any] | None = Field(
        default=None,
        description="Optional solver weighting or engine-specific flags.",
    )


class OptimizerMetadata(ApiModel):
    """Solver diagnostics and execution telemetry returned by the optimizer."""

    model_config = ConfigDict(protected_namespaces=())

    solver_status: str = Field(
        default="OPTIMAL",
        description="Solver outcome status, e.g. OPTIMAL, FEASIBLE, INFEASIBLE, TIMEOUT, MODEL_INVALID.",
    )
    objective_value: float | None = Field(
        default=None,
        description="Calculated objective value from the CP-SAT / MILP solver.",
    )
    solve_time_seconds: float | None = Field(
        default=None,
        ge=0,
        description="Execution time spent by the solver in seconds.",
    )
    solver_engine: str | None = Field(
        default="Google OR-Tools CP-SAT",
        description="Name/version of the underlying optimization engine.",
    )
    unscheduled_reasons: dict[int, str] | None = Field(
        default=None,
        description="Mapping of task_id to human-readable explanation of why it could not be scheduled.",
    )
    extra: dict[str, Any] | None = Field(
        default=None,
        description="Additional diagnostic or telemetry fields.",
    )


class OptimizerInput(ApiModel):
    """Batch input payload sent to the scheduling optimizer."""

    tasks: list[ScoredTask] = Field(
        min_length=1,
        description="Ranked/scored maintenance tasks requiring block allocation.",
    )
    windows: list[OptimizerWindow] = Field(
        min_length=1,
        description="Available block windows within the planning horizon.",
    )
    horizon: PlanningHorizonSpec | None = Field(
        default=None,
        description="Planning horizon specification (daily, weekly, or monthly).",
    )
    constraints: OptimizerConstraints | None = Field(
        default=None,
        description="Optional scheduling constraints and solver limits.",
    )


class OptimizerResult(ApiModel):
    """Optimized block plan result returned by the scheduling optimizer."""

    assignments: list[PlanAssignmentResponse] = Field(
        description="Complete list of task assignments (both scheduled and unscheduled).",
    )
    kpis: KpiResponse = Field(
        description="Pre-computed KPIs summarizing schedule performance.",
    )
    metadata: OptimizerMetadata | None = Field(
        default=None,
        description="Diagnostic solver telemetry and execution metadata.",
    )
