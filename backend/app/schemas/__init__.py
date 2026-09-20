"""Pydantic request/response schemas for the public API."""

from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.common import (
    ErrorResponse,
    FieldError,
    MessageResponse,
    PageMeta,
    PaginationParams,
)
from app.schemas.kpis import CriticalTasksKpiResponse, KpiQuery, KpiResponse
from app.schemas.ml import (
    MLBatchScoringRequest,
    MLBatchScoringResponse,
    MLTaskFeature,
    MLTaskScoreItem,
)
from app.schemas.optimizer import (
    OptimizerConstraints,
    OptimizerInput,
    OptimizerMetadata,
    OptimizerResult,
    OptimizerWindow,
)
from app.schemas.overrides import (
    PlannerOverrideCreate,
    PlannerOverrideListResponse,
    PlannerOverrideResponse,
)
from app.schemas.plans import (
    BlockPlanListResponse,
    BlockPlanResponse,
    BlockPlanSummaryResponse,
    PlanGenerateRequest,
    PlanJobResponse,
)
from app.schemas.system import HealthResponse, RootResponse
from app.schemas.tasks import (
    MaintenanceTaskCreate,
    MaintenanceTaskListResponse,
    MaintenanceTaskResponse,
    MaintenanceTaskUpdate,
    UnscheduledCriticalTaskResponse,
)
from app.schemas.windows import (
    BlockWindowCreate,
    BlockWindowListResponse,
    BlockWindowResponse,
    BlockWindowUpdate,
)

__all__ = [
    "BlockPlanListResponse",
    "BlockPlanResponse",
    "BlockPlanSummaryResponse",
    "BlockWindowCreate",
    "BlockWindowListResponse",
    "BlockWindowResponse",
    "BlockWindowUpdate",
    "CriticalTasksKpiResponse",
    "ErrorResponse",
    "FieldError",
    "HealthResponse",
    "KpiQuery",
    "KpiResponse",
    "MLBatchScoringRequest",
    "MLBatchScoringResponse",
    "MLTaskFeature",
    "MLTaskScoreItem",
    "MaintenanceTaskCreate",
    "MaintenanceTaskListResponse",
    "MaintenanceTaskResponse",
    "MaintenanceTaskUpdate",
    "MessageResponse",
    "OptimizerConstraints",
    "OptimizerInput",
    "OptimizerMetadata",
    "OptimizerResult",
    "OptimizerWindow",
    "PageMeta",
    "PaginationParams",
    "PlanAssignmentResponse",
    "PlanGenerateRequest",
    "PlanJobResponse",
    "PlannerOverrideCreate",
    "PlannerOverrideListResponse",
    "PlannerOverrideResponse",
    "RootResponse",
    "UnscheduledCriticalTaskResponse",
]
