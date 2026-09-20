"""Pytest global configuration and test fixtures."""

import os
import pytest

from workers.celery_app import celery_app


@pytest.fixture(autouse=True)
def configure_test_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure Celery runs in eager mode during test execution."""
    monkeypatch.setenv("CELERY_TASK_ALWAYS_EAGER", "true")
    celery_app.conf.update(task_always_eager=True)
