"""Concrete task service implementation.

Orchestrates task retrieval through the ``TaskRepository`` abstraction.
No SQL. No business logic in the router. No fabricated data.

Replaces ``UnavailableTaskService`` in ``app/services/__init__.py`` once
Person 2 supplies a ``TaskRepository`` implementation.
"""

from __future__ import annotations

from app.schemas.common import PaginationParams
from app.schemas.enums import Department, TaskStatus
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.services.exceptions import NotFoundError
from app.services.repositories import TaskRepository


class ConcreteTaskService:
    """Production task service: delegates all data access to ``TaskRepository``.

    Dependency injection pattern::

        repo = MyPostgresTaskRepository(db_session)
        service = ConcreteTaskService(repo)

    This class satisfies the ``TaskService`` Protocol defined in
    ``app/services/tasks.py`` because it implements the same method signatures.
    """

    def __init__(self, repository: TaskRepository) -> None:
        self._repo = repository

    # ------------------------------------------------------------------
    # Public API (matches TaskService Protocol)
    # ------------------------------------------------------------------

    def list_tasks(
        self,
        *,
        pagination: PaginationParams,
        corridor_id: str | None,
        department: Department | None,
        status: TaskStatus | None,
    ) -> MaintenanceTaskListResponse:
        """Return a paginated, optionally filtered list of maintenance tasks."""
        return self._repo.list_tasks(
            pagination=pagination,
            corridor_id=corridor_id,
            department=department,
            status=status,
        )

    def get_task(self, task_id: int) -> MaintenanceTaskResponse:
        """Return a single task by primary key.

        Raises:
            NotFoundError: If ``task_id`` does not exist in the repository.
        """
        task = self._repo.get_by_id(task_id)
        if task is None:
            raise NotFoundError(f"Maintenance task {task_id} not found.")
        return task

    def list_unscheduled(
        self,
        *,
        pagination: PaginationParams,
        plan_id: int | None,
        corridor_id: str | None,
        critical_only: bool,
    ) -> MaintenanceTaskListResponse:
        """Return tasks that were left unscheduled, optionally scoped to a plan."""
        return self._repo.list_unscheduled(
            pagination=pagination,
            plan_id=plan_id,
            corridor_id=corridor_id,
            critical_only=critical_only,
        )
