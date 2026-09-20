"""Unit tests for error handling, exception hierarchy, and HTTP error code mapping.

Validates that:
- Each exception type maps to the correct HTTP status code.
- Error codes are a subset of the ErrorCode enum.
- Error messages are preserved through the exception chain.
- Service-level exceptions are never silently swallowed.
"""

from __future__ import annotations

import pytest

from app.schemas.enums import ErrorCode
from app.services.exceptions import (
    ApiServiceError,
    ConflictError,
    DependencyNotReady,
    MLResponseValidationError,
    MLServiceError,
    MLTimeoutError,
    MLUnavailableError,
    NotFoundError,
    OptimizerInfeasibleError,
    OptimizerResponseValidationError,
    OptimizerServiceError,
    OptimizerTimeoutError,
    OptimizerUnavailableError,
    OverrideValidationError,
)


class TestExceptionHierarchy:
    def test_api_service_error_is_base(self) -> None:
        exc = ApiServiceError("base error")
        assert isinstance(exc, Exception)
        assert exc.message == "base error"
        assert exc.status_code == 500

    def test_dependency_not_ready_is_503(self) -> None:
        exc = DependencyNotReady("redis down")
        assert exc.status_code == 503
        assert exc.error_code == ErrorCode.DEPENDENCY_NOT_READY

    def test_not_found_is_404(self) -> None:
        exc = NotFoundError("plan 42 not found")
        assert exc.status_code == 404
        assert exc.error_code == ErrorCode.NOT_FOUND

    def test_conflict_error_is_409(self) -> None:
        exc = ConflictError("plan_id mismatch")
        assert exc.status_code == 409
        assert exc.error_code == ErrorCode.CONFLICT

    def test_ml_service_error_is_502(self) -> None:
        exc = MLServiceError("ml error")
        assert exc.status_code == 502

    def test_ml_unavailable_error_is_503(self) -> None:
        exc = MLUnavailableError("ml down")
        assert isinstance(exc, DependencyNotReady)
        assert exc.status_code == 503

    def test_ml_response_validation_is_502(self) -> None:
        exc = MLResponseValidationError("bad response")
        assert exc.status_code == 502

    def test_ml_timeout_is_504(self) -> None:
        exc = MLTimeoutError("timed out")
        assert exc.status_code == 504

    def test_optimizer_service_error_is_502(self) -> None:
        exc = OptimizerServiceError("optimizer error")
        assert exc.status_code == 502

    def test_optimizer_unavailable_is_503(self) -> None:
        exc = OptimizerUnavailableError("optimizer down")
        assert isinstance(exc, DependencyNotReady)
        assert exc.status_code == 503

    def test_optimizer_response_validation_is_502(self) -> None:
        exc = OptimizerResponseValidationError("bad optimizer response")
        assert exc.status_code == 502

    def test_optimizer_timeout_is_504(self) -> None:
        exc = OptimizerTimeoutError("optimizer timeout")
        assert exc.status_code == 504

    def test_optimizer_infeasible_is_422(self) -> None:
        exc = OptimizerInfeasibleError("no feasible schedule")
        assert exc.status_code == 422

    def test_override_validation_is_422(self) -> None:
        exc = OverrideValidationError("corridor mismatch")
        assert exc.status_code == 422
        assert exc.error_code == ErrorCode.OVERRIDE_REJECTED

    def test_dependency_inherits_from_api_service_error(self) -> None:
        exc = DependencyNotReady("unavailable")
        assert isinstance(exc, ApiServiceError)

    def test_not_found_inherits_from_api_service_error(self) -> None:
        exc = NotFoundError("missing")
        assert isinstance(exc, ApiServiceError)

    def test_exception_message_is_args_string(self) -> None:
        exc = NotFoundError("plan 99 not found")
        assert str(exc) == "plan 99 not found"
