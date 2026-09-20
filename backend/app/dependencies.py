"""Thin re-export of production FastAPI dependency providers.

All production wiring lives in ``app/services/__init__.py``.
This module exists for backward compatibility — import from either location
yields the same functions.  Do NOT add new wiring here.
"""

from app.services import (  # noqa: F401  (re-export)
    get_kpi_service,
    get_ml_service,
    get_override_repository,
    get_override_service,
    get_plan_repository,
    get_plan_service,
    get_task_repository,
    get_task_service,
    get_window_repository,
)