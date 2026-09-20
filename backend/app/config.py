"""Centralized application settings.

Values come from environment variables with safe defaults.
Secrets and connection strings are not stored here. Database
settings belong with Person 2 once ``app/database.py`` exists.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, Field


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    """Process-wide API configuration. Extend via env, not hardcoded secrets."""

    app_title: str = Field(
        default="SIH26027 Block Planning API",
        description="OpenAPI title and service name.",
    )
    app_description: str = Field(
        default=(
            "Backend API for AI-powered automatic block planning to maximize "
            "asset availability for train operations on Indian Railways (SIH26027)."
        ),
        description="OpenAPI description.",
    )
    app_version: str = Field(default="0.1.0", description="API version string.")
    environment: str = Field(
        default="development",
        description="deployment environment label (development, staging, production).",
    )
    debug: bool = Field(default=False, description="Enable FastAPI debug mode.")

    # Celery & Redis configuration
    celery_broker_url: str = Field(
        default="redis://127.0.0.1:6379/0",
        description="Celery message broker connection URL.",
    )
    celery_result_backend: str = Field(
        default="redis://127.0.0.1:6379/1",
        description="Celery result backend connection URL.",
    )
    celery_task_always_eager: bool = Field(
        default=True,
        description="Execute Celery tasks synchronously in-process (useful for local dev and testing).",
    )
    celery_task_time_limit: int = Field(
        default=300,
        description="Maximum seconds a plan generation task may run before being terminated.",
    )
    ml_model_path: str = Field(
        default="model.pkl",
        description="Path to the serialized trained ML model pickle file.",
    )

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_title=os.getenv("APP_TITLE", cls.model_fields["app_title"].default),
            app_description=os.getenv(
                "APP_DESCRIPTION",
                cls.model_fields["app_description"].default,
            ),
            app_version=os.getenv("APP_VERSION", cls.model_fields["app_version"].default),
            environment=os.getenv("APP_ENV", cls.model_fields["environment"].default),
            debug=_env_bool("APP_DEBUG", default=False),
            celery_broker_url=os.getenv(
                "CELERY_BROKER_URL",
                os.getenv("REDIS_URL", cls.model_fields["celery_broker_url"].default),
            ),
            celery_result_backend=os.getenv(
                "CELERY_RESULT_BACKEND",
                cls.model_fields["celery_result_backend"].default,
            ),
            celery_task_always_eager=_env_bool("CELERY_TASK_ALWAYS_EAGER", default=True),
            celery_task_time_limit=int(
                os.getenv(
                    "CELERY_TASK_TIME_LIMIT",
                    str(cls.model_fields["celery_task_time_limit"].default),
                )
            ),
            ml_model_path=os.getenv(
                "ML_MODEL_PATH",
                cls.model_fields["ml_model_path"].default,
            ),
        )



@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings for the process lifetime."""
    return Settings.from_env()
