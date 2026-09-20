"""Celery application instance and worker configuration for block planning."""

from __future__ import annotations

from celery import Celery

from app.config import get_settings


def create_celery_app() -> Celery:
    """Instantiate and configure the Celery application from environment settings."""
    settings = get_settings()

    celery_app = Celery("block_planning_workers")

    celery_app.conf.update(
        broker_url=settings.celery_broker_url,
        result_backend=settings.celery_result_backend,
        task_always_eager=settings.celery_task_always_eager,
        task_time_limit=settings.celery_task_time_limit,
        task_soft_time_limit=max(settings.celery_task_time_limit - 15, 10),
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        imports=["workers.plan_tasks"],
    )

    return celery_app


celery_app = create_celery_app()
