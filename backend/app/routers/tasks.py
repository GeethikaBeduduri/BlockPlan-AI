"""Maintenance task HTTP routes. Business rules live in ``TaskService``."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.routers.responses import NOT_FOUND_RESPONSES, UNAVAILABLE_RESPONSES
from app.schemas.common import ErrorResponse, PaginationParams
from app.schemas.enums import Department, TaskStatus
from app.schemas.ml import MLBatchScoringRequest, MLBatchScoringResponse
from app.schemas.tasks import MaintenanceTaskListResponse, MaintenanceTaskResponse
from app.services import get_ml_service, get_task_service
from app.services.ml_service import MlScoringService
from app.services.tasks import TaskService

router = APIRouter(tags=["tasks"])


@router.get(
    "/tasks",
    response_model=MaintenanceTaskListResponse,
    responses=UNAVAILABLE_RESPONSES,
)
def list_tasks(
    service: Annotated[TaskService, Depends(get_task_service)],
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    corridor_id: Annotated[str | None, Query(min_length=2, max_length=32)] = None,
    department: Department | None = None,
    status: TaskStatus | None = None,
) -> MaintenanceTaskListResponse:
    return service.list_tasks(
        pagination=PaginationParams(limit=limit, offset=offset),
        corridor_id=corridor_id,
        department=department,
        status=status,
    )


@router.get(
    "/tasks/unscheduled",
    response_model=MaintenanceTaskListResponse,
    responses=UNAVAILABLE_RESPONSES,
)
def list_unscheduled_tasks(
    service: Annotated[TaskService, Depends(get_task_service)],
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    plan_id: Annotated[int | None, Query(gt=0)] = None,
    corridor_id: Annotated[str | None, Query(min_length=2, max_length=32)] = None,
    critical_only: bool = False,
) -> MaintenanceTaskListResponse:
    return service.list_unscheduled(
        pagination=PaginationParams(limit=limit, offset=offset),
        plan_id=plan_id,
        corridor_id=corridor_id,
        critical_only=critical_only,
    )


@router.get(
    "/tasks/{task_id}",
    response_model=MaintenanceTaskResponse,
    responses=NOT_FOUND_RESPONSES,
)
def get_task(
    task_id: int,
    service: Annotated[TaskService, Depends(get_task_service)],
) -> MaintenanceTaskResponse:
    if task_id < 1:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="task_id must be greater than 0")
    return service.get_task(task_id)


@router.post(
    "/tasks/score",
    response_model=MLBatchScoringResponse,
    responses=UNAVAILABLE_RESPONSES,
    summary="Score a batch of maintenance tasks using the trained ML model",
    description=(
        "Accepts task features (defect severity, days overdue, estimated hours, "
        "asset age, department) and calculates criticality scores using the loaded XGBoost model."
    ),
)
def score_tasks(
    request: MLBatchScoringRequest,
    ml_service: Annotated[MlScoringService, Depends(get_ml_service)],
) -> MLBatchScoringResponse:
    return ml_service.score_batch(request)


@router.post(
    "/tasks/reload-model",
    responses=UNAVAILABLE_RESPONSES,
    summary="Reload the ML model pickle file from disk into memory",
)
def reload_model(
    ml_service: Annotated[MlScoringService, Depends(get_ml_service)],
) -> dict[str, str]:
    if hasattr(ml_service, "reload") and callable(ml_service.reload):
        ml_service.reload()
    return {"status": "model reloaded successfully"}
