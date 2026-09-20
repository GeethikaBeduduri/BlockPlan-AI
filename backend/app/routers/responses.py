"""Reusable OpenAPI error response declarations for thin routers."""

from app.schemas.common import ErrorResponse

VALIDATION_RESPONSES = {
    422: {"model": ErrorResponse, "description": "Request validation failed"},
}

UNAVAILABLE_RESPONSES = {
    **VALIDATION_RESPONSES,
    503: {
        "model": ErrorResponse,
        "description": "Database, ML, or optimizer dependency is not ready",
    },
}

NOT_FOUND_RESPONSES = {
    **UNAVAILABLE_RESPONSES,
    404: {"model": ErrorResponse, "description": "Resource not found"},
}

OVERRIDE_RESPONSES = {
    **UNAVAILABLE_RESPONSES,
    404: {"model": ErrorResponse, "description": "Plan or task not found"},
    409: {"model": ErrorResponse, "description": "Path and body plan_id differ"},
}
