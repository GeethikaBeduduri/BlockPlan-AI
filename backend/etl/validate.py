from __future__ import annotations

from integrations.validators import validate_task, validate_window


def validate_records(tasks: list[dict], windows: list[dict]) -> None:
    for task in tasks:
        validate_task(task)
    for window in windows:
        validate_window(window)

    task_ids = [task["task_id"] for task in tasks]
    if len(task_ids) != len(set(task_ids)):
        raise ValueError("Duplicate normalized task_id detected")

    window_ids = [window["window_id"] for window in windows]
    if len(window_ids) != len(set(window_ids)):
        raise ValueError("Duplicate normalized window_id detected")
