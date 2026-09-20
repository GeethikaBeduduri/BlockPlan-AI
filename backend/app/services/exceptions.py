"""Service-layer errors mapped to HTTP by the FastAPI app."""

from __future__ import annotations

from app.schemas.common import FieldError
from app.schemas.enums import ErrorCode


class ApiServiceError(Exception):
    """Base error for Person 1 services. Routers should not catch these."""

    status_code: int = 500
    error_code: ErrorCode = ErrorCode.PLAN_GENERATION_FAILED

    def __init__(
        self,
        message: str,
        *,
        details: list[FieldError] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class DependencyNotReady(ApiServiceError):
    """Persistence, ML, or optimizer is not wired yet. Maps to HTTP 503."""

    status_code = 503
    error_code = ErrorCode.DEPENDENCY_NOT_READY


class NotFoundError(ApiServiceError):
    status_code = 404
    error_code = ErrorCode.NOT_FOUND


class ConflictError(ApiServiceError):
    status_code = 409
    error_code = ErrorCode.CONFLICT


class MLServiceError(ApiServiceError):
    """Base exception for failures originating from or communicating with the ML component."""

    status_code = 502
    error_code = ErrorCode.PLAN_GENERATION_FAILED


class MLUnavailableError(DependencyNotReady):
    """ML scoring service is unreachable, down, or not configured."""


class MLResponseValidationError(ApiServiceError):
    """ML scoring response is malformed, missing task IDs, or contains invalid scores."""

    status_code = 502
    error_code = ErrorCode.PLAN_GENERATION_FAILED


class MLTimeoutError(ApiServiceError):
    """ML scoring batch request exceeded allowed timeout duration."""

    status_code = 504
    error_code = ErrorCode.PLAN_GENERATION_FAILED


class OptimizerServiceError(ApiServiceError):
    """Base exception for failures originating from or communicating with the optimizer component."""

    status_code = 502
    error_code = ErrorCode.PLAN_GENERATION_FAILED


class OptimizerUnavailableError(DependencyNotReady):
    """Optimizer scheduling service is unreachable, down, or not configured."""


class OptimizerResponseValidationError(ApiServiceError):
    """Optimizer response is malformed, missing task assignments, or violates constraints."""

    status_code = 502
    error_code = ErrorCode.PLAN_GENERATION_FAILED


class OptimizerTimeoutError(ApiServiceError):
    """Optimization solver exceeded the maximum allowed solving duration."""

    status_code = 504
    error_code = ErrorCode.PLAN_GENERATION_FAILED


class OptimizerInfeasibleError(ApiServiceError):
    """Optimizer determined that no feasible schedule exists given the hard constraints."""

    status_code = 422
    error_code = ErrorCode.PLAN_GENERATION_FAILED


class OverrideValidationError(ApiServiceError):
    """Planner override violates domain constraints (e.g. corridor mismatch, plan status)."""

    status_code = 422
    error_code = ErrorCode.OVERRIDE_REJECTED



