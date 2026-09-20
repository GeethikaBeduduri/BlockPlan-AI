from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.schemas.common import PaginationParams
from app.schemas.enums import Department, TaskStatus
from app.schemas.internal import OptimizerWindow, ScoredTask
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.schemas.windows import BlockWindowListResponse, BlockWindowResponse

from database.models import BlockWindow, MaintenanceTask


class SqlAlchemyTaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, task_id: int) -> MaintenanceTaskResponse:
        task = (
            self.db.query(MaintenanceTask)
            .filter(MaintenanceTask.id == task_id)
            .first()
        )

        if task is None:
            raise ValueError(f"Task {task_id} not found")

        return MaintenanceTaskResponse(
            task_id=task.id,
            department=task.department,
            corridor_id=task.corridor_id,
            defect_severity=task.defect_severity,
            days_overdue=task.days_overdue,
            estimated_hours=task.estimated_hours,
            asset_age_years=task.asset_age_years,
            status=task.status,
            criticality_score=task.criticality_score,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )

    def list_tasks(
        self,
        *,
        pagination: PaginationParams,
        corridor_id: str | None,
        department: Department | None,
        status: TaskStatus | None,
    ) -> MaintenanceTaskListResponse:
        query = self.db.query(MaintenanceTask)

        if corridor_id is not None:
            query = query.filter(MaintenanceTask.corridor_id == corridor_id)

        if department is not None:
            query = query.filter(MaintenanceTask.department == department)

        if status is not None:
            query = query.filter(MaintenanceTask.status == status)

        total = query.count()

        items = (
            query.order_by(MaintenanceTask.id)
            .offset((pagination.page - 1) * pagination.page_size)
            .limit(pagination.page_size)
            .all()
        )

        return MaintenanceTaskListResponse(
            items=[
                MaintenanceTaskResponse(
                    task_id=task.id,
                    department=task.department,
                    corridor_id=task.corridor_id,
                    defect_severity=task.defect_severity,
                    days_overdue=task.days_overdue,
                    estimated_hours=task.estimated_hours,
                    asset_age_years=task.asset_age_years,
                    status=task.status,
                    criticality_score=task.criticality_score,
                    created_at=task.created_at,
                    updated_at=task.updated_at,
                )
                for task in items
            ],
            meta={
                "page": pagination.page,
                "page_size": pagination.page_size,
                "total": total,
            },
        )

    def list_unscheduled(
        self,
        *,
        pagination: PaginationParams,
        plan_id: int | None,
        corridor_id: str | None,
        critical_only: bool,
    ) -> MaintenanceTaskListResponse:
        query = self.db.query(MaintenanceTask).filter(
            MaintenanceTask.status == "UNSCHEDULED"
        )

        if corridor_id is not None:
            query = query.filter(MaintenanceTask.corridor_id == corridor_id)

        if critical_only:
            query = query.filter(MaintenanceTask.defect_severity == "A")

        total = query.count()

        items = (
            query.order_by(MaintenanceTask.id)
            .offset((pagination.page - 1) * pagination.page_size)
            .limit(pagination.page_size)
            .all()
        )

        return MaintenanceTaskListResponse(
            items=[
                MaintenanceTaskResponse(
                    task_id=task.id,
                    department=task.department,
                    corridor_id=task.corridor_id,
                    defect_severity=task.defect_severity,
                    days_overdue=task.days_overdue,
                    estimated_hours=task.estimated_hours,
                    asset_age_years=task.asset_age_years,
                    status=task.status,
                    criticality_score=task.criticality_score,
                    created_at=task.created_at,
                    updated_at=task.updated_at,
                )
                for task in items
            ],
            meta={
                "page": pagination.page,
                "page_size": pagination.page_size,
                "total": total,
            },
        )

    def list_open_for_scoring(
        self,
        *,
        corridor_id: str | None,
        department: Department | None,
    ) -> list[ScoredTask]:
        query = self.db.query(MaintenanceTask).filter(
            MaintenanceTask.status == "OPEN"
        )

        if corridor_id is not None:
            query = query.filter(MaintenanceTask.corridor_id == corridor_id)

        if department is not None:
            query = query.filter(MaintenanceTask.department == department)

        return [
            ScoredTask(
                task_id=task.id,
                department=task.department,
                corridor_id=task.corridor_id,
                defect_severity=task.defect_severity,
                days_overdue=task.days_overdue,
                estimated_hours=task.estimated_hours,
                asset_age_years=task.asset_age_years,
                criticality_score=0,
            )
            for task in query.order_by(MaintenanceTask.id).all()
        ]


class SqlAlchemyWindowRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_windows(
        self,
        *,
        corridor_id: str | None,
        horizon_start: date,
        horizon_end: date,
    ) -> list[OptimizerWindow]:
        query = self.db.query(BlockWindow).filter(
            BlockWindow.window_date >= horizon_start,
            BlockWindow.window_date <= horizon_end,
        )

        if corridor_id is not None:
            query = query.filter(BlockWindow.corridor_id == corridor_id)

        return [
            OptimizerWindow(
                window_id=window.id,
                corridor_id=window.corridor_id,
                window_date=window.window_date,
                start_time=window.start_time,
                end_time=window.end_time,
                available_hours=window.available_hours,
            )
            for window in query.order_by(
                BlockWindow.window_date,
                BlockWindow.start_time,
            ).all()
        ]

    def list_all(
        self,
        *,
        corridor_id: str | None,
    ) -> BlockWindowListResponse:
        query = self.db.query(BlockWindow)

        if corridor_id is not None:
            query = query.filter(BlockWindow.corridor_id == corridor_id)

        items = query.order_by(
            BlockWindow.window_date,
            BlockWindow.start_time,
        ).all()

        return BlockWindowListResponse(
            items=[
                BlockWindowResponse(
                    window_id=window.id,
                    corridor_id=window.corridor_id,
                    day=window.window_date.strftime("%a").upper()[:3],
                    available_hours=window.available_hours,
                    created_at=window.created_at,
                    updated_at=window.updated_at,
                )
                for window in items
            ],
            meta={
                "page": 1,
                "page_size": len(items),
                "total": len(items),
            },
        )