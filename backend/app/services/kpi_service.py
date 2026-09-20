"""Concrete KPI service implementation.

Computes and returns availability, utilization, and critical-task metrics
by evaluating plan assignments from the ``PlanRepository`` and unscheduled
task lists from the ``TaskRepository``.

SIH Evaluation Metrics:
  1. Asset Availability %: (scheduled_tasks / total_tasks) * 100.
  2. Block Utilization %: (scheduled_hours / available_window_hours) * 100.
  3. Unscheduled Critical Tasks: Severity-A tasks left unscheduled.
  4. Plan Generation Time: Time taken in seconds for ML + OR-Tools solver execution.

NO KPI formula logic lives in the router.
NO raw SQL lives here.
"""

from __future__ import annotations

from app.schemas.common import PageMeta, PaginationParams
from app.schemas.enums import AssignmentStatus, DefectSeverity, TaskStatus
from app.schemas.kpis import CriticalTasksKpiResponse, KpiQuery, KpiResponse
from app.schemas.tasks import UnscheduledCriticalTaskResponse
from app.services.exceptions import NotFoundError
from app.services.repositories import PlanRepository, TaskRepository


class ConcreteKpiService:
    """Production KPI service calculating SIH block planning metrics.

    Dependency injection pattern::

        service = ConcreteKpiService(
            plan_repo=MyPostgresPlanRepo(session),
            task_repo=MyPostgresTaskRepo(session),
        )

    This class satisfies the ``KpiService`` Protocol defined in ``app/services/kpis.py``.
    """

    def __init__(
        self,
        *,
        plan_repo: PlanRepository,
        task_repo: TaskRepository,
    ) -> None:
        self._plan_repo = plan_repo
        self._task_repo = task_repo

    def availability(self, query: KpiQuery) -> KpiResponse:
        """Return asset availability % and task counts for the query filter.

        Formula: (scheduled_tasks / total_tasks) * 100.
        If total_tasks == 0, returns 100.0% (all requested tasks fulfilled).

        Raises:
            NotFoundError: If a specific plan_id is requested but does not exist.
        """
        return self._compute_kpi(query)

    def utilization(self, query: KpiQuery) -> KpiResponse:
        """Return window utilization % and hours breakdown for the query filter.

        Formula: (scheduled_hours / available_window_hours) * 100.
        If available_window_hours == 0, returns 0.0%.

        Raises:
            NotFoundError: If a specific plan_id is requested but does not exist.
        """
        return self._compute_kpi(query)

    def critical_tasks(
        self,
        query: KpiQuery,
        pagination: PaginationParams,
    ) -> CriticalTasksKpiResponse:
        """Return unscheduled severity-A tasks for the queried plan or horizon.

        Raises:
            NotFoundError: If a specific plan_id is requested but does not exist.
        """
        if query.plan_id is not None:
            # Validate plan exists
            plan = self._plan_repo.get_by_id(query.plan_id)
            if plan is None:
                raise NotFoundError(f"Block plan {query.plan_id} not found.")

        raw = self._task_repo.list_unscheduled(
            pagination=pagination,
            plan_id=query.plan_id,
            corridor_id=query.corridor_id,
            critical_only=True,
        )

        critical_items: list[UnscheduledCriticalTaskResponse] = []
        for task in raw.items:
            if task.defect_severity is not DefectSeverity.A:
                continue
            if query.department is not None and task.department != query.department:
                continue
            critical_items.append(
                UnscheduledCriticalTaskResponse(
                    plan_id=query.plan_id,
                    task_id=task.task_id,
                    department=task.department,
                    corridor_id=task.corridor_id,
                    defect_severity=task.defect_severity,
                    days_overdue=task.days_overdue,
                    estimated_hours=task.estimated_hours,
                    criticality_score=task.criticality_score or 0.0,
                    status=task.status,
                )
            )

        return CriticalTasksKpiResponse(
            items=critical_items,
            meta=PageMeta(
                limit=pagination.limit,
                offset=pagination.offset,
                total=len(critical_items),
            ),
        )

    # ------------------------------------------------------------------
    # Internal metric computation engine
    # ------------------------------------------------------------------

    def _compute_kpi(self, query: KpiQuery) -> KpiResponse:
        """Fetch plan data and calculate availability & utilization metrics."""
        if query.plan_id is None:
            task_list = self._task_repo.list_tasks(
                pagination=PaginationParams(limit=500, offset=0),
                corridor_id=query.corridor_id,
                department=query.department,
            )
            total_tasks = task_list.meta.total
            scheduled_tasks = sum(1 for t in task_list.items if t.status == TaskStatus.SCHEDULED)
            unscheduled_tasks = sum(1 for t in task_list.items if t.status == TaskStatus.UNSCHEDULED)
            critical_tasks_list = self._task_repo.list_unscheduled(
                pagination=PaginationParams(limit=500, offset=0),
                corridor_id=query.corridor_id,
                critical_only=True,
            )
            critical_unscheduled = critical_tasks_list.meta.total
            scheduled_hours = sum(t.estimated_hours for t in task_list.items if t.status == TaskStatus.SCHEDULED)
            availability_pct = round((scheduled_tasks / total_tasks) * 100.0, 2) if total_tasks > 0 else 100.0

            return KpiResponse(
                plan_id=None,
                horizon_type=query.horizon_type,
                horizon_start=query.horizon_start,
                corridor_id=query.corridor_id,
                department=query.department,
                total_tasks=total_tasks,
                scheduled_tasks=scheduled_tasks,
                unscheduled_tasks=unscheduled_tasks,
                critical_unscheduled_tasks=critical_unscheduled,
                asset_availability_percent=availability_pct,
                scheduled_hours=round(scheduled_hours, 2),
                available_window_hours=0.0,
                block_utilization_percent=0.0,
                plan_generation_seconds=None,
            )

        plan = self._plan_repo.get_by_id(query.plan_id)
        if plan is None:
            raise NotFoundError(f"Block plan {query.plan_id} not found.")

        assignments = plan.assignments

        # Apply filtering if department or corridor_id is set
        if query.corridor_id is not None:
            assignments = [a for a in assignments if a.corridor_id == query.corridor_id]
        if query.department is not None:
            assignments = [a for a in assignments if a.department == query.department]

        if len(assignments) == 0:
            total_tasks = 0
            scheduled_tasks = 0
            unscheduled_tasks = 0
            critical_unscheduled_tasks = 0
            asset_availability_pct = 100.0
            scheduled_hours = 0.0
        else:
            total_tasks = len(assignments)
            scheduled_tasks = sum(
                1 for a in assignments if a.status == AssignmentStatus.SCHEDULED
            )
            unscheduled_tasks = total_tasks - scheduled_tasks

            critical_unscheduled_tasks = sum(
                1
                for a in assignments
                if a.status == AssignmentStatus.UNSCHEDULED
                and a.defect_severity == DefectSeverity.A
            )

            if (
                query.corridor_id is None
                and query.department is None
                and plan.kpis is not None
            ):
                if plan.kpis.total_tasks is not None and plan.kpis.total_tasks >= total_tasks:
                    total_tasks = plan.kpis.total_tasks
                    unscheduled_tasks = total_tasks - scheduled_tasks
                if (
                    plan.kpis.critical_unscheduled_tasks is not None
                    and plan.kpis.critical_unscheduled_tasks >= critical_unscheduled_tasks
                ):
                    critical_unscheduled_tasks = plan.kpis.critical_unscheduled_tasks

            # Asset Availability % calculation (handling zero division)
            if total_tasks > 0:
                asset_availability_pct = round((scheduled_tasks / total_tasks) * 100.0, 2)
            else:
                asset_availability_pct = 100.0

            scheduled_hours = sum(
                a.estimated_hours for a in assignments if a.status == AssignmentStatus.SCHEDULED
            )

        available_window_hours = (
            plan.kpis.available_window_hours if plan.kpis else 0.0
        )

        # Block Utilization % calculation (handling zero division)
        if available_window_hours > 0:
            block_utilization_pct = min(
                100.0, round((scheduled_hours / available_window_hours) * 100.0, 2)
            )
        else:
            block_utilization_pct = 0.0

        plan_corridor = plan.kpis.corridor_id if plan.kpis else None

        return KpiResponse(
            plan_id=plan.plan_id,
            horizon_type=plan.horizon_type,
            horizon_start=plan.horizon_start,
            horizon_end=plan.horizon_end,
            corridor_id=query.corridor_id or plan_corridor,
            department=query.department,
            total_tasks=total_tasks,
            scheduled_tasks=scheduled_tasks,
            unscheduled_tasks=unscheduled_tasks,
            critical_unscheduled_tasks=critical_unscheduled_tasks,
            asset_availability_percent=asset_availability_pct,
            scheduled_hours=round(scheduled_hours, 2),
            available_window_hours=round(available_window_hours, 2),
            block_utilization_percent=block_utilization_pct,
            plan_generation_seconds=None,
        )

