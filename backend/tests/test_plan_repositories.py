from datetime import date

import pytest

from database.connection import SessionLocal
from database.models import PlanAssignment, PlannerOverride
from database.plan_repositories import (
    OverrideRepository,
    PlanRepository,
)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_plan_repository_lifecycle(db):
    repo = PlanRepository(db)

    plan = repo.create_pending(
        horizon_type="DAILY",
        horizon_start=date(2026, 8, 28),
        horizon_end=date(2026, 8, 28),
        corridor_id="C01",
        department="TRACK",
    )

    assert plan.id is not None
    assert plan.status == "PENDING"

    fetched = repo.get_by_id(plan.id)

    assert fetched is not None
    assert fetched.id == plan.id
    assert fetched.horizon_type == "DAILY"

    repo.save_result(
        plan.id,
        [
            {
                "task_id": 1,
                "window_id": 1,
                "department": "TRACK",
                "joint_block_flag": False,
            }
        ],
    )

    db.expire_all()

    ready_plan = repo.get_by_id(plan.id)

    assert ready_plan is not None
    assert ready_plan.status == "READY"
    assert ready_plan.generated_at is not None

    assignment = (
        db.query(PlanAssignment)
        .filter(PlanAssignment.plan_id == plan.id)
        .first()
    )

    assert assignment is not None
    assert assignment.task_id == 1
    assert assignment.window_id == 1


def test_mark_plan_failed(db):
    repo = PlanRepository(db)

    plan = repo.create_pending(
        horizon_type="WEEKLY",
        horizon_start=date(2026, 8, 28),
        horizon_end=date(2026, 9, 3),
    )

    failed = repo.mark_failed(
        plan.id,
        "Optimizer could not produce a feasible plan",
    )

    assert failed.status == "FAILED"
    assert failed.failure_reason == (
        "Optimizer could not produce a feasible plan"
    )


def test_record_override(db):
    plan_repo = PlanRepository(db)

    plan = plan_repo.create_pending(
        horizon_type="DAILY",
        horizon_start=date(2026, 8, 28),
        horizon_end=date(2026, 8, 28),
        department="TRACK",
    )

    plan_repo.save_result(
        plan.id,
        [
            {
                "task_id": 1,
                "window_id": 1,
                "department": "TRACK",
            }
        ],
    )

    assignment = (
        db.query(PlanAssignment)
        .filter(PlanAssignment.plan_id == plan.id)
        .first()
    )

    assert assignment is not None

    repo = OverrideRepository(db)

    override = repo.record_override(
        plan_id=plan.id,
        assignment_id=assignment.id,
        task_id=assignment.task_id,
        action="REASSIGN",
        target_window_id=2,
        reason="Planner selected a better maintenance window",
        overridden_by="varun",
    )

    assert override.id is not None
    assert override.plan_id == plan.id
    assert override.assignment_id == assignment.id
    assert override.task_id == assignment.task_id
    assert override.action == "REASSIGN"
    assert override.target_window_id == 2
    assert override.overridden_by == "varun"

    saved_override = (
        db.query(PlannerOverride)
        .filter(PlannerOverride.id == override.id)
        .first()
    )

    assert saved_override is not None
    assert saved_override.reason == (
        "Planner selected a better maintenance window"
    )