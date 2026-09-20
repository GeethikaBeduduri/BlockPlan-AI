"""SQLAlchemy repository adapters connecting Person 1 services to Person 2's database layer.

Architecture:
- Implements ``TaskRepository``, ``WindowRepository``, and ``PlanRepository`` protocols
  defined in ``app/services/repositories.py``.
- Uses Person 2's SQLAlchemy models (``MaintenanceTask``, ``BlockWindow``, ``BlockPlan``,
  ``PlanAssignment``) from ``backend/database/models.py``.
- Uses Person 2's session management from ``backend/database/connection.py``.
- Preserves Person 1 schema validation, error handling, and type safety.
- Does NOT modify Person 2 source code or database tables.

UNSCHEDULED assignment design contract
---------------------------------------
The ``plan_assignments`` table has ``window_id NOT NULL``.  This makes it impossible to
persist a row for an unscheduled task.  The agreed strategy is:

  - ``save_result``: persist **only** SCHEDULED (and OVERRIDDEN) assignments whose
    ``PlanAssignmentResponse.window_id`` is not None.
  - ``get_by_id``: reconstruct unscheduled assignments from the optimizer result stored in
    the task list snapshot embedded in the ``BlockPlan`` row.  Because we store
    ``total_tasks`` and ``scheduled_tasks`` counts on the plan row we can compute
    ``unscheduled = total_tasks - scheduled_tasks`` without additional task queries.

KPI strategy
-------------
KPIs are computed *dynamically* at ``get_by_id`` time from the stored assignment rows and
the plan metadata (total_tasks, scheduled_tasks).  No KPI columns are stored on
``block_plans``; the migration does not have them.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import UTC, date, datetime
from typing import Callable, Generator

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from database.models import (
    BlockPlan,
    BlockWindow,
    MaintenanceTask,
    PlanAssignment,
    PlannerOverride,
)

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import PageMeta, PaginationParams
from app.schemas.enums import (
    AssignmentStatus,
    DefectSeverity,
    Department,
    OverrideAction,
    PlanStatus,
    PlanningHorizonType,
    TaskStatus,
    Weekday,
)
from app.schemas.internal import OptimizerResult, OptimizerWindow, ScoredTask
from app.schemas.kpis import KpiResponse
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.schemas.windows import BlockWindowListResponse, BlockWindowResponse
from app.services.exceptions import ApiServiceError, DependencyNotReady, NotFoundError
from app.services.repositories import (
    OverrideRepository,
    PlanRepository,
    TaskRepository,
    WindowRepository,
)

logger = logging.getLogger(__name__)

_PYTHON_WEEKDAY_TO_ENUM: dict[int, Weekday] = {
    0: Weekday.MON,
    1: Weekday.TUE,
    2: Weekday.WED,
    3: Weekday.THU,
    4: Weekday.FRI,
    5: Weekday.SAT,
    6: Weekday.SUN,
}


def _map_db_to_task_status(raw: str) -> TaskStatus:
    """Map database status string to Person 1 TaskStatus enum.

    Person 2's ETL ingestion sets newly ingested tasks to "PENDING".
    In Person 1's domain lifecycle, active unallocated maintenance defects correspond to TaskStatus.OPEN.
    """
    normalized = raw.strip().upper()
    if normalized in {"PENDING", "OPEN"}:
        return TaskStatus.OPEN
    elif normalized == "SCHEDULED":
        return TaskStatus.SCHEDULED
    elif normalized == "UNSCHEDULED":
        return TaskStatus.UNSCHEDULED
    elif normalized == "COMPLETED":
        return TaskStatus.COMPLETED
    elif normalized == "CANCELLED":
        return TaskStatus.CANCELLED
    return TaskStatus(raw.lower())


def _map_status_filter_to_db(status: TaskStatus) -> list[str]:
    """Map Person 1 TaskStatus filter to matching database status values."""
    if status == TaskStatus.OPEN:
        return ["OPEN", "open", "PENDING", "pending"]
    return [status.value.upper(), status.value.lower()]


def _row_to_task_response(row: MaintenanceTask) -> MaintenanceTaskResponse:
    """Map a SQLAlchemy MaintenanceTask row to a Person 1 MaintenanceTaskResponse schema."""
    return MaintenanceTaskResponse(
        task_id=row.id,
        department=Department(row.department),
        corridor_id=row.corridor_id,
        defect_severity=DefectSeverity(row.defect_severity),
        days_overdue=row.days_overdue,
        estimated_hours=row.estimated_hours,
        asset_age_years=row.asset_age_years,
        status=_map_db_to_task_status(row.status),
        criticality_score=row.criticality_score,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _row_to_scored_task(row: MaintenanceTask) -> ScoredTask:
    """Map a SQLAlchemy MaintenanceTask row to an internal ScoredTask for ML scoring.

    Note on criticality_score:
    Per the ScoredTask contract, this field requires a float. An unscored task in the DB
    (where row.criticality_score is None) is initialized with 0.0 prior to ML scoring.
    """
    return ScoredTask(
        task_id=row.id,
        department=Department(row.department),
        corridor_id=row.corridor_id,
        defect_severity=DefectSeverity(row.defect_severity),
        days_overdue=row.days_overdue,
        estimated_hours=row.estimated_hours,
        asset_age_years=row.asset_age_years,
        criticality_score=row.criticality_score if row.criticality_score is not None else 0.0,
    )


def _row_to_window_response(row: BlockWindow) -> BlockWindowResponse:
    """Map a SQLAlchemy BlockWindow row to a Person 1 BlockWindowResponse schema."""
    weekday_enum = _PYTHON_WEEKDAY_TO_ENUM[row.window_date.weekday()]
    starts_at = datetime.combine(row.window_date, row.start_time)
    ends_at = datetime.combine(row.window_date, row.end_time)
    return BlockWindowResponse(
        window_id=row.id,
        corridor_id=row.corridor_id,
        day=weekday_enum,
        available_hours=row.available_hours,
        starts_at=starts_at,
        ends_at=ends_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _row_to_optimizer_window(row: BlockWindow) -> OptimizerWindow:
    """Map a SQLAlchemy BlockWindow row to an internal OptimizerWindow schema."""
    weekday_enum = _PYTHON_WEEKDAY_TO_ENUM[row.window_date.weekday()]
    starts_at = datetime.combine(row.window_date, row.start_time)
    ends_at = datetime.combine(row.window_date, row.end_time)
    return OptimizerWindow(
        window_id=row.id,
        corridor_id=row.corridor_id,
        day=weekday_enum,
        available_hours=row.available_hours,
        starts_at=starts_at,
        ends_at=ends_at,
    )


class SqlAlchemyTaskRepository(TaskRepository):
    """Production TaskRepository implementing database access via SQLAlchemy."""

    def __init__(
        self,
        *,
        session_factory: Callable[[], Session] | None = None,
        session: Session | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._session = session

    @contextmanager
    def _get_session(self) -> Generator[Session, None, None]:
        if self._session is not None:
            yield self._session
        else:
            try:
                if self._session_factory is not None:
                    factory = self._session_factory
                else:
                    from database.connection import SessionLocal
                    factory = SessionLocal
                session = factory()
            except Exception as exc:
                raise DependencyNotReady(
                    f"Database connection is not available: {exc}"
                ) from exc

            try:
                yield session
            except ApiServiceError:
                raise
            except Exception as exc:
                raise DependencyNotReady(
                    f"Database operation failed: {exc}"
                ) from exc
            finally:
                session.close()

    def get_by_id(self, task_id: int) -> MaintenanceTaskResponse:
        """Return a single task by its integer primary key or raise NotFoundError."""
        with self._get_session() as session:
            row = session.scalar(
                select(MaintenanceTask).where(MaintenanceTask.id == task_id)
            )
            if row is None:
                raise NotFoundError(f"Maintenance task {task_id} not found.")
            return _row_to_task_response(row)

    def list_tasks(
        self,
        *,
        pagination: PaginationParams,
        corridor_id: str | None = None,
        department: Department | None = None,
        status: TaskStatus | None = None,
    ) -> MaintenanceTaskListResponse:
        """Return a paginated, filtered list of maintenance tasks from the database."""
        with self._get_session() as session:
            stmt = select(MaintenanceTask)
            count_stmt = select(func.count()).select_from(MaintenanceTask)

            if corridor_id is not None:
                stmt = stmt.where(MaintenanceTask.corridor_id == corridor_id)
                count_stmt = count_stmt.where(MaintenanceTask.corridor_id == corridor_id)

            if department is not None:
                stmt = stmt.where(MaintenanceTask.department == department.value)
                count_stmt = count_stmt.where(MaintenanceTask.department == department.value)

            if status is not None:
                db_statuses = _map_status_filter_to_db(status)
                stmt = stmt.where(MaintenanceTask.status.in_(db_statuses))
                count_stmt = count_stmt.where(MaintenanceTask.status.in_(db_statuses))

            total = session.scalar(count_stmt) or 0

            stmt = stmt.order_by(MaintenanceTask.id).offset(pagination.offset).limit(pagination.limit)
            rows = session.scalars(stmt).all()

            items = [_row_to_task_response(row) for row in rows]
            return MaintenanceTaskListResponse(
                items=items,
                meta=PageMeta(
                    limit=pagination.limit,
                    offset=pagination.offset,
                    total=total,
                ),
            )

    def list_unscheduled(
        self,
        *,
        pagination: PaginationParams,
        plan_id: int | None = None,
        corridor_id: str | None = None,
        critical_only: bool = False,
    ) -> MaintenanceTaskListResponse:
        """Return tasks with status=unscheduled, optionally scoped to corridor or critical defects.

        Note on plan_id:
        Person 2's current schema does not include a block_plans table or plan_id column on tasks.
        Plan-scoped filtering is documented as pending Person 2's plan assignment persistence.
        """
        if plan_id is not None:
            logger.info(
                "plan_id=%s filter received for list_unscheduled, but plan association "
                "tables are not yet created by Person 2. Querying global unscheduled tasks.",
                plan_id,
            )

        with self._get_session() as session:
            stmt = select(MaintenanceTask).where(
                MaintenanceTask.status.in_(["UNSCHEDULED", "unscheduled"])
            )
            count_stmt = select(func.count()).select_from(MaintenanceTask).where(
                MaintenanceTask.status.in_(["UNSCHEDULED", "unscheduled"])
            )

            if corridor_id is not None:
                stmt = stmt.where(MaintenanceTask.corridor_id == corridor_id)
                count_stmt = count_stmt.where(MaintenanceTask.corridor_id == corridor_id)

            if critical_only:
                stmt = stmt.where(MaintenanceTask.defect_severity == "A")
                count_stmt = count_stmt.where(MaintenanceTask.defect_severity == "A")

            total = session.scalar(count_stmt) or 0

            stmt = stmt.order_by(MaintenanceTask.id).offset(pagination.offset).limit(pagination.limit)
            rows = session.scalars(stmt).all()

            items = [_row_to_task_response(row) for row in rows]
            return MaintenanceTaskListResponse(
                items=items,
                meta=PageMeta(
                    limit=pagination.limit,
                    offset=pagination.offset,
                    total=total,
                ),
            )

    def list_open_for_scoring(
        self,
        *,
        corridor_id: str | None = None,
        department: Department | None = None,
    ) -> list[ScoredTask]:
        """Return open/pending tasks shaped as ScoredTask for input to the ML scoring service."""
        with self._get_session() as session:
            stmt = select(MaintenanceTask).where(
                MaintenanceTask.status.in_(["PENDING", "pending", "OPEN", "open"])
            )

            if corridor_id is not None:
                stmt = stmt.where(MaintenanceTask.corridor_id == corridor_id)

            if department is not None:
                stmt = stmt.where(MaintenanceTask.department == department.value)

            stmt = stmt.order_by(MaintenanceTask.id)
            rows = session.scalars(stmt).all()

            return [_row_to_scored_task(row) for row in rows]


class SqlAlchemyWindowRepository(WindowRepository):
    """Production WindowRepository implementing database access via SQLAlchemy."""

    def __init__(
        self,
        *,
        session_factory: Callable[[], Session] | None = None,
        session: Session | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._session = session

    @contextmanager
    def _get_session(self) -> Generator[Session, None, None]:
        if self._session is not None:
            yield self._session
        else:
            try:
                if self._session_factory is not None:
                    factory = self._session_factory
                else:
                    from database.connection import SessionLocal
                    factory = SessionLocal
                session = factory()
            except Exception as exc:
                raise DependencyNotReady(
                    f"Database connection is not available: {exc}"
                ) from exc

            try:
                yield session
            except ApiServiceError:
                raise
            except Exception as exc:
                raise DependencyNotReady(
                    f"Database operation failed: {exc}"
                ) from exc
            finally:
                session.close()

    def list_windows(
        self,
        *,
        corridor_id: str | None = None,
        horizon_start: object,
        horizon_end: object,
    ) -> list[OptimizerWindow]:
        """Return available block windows within the specified planning horizon date range."""
        with self._get_session() as session:
            stmt = select(BlockWindow).where(
                BlockWindow.status.in_(["AVAILABLE", "available"]),
                BlockWindow.window_date >= horizon_start,
                BlockWindow.window_date <= horizon_end,
            )

            if corridor_id is not None:
                stmt = stmt.where(BlockWindow.corridor_id == corridor_id)

            stmt = stmt.order_by(BlockWindow.window_date, BlockWindow.start_time)
            rows = session.scalars(stmt).all()

            # Fallback: if no exact date match (e.g. recurring sample windows or future dates),
            # load available template windows
            if not rows:
                fallback_stmt = select(BlockWindow).where(
                    BlockWindow.status.in_(["AVAILABLE", "available"])
                )
                if corridor_id is not None:
                    # First try corridor match
                    corridor_stmt = fallback_stmt.where(BlockWindow.corridor_id == corridor_id).order_by(
                        BlockWindow.window_date, BlockWindow.start_time
                    )
                    rows = session.scalars(corridor_stmt).all()
                if not rows:
                    rows = session.scalars(fallback_stmt.order_by(BlockWindow.window_date, BlockWindow.start_time)).all()

            return [_row_to_optimizer_window(row) for row in rows]

    def list_all(self, *, corridor_id: str | None = None) -> BlockWindowListResponse:
        """Return all configured windows for a corridor (or all corridors)."""
        with self._get_session() as session:
            stmt = select(BlockWindow)

            if corridor_id is not None:
                stmt = stmt.where(BlockWindow.corridor_id == corridor_id)

            stmt = stmt.order_by(BlockWindow.id)
            rows = session.scalars(stmt).all()

            items = [_row_to_window_response(row) for row in rows]
            return BlockWindowListResponse(
                items=items,
                meta=PageMeta(
                    limit=len(items) if items else 50,
                    offset=0,
                    total=len(items),
                ),
            )


# ---------------------------------------------------------------------------
# DB status vocabulary translation — plan layer
# ---------------------------------------------------------------------------

# plan_assignments.status CHECK ('ASSIGNED', 'OVERRIDDEN', 'CANCELLED')
_DOMAIN_TO_DB_ASSIGNMENT_STATUS: dict[AssignmentStatus, str] = {
    AssignmentStatus.SCHEDULED:  "ASSIGNED",
    AssignmentStatus.OVERRIDDEN: "OVERRIDDEN",
    # UNSCHEDULED rows are not stored (window_id NOT NULL constraint)
}

_DB_TO_DOMAIN_ASSIGNMENT_STATUS: dict[str, AssignmentStatus] = {
    "ASSIGNED":   AssignmentStatus.SCHEDULED,
    "OVERRIDDEN": AssignmentStatus.OVERRIDDEN,
    "CANCELLED":  AssignmentStatus.UNSCHEDULED,
}

# block_plans.status CHECK ('PENDING', 'READY', 'FAILED')
_DB_TO_PLAN_STATUS: dict[str, PlanStatus] = {
    "PENDING": PlanStatus.PENDING,
    "READY":   PlanStatus.READY,
    "FAILED":  PlanStatus.FAILED,
}


# ---------------------------------------------------------------------------
# Plan-layer helpers
# ---------------------------------------------------------------------------

def _plan_horizon_type(raw: str) -> PlanningHorizonType:
    """Map DB horizon_type string (uppercase) to PlanningHorizonType enum."""
    return PlanningHorizonType(raw.lower())


def _compute_kpis(
    plan_row: BlockPlan,
    assignment_rows: list[PlanAssignment],
    task_rows: dict[int, MaintenanceTask],
    window_rows: dict[int, BlockWindow],
    total_tasks: int,
) -> KpiResponse:
    """Compute KPIs dynamically from stored assignment rows (team-approved prototype strategy).

    Definitions:
      total_tasks           = passed in (from __ttl side-channel on plan row)
      scheduled_tasks       = len(assignment_rows)
      unscheduled_tasks     = max(0, total - scheduled)
      critical_unscheduled  = tasks in task_rows NOT in assignments with defect_severity='A'
      scheduled_hours       = sum(task.estimated_hours) for all assigned tasks
      available_window_hours = sum(window.available_hours) for distinct used windows
      block_utilization     = scheduled_hours / available_window_hours * 100
      asset_availability    = scheduled_tasks / total_tasks * 100
    """
    scheduled_count = len(assignment_rows)
    unscheduled_count = max(0, total_tasks - scheduled_count)

    scheduled_hours = 0.0
    used_window_ids: set[int] = set()

    for pa in assignment_rows:
        task = task_rows.get(pa.task_id)
        if task is not None:
            scheduled_hours += task.estimated_hours
        if pa.window_id in window_rows:
            used_window_ids.add(pa.window_id)

    available_window_hours = sum(
        window_rows[wid].available_hours
        for wid in used_window_ids
        if wid in window_rows
    )

    assigned_task_ids = {pa.task_id for pa in assignment_rows}
    critical_unscheduled = sum(
        1 for tid, t in task_rows.items()
        if tid not in assigned_task_ids and t.defect_severity == "A"
    )

    availability = (
        round(scheduled_count / total_tasks * 100.0, 4) if total_tasks > 0 else 0.0
    )
    utilization = (
        round(scheduled_hours / available_window_hours * 100.0, 4)
        if available_window_hours > 0
        else 0.0
    )

    return KpiResponse(
        plan_id=plan_row.id,
        horizon_type=_plan_horizon_type(plan_row.horizon_type),
        horizon_start=plan_row.horizon_start,
        horizon_end=plan_row.horizon_end,
        corridor_id=plan_row.corridor_id,
        total_tasks=total_tasks,
        scheduled_tasks=scheduled_count,
        unscheduled_tasks=unscheduled_count,
        critical_unscheduled_tasks=critical_unscheduled,
        asset_availability_percent=min(availability, 100.0),
        scheduled_hours=scheduled_hours,
        available_window_hours=available_window_hours,
        block_utilization_percent=min(utilization, 100.0),
    )


def _hydrate_assignment(
    pa: PlanAssignment,
    task: MaintenanceTask,
    window: BlockWindow,
) -> PlanAssignmentResponse:
    """Build a PlanAssignmentResponse from joined DB rows."""
    weekday_enum = _PYTHON_WEEKDAY_TO_ENUM[window.window_date.weekday()]
    domain_status = _DB_TO_DOMAIN_ASSIGNMENT_STATUS.get(
        pa.status, AssignmentStatus.SCHEDULED
    )
    is_unscheduled = domain_status == AssignmentStatus.UNSCHEDULED
    return PlanAssignmentResponse(
        task_id=task.id,
        window_id=None if is_unscheduled else window.id,
        corridor_id=task.corridor_id,
        department=Department(task.department),
        day=None if is_unscheduled else weekday_enum,
        estimated_hours=task.estimated_hours,
        criticality_score=(
            task.criticality_score if task.criticality_score is not None else 0.0
        ),
        defect_severity=DefectSeverity(task.defect_severity),
        status=domain_status,
    )


class SqlAlchemyPlanRepository:
    """Person 1 PlanRepository adapter persisting block plans and assignments.

    UNSCHEDULED task contract
    -------------------------
    ``plan_assignments.window_id`` is NOT NULL (migration 003 / SQLAlchemy model).
    Only SCHEDULED and OVERRIDDEN assignments (with non-None window_id) are written.
    The optimizer total task count is encoded in ``block_plans.failure_reason`` as
    the string ``"__ttl:<N>"`` when the plan is READY so that ``get_by_id`` can
    reconstruct ``unscheduled_tasks = total_tasks - scheduled_tasks`` without an
    extra SQL query.  The sentinel is invisible to callers — it is stripped before
    returning responses.

    KPI strategy
    ------------
    Computed dynamically in ``save_result`` and ``get_by_id`` from assignment rows
    joined with their MaintenanceTask and BlockWindow rows.  No KPI columns are
    stored in the database schema.
    """

    _TTL_PREFIX = "__ttl:"

    def __init__(
        self,
        *,
        session_factory: Callable[[], Session] | None = None,
        session: Session | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._session = session

    @contextmanager
    def _get_session(self) -> Generator[Session, None, None]:
        if self._session is not None:
            yield self._session
        else:
            try:
                if self._session_factory is not None:
                    factory = self._session_factory
                else:
                    from database.connection import SessionLocal
                    factory = SessionLocal
                session = factory()
            except Exception as exc:
                raise DependencyNotReady(
                    f"Database connection is not available: {exc}"
                ) from exc

            try:
                yield session
            except ApiServiceError:
                raise
            except Exception as exc:
                session.rollback()
                raise DependencyNotReady(
                    f"Database operation failed: {exc}"
                ) from exc
            finally:
                session.close()

    # ------------------------------------------------------------------
    # Protocol implementation
    # ------------------------------------------------------------------

    def create_pending(
        self,
        *,
        horizon_type: str,
        horizon_start: object,
        horizon_end: object,
        corridor_id: str | None,
        department: Department | None,
    ) -> PlanJobResponse:
        """Insert a BlockPlan with status=PENDING and return the job handle.

        job_id strategy: str(plan.id) — the DB-assigned integer PK is the
        authoritative job identifier.  Celery may overwrite it with a UUID
        after enqueueing.
        """
        dept_str = department.value if department is not None else None
        db_horizon_type = horizon_type.upper()  # DB CHECK requires uppercase

        with self._get_session() as session:
            plan = BlockPlan(
                horizon_type=db_horizon_type,
                horizon_start=horizon_start,
                horizon_end=horizon_end,
                corridor_id=corridor_id,
                department=dept_str,
                status="PENDING",
            )
            session.add(plan)
            session.commit()
            session.refresh(plan)
            plan_id = plan.id

            return PlanJobResponse(
                accepted=True,
                job_id=str(plan_id),
                plan_id=plan_id,
                horizon_type=horizon_type,
                status=PlanStatus.PENDING,
            )

    def save_result(
        self,
        *,
        plan_id: int,
        result: OptimizerResult,
    ) -> BlockPlanResponse:
        """Persist scheduled assignments and flip plan status to READY.

        SCHEDULED/OVERRIDDEN assignments with a non-None window_id are written.
        UNSCHEDULED assignments are not written (window_id NOT NULL).
        total_tasks is stored as ``"__ttl:<N>"`` in failure_reason.
        """
        total_tasks = len(result.assignments)
        scheduled = [
            a for a in result.assignments
            if a.status in {AssignmentStatus.SCHEDULED, AssignmentStatus.OVERRIDDEN}
            and a.window_id is not None
        ]

        with self._get_session() as session:
            plan = session.scalar(
                select(BlockPlan).where(BlockPlan.id == plan_id)
            )
            if plan is None:
                raise NotFoundError(f"Plan {plan_id} not found.")

            for a in scheduled:
                db_status = _DOMAIN_TO_DB_ASSIGNMENT_STATUS.get(a.status, "ASSIGNED")
                session.add(PlanAssignment(
                    plan_id=plan_id,
                    task_id=a.task_id,
                    window_id=a.window_id,
                    department=a.department.value,
                    joint_block_flag=False,
                    status=db_status,
                ))

            plan.status = "READY"
            plan.generated_at = datetime.now(UTC)
            plan.failure_reason = f"{self._TTL_PREFIX}{total_tasks}"
            session.commit()
            session.refresh(plan)

            assignment_rows = list(session.scalars(
                select(PlanAssignment).where(PlanAssignment.plan_id == plan_id)
            ).all())

            task_ids  = {pa.task_id  for pa in assignment_rows}
            window_ids = {pa.window_id for pa in assignment_rows}

            task_map: dict[int, MaintenanceTask] = (
                {t.id: t for t in session.scalars(
                    select(MaintenanceTask).where(MaintenanceTask.id.in_(task_ids))
                ).all()}
                if task_ids else {}
            )
            window_map: dict[int, BlockWindow] = (
                {w.id: w for w in session.scalars(
                    select(BlockWindow).where(BlockWindow.id.in_(window_ids))
                ).all()}
                if window_ids else {}
            )

            domain_assignments = [
                _hydrate_assignment(pa, task_map[pa.task_id], window_map[pa.window_id])
                for pa in assignment_rows
                if pa.task_id in task_map and pa.window_id in window_map
            ]

            kpis = _compute_kpis(
                plan_row=plan,
                assignment_rows=assignment_rows,
                task_rows=task_map,
                window_rows=window_map,
                total_tasks=total_tasks,
            )

            return BlockPlanResponse(
                plan_id=plan.id,
                horizon_type=_plan_horizon_type(plan.horizon_type),
                horizon_start=plan.horizon_start,
                horizon_end=plan.horizon_end,
                status=PlanStatus.READY,
                assignments=domain_assignments,
                kpis=kpis,
                generated_at=plan.generated_at,
                created_at=plan.created_at,
                updated_at=plan.updated_at,
            )

    def mark_failed(self, *, plan_id: int, reason: str) -> None:
        """Flip plan status to FAILED and store the failure reason (≤ 1 000 chars)."""
        with self._get_session() as session:
            plan = session.scalar(
                select(BlockPlan).where(BlockPlan.id == plan_id)
            )
            if plan is None:
                raise NotFoundError(f"Plan {plan_id} not found.")

            plan.status = "FAILED"
            plan.failure_reason = reason[:1000]
            session.commit()

    def get_by_id(self, plan_id: int) -> BlockPlanResponse:
        """Load a BlockPlan, join assignment/task/window rows, compute KPIs.

        Raises:
            NotFoundError: if plan_id is absent from block_plans.
        """
        with self._get_session() as session:
            plan = session.scalar(
                select(BlockPlan).where(BlockPlan.id == plan_id)
            )
            if plan is None:
                raise NotFoundError(f"Plan {plan_id} not found.")

            assignment_rows = list(session.scalars(
                select(PlanAssignment).where(PlanAssignment.plan_id == plan_id)
            ).all())

            task_ids  = {pa.task_id  for pa in assignment_rows}
            window_ids = {pa.window_id for pa in assignment_rows}

            task_map: dict[int, MaintenanceTask] = (
                {t.id: t for t in session.scalars(
                    select(MaintenanceTask).where(MaintenanceTask.id.in_(task_ids))
                ).all()}
                if task_ids else {}
            )
            window_map: dict[int, BlockWindow] = (
                {w.id: w for w in session.scalars(
                    select(BlockWindow).where(BlockWindow.id.in_(window_ids))
                ).all()}
                if window_ids else {}
            )

            domain_assignments = [
                _hydrate_assignment(pa, task_map[pa.task_id], window_map[pa.window_id])
                for pa in assignment_rows
                if pa.task_id in task_map and pa.window_id in window_map
            ]

            # Recover total_tasks from the side-channel
            total_tasks = len(assignment_rows)   # fallback: assume all were scheduled
            raw_reason = plan.failure_reason or ""
            if raw_reason.startswith(self._TTL_PREFIX):
                try:
                    total_tasks = int(raw_reason[len(self._TTL_PREFIX):])
                except ValueError:
                    pass

            plan_status = _DB_TO_PLAN_STATUS.get(plan.status, PlanStatus.PENDING)

            kpis: KpiResponse | None = None
            if plan_status == PlanStatus.READY:
                kpis = _compute_kpis(
                    plan_row=plan,
                    assignment_rows=assignment_rows,
                    task_rows=task_map,
                    window_rows=window_map,
                    total_tasks=total_tasks,
                )

            return BlockPlanResponse(
                plan_id=plan.id,
                horizon_type=_plan_horizon_type(plan.horizon_type),
                horizon_start=plan.horizon_start,
                horizon_end=plan.horizon_end,
                status=plan_status,
                assignments=domain_assignments,
                kpis=kpis,
                generated_at=plan.generated_at,
                created_at=plan.created_at,
                updated_at=plan.updated_at,
            )


# ---------------------------------------------------------------------------
# Override-layer helpers & DB mappings
# ---------------------------------------------------------------------------

_ACTION_TO_DB: dict[OverrideAction, str] = {
    OverrideAction.UNSCHEDULE:     "UNSCHEDULE",
    OverrideAction.REASSIGN:       "REASSIGN",
    OverrideAction.FORCE_SCHEDULE: "FORCE_SCHEDULE",
}

_DB_TO_ACTION: dict[str, OverrideAction] = {
    "UNSCHEDULE":     OverrideAction.UNSCHEDULE,
    "REASSIGN":       OverrideAction.REASSIGN,
    "FORCE_SCHEDULE": OverrideAction.FORCE_SCHEDULE,
}


class SqlAlchemyOverrideRepository(OverrideRepository):
    """Person 1 OverrideRepository adapter persisting planner overrides.

    Satisfies the ``OverrideRepository`` Protocol defined in ``app/services/repositories.py``.
    Persists audit records into Person 2's ``planner_overrides`` table and updates
    the target ``plan_assignments`` row status and window assignment accordingly.
    """

    def __init__(
        self,
        *,
        session_factory: Callable[[], Session] | None = None,
        session: Session | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._session = session

    @contextmanager
    def _get_session(self) -> Generator[Session, None, None]:
        if self._session is not None:
            yield self._session
        else:
            try:
                if self._session_factory is not None:
                    factory = self._session_factory
                else:
                    from database.connection import SessionLocal
                    factory = SessionLocal
                session = factory()
            except Exception as exc:
                raise DependencyNotReady(
                    f"Database connection is not available: {exc}"
                ) from exc

            try:
                yield session
            except ApiServiceError:
                raise
            except Exception as exc:
                session.rollback()
                raise DependencyNotReady(
                    f"Database operation failed: {exc}"
                ) from exc
            finally:
                session.close()

    def record_override(
        self,
        *,
        plan_id: int,
        payload: PlannerOverrideCreate,
        overridden_by: str | None,
    ) -> PlannerOverrideResponse:
        """Persist the override audit record and update assignment state."""
        with self._get_session() as session:
            # Step 1: Ensure plan exists
            plan = session.scalar(
                select(BlockPlan).where(BlockPlan.id == plan_id)
            )
            if plan is None:
                raise NotFoundError(f"Block plan {plan_id} not found.")

            # Step 2: Locate the plan assignment
            assignment = session.scalar(
                select(PlanAssignment).where(
                    PlanAssignment.plan_id == plan_id,
                    PlanAssignment.task_id == payload.task_id,
                )
            )
            if assignment is None:
                raise NotFoundError(
                    f"Assignment for plan {plan_id} and task {payload.task_id} not found."
                )

            # Step 3: Update assignment state
            if payload.action in {OverrideAction.REASSIGN, OverrideAction.FORCE_SCHEDULE}:
                assignment.window_id = payload.target_window_id
                assignment.status = "OVERRIDDEN"
            elif payload.action is OverrideAction.UNSCHEDULE:
                assignment.status = "CANCELLED"

            # Step 4: Persist planner override audit record
            action_str = _ACTION_TO_DB.get(payload.action, payload.action.value.upper())
            override = PlannerOverride(
                plan_id=plan_id,
                assignment_id=assignment.id,
                task_id=payload.task_id,
                action=action_str,
                target_window_id=payload.target_window_id,
                reason=payload.reason[:1000],
                overridden_by=overridden_by or "system",
            )
            session.add(override)
            session.commit()
            session.refresh(override)

            action_enum = _DB_TO_ACTION.get(override.action, payload.action)

            return PlannerOverrideResponse(
                override_id=override.id,
                plan_id=override.plan_id,
                task_id=override.task_id,
                action=action_enum,
                target_window_id=override.target_window_id,
                reason=override.reason,
                overridden_by=override.overridden_by,
                overridden_at=override.created_at,
            )

