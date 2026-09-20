"""Maintenance task service interface.

Person 2 will back this with ``app/database.py`` and models. Until then the
default implementation refuses to invent rows.
"""

from __future__ import annotations

from typing import Protocol

from app.schemas.common import PaginationParams
from app.schemas.enums import Department, TaskStatus
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.services.exceptions import DependencyNotReady

_TASK_STORE_MESSAGE = (
    "Task APIs are waiting on Person 2 persistence "
    "(app/database.py and app/models). No task rows are fabricated."
)


class TaskService(Protocol):
    def list_tasks(
        self,
        *,
        pagination: PaginationParams,
        corridor_id: str | None,
        department: Department | None,
        status: TaskStatus | None,
    ) -> MaintenanceTaskListResponse: ...

    def get_task(self, task_id: int) -> MaintenanceTaskResponse: ...

    def list_unscheduled(
        self,
        *,
        pagination: PaginationParams,
        plan_id: int | None,
        corridor_id: str | None,
        critical_only: bool,
    ) -> MaintenanceTaskListResponse: ...


class UnavailableTaskService:
    """Explicit stand-in until Person 2 provides a repository."""

    def list_tasks(
        self,
        *,
        pagination: PaginationParams,
        corridor_id: str | None,
        department: Department | None,
        status: TaskStatus | None,
    ) -> MaintenanceTaskListResponse:
        raise DependencyNotReady(_TASK_STORE_MESSAGE)

    def get_task(self, task_id: int) -> MaintenanceTaskResponse:
        raise DependencyNotReady(_TASK_STORE_MESSAGE)

    def list_unscheduled(
        self,
        *,
        pagination: PaginationParams,
        plan_id: int | None,
        corridor_id: str | None,
        critical_only: bool,
    ) -> MaintenanceTaskListResponse:
        raise DependencyNotReady(_TASK_STORE_MESSAGE)
