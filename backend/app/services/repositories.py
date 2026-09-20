"""Repository abstractions (data-access contracts) for Person 1 services.

These Protocols define the exact interface that Person 2 must implement in
``app/database.py`` and ``app/models/``.  Person 1 services depend only on
these Protocols — never on SQLAlchemy sessions or raw SQL.

CONTRACT AGREEMENT REQUIRED WITH PERSON 2
------------------------------------------
Every method listed here is an integration contract.  Person 2 must implement
a concrete class that satisfies each Protocol before the service layer can be
wired for production.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.schemas.common import PaginationParams
from app.schemas.enums import Department, TaskStatus
from app.schemas.internal import OptimizerResult, OptimizerWindow, ScoredTask
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.schemas.windows import BlockWindowListResponse


@runtime_checkable
class TaskRepository(Protocol):
    """Read-only access to maintenance task rows.

    Person 2 implements this against the PostgreSQL/TimescaleDB task table.
    """

    def get_by_id(self, task_id: int) -> MaintenanceTaskResponse:
        """Return a single task or raise ``NotFoundError``."""
        ...

    def list_tasks(
        self,
        *,
        pagination: PaginationParams,
        corridor_id: str | None,
        department: Department | None,
        status: TaskStatus | None,
    ) -> MaintenanceTaskListResponse:
        """Return a paginated, filtered list of maintenance tasks."""
        ...

    def list_unscheduled(
        self,
        *,
        pagination: PaginationParams,
        plan_id: int | None,
        corridor_id: str | None,
        critical_only: bool,
    ) -> MaintenanceTaskListResponse:
        """Return tasks with status=unscheduled, optionally scoped to a plan."""
        ...

    def list_open_for_scoring(
        self,
        *,
        corridor_id: str | None,
        department: Department | None,
    ) -> list[ScoredTask]:
        """Return open tasks shaped as ``ScoredTask`` (criticality_score=0).

        The service layer will populate criticality_score via ``MlScoringService``
        before passing the list to the optimizer.
        """
        ...


@runtime_checkable
class WindowRepository(Protocol):
    """Read-only access to block-window rows.

    Person 2 implements this against the PostgreSQL block_window table.
    """

    def list_windows(
        self,
        *,
        corridor_id: str | None,
        horizon_start: object,  # datetime.date
        horizon_end: object,    # datetime.date
    ) -> list[OptimizerWindow]:
        """Return windows that fall within the planning horizon."""
        ...

    def list_all(self, *, corridor_id: str | None) -> BlockWindowListResponse:
        """Return all configured windows for a corridor (or all corridors)."""
        ...


@runtime_checkable
class PlanRepository(Protocol):
    """Persistence for generated block plans.

    Person 2 implements this to store/retrieve plans and assignments.
    """

    def create_pending(
        self,
        *,
        horizon_type: str,
        horizon_start: object,  # datetime.date
        horizon_end: object,    # datetime.date
        corridor_id: str | None,
        department: Department | None,
    ) -> PlanJobResponse:
        """Insert a plan record with status=pending and return the job handle."""
        ...

    def save_result(
        self,
        *,
        plan_id: int,
        result: OptimizerResult,
    ) -> BlockPlanResponse:
        """Persist optimizer assignments + KPIs and flip status to ready."""
        ...

    def mark_failed(self, *, plan_id: int, reason: str) -> None:
        """Flip plan status to failed and store the failure reason."""
        ...

    def get_by_id(self, plan_id: int) -> BlockPlanResponse:
        """Return a full plan with assignments and KPIs or raise ``NotFoundError``."""
        ...


@runtime_checkable
class OverrideRepository(Protocol):
    """Persistence for planner-override audit records.

    Person 2 implements this so every manual change is durably logged.
    """

    def record_override(
        self,
        *,
        plan_id: int,
        payload: PlannerOverrideCreate,
        overridden_by: str | None,
    ) -> PlannerOverrideResponse:
        """Persist the override and return the stored record with its DB-assigned ID."""
        ...
