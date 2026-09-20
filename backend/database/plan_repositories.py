from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from database.models import (
    BlockPlan,
    PlanAssignment,
    PlannerOverride,
)


class PlanRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_pending(
        self,
        horizon_type: str,
        horizon_start: date,
        horizon_end: date,
        corridor_id: str | None = None,
        department: str | None = None,
    ) -> BlockPlan:
        plan = BlockPlan(
            horizon_type=horizon_type,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            corridor_id=corridor_id,
            department=department,
            status="PENDING",
        )

        self.db.add(plan)
        self.db.commit()
        self.db.refresh(plan)

        return plan

    def save_result(
        self,
        plan_id: int,
        assignments: list[dict],
    ) -> BlockPlan:
        plan = self.get_by_id(plan_id)

        if plan is None:
            raise ValueError(f"Plan {plan_id} not found")

        for assignment_data in assignments:
            assignment = PlanAssignment(
                plan_id=plan_id,
                task_id=assignment_data["task_id"],
                window_id=assignment_data["window_id"],
                department=assignment_data["department"],
                joint_block_flag=assignment_data.get(
                    "joint_block_flag",
                    False,
                ),
                status=assignment_data.get(
                    "status",
                    "ASSIGNED",
                ),
            )

            self.db.add(assignment)

        plan.status = "READY"
        plan.generated_at = datetime.now(UTC)
        plan.failure_reason = None

        self.db.commit()
        self.db.refresh(plan)

        return plan

    def mark_failed(
        self,
        plan_id: int,
        failure_reason: str,
    ) -> BlockPlan:
        plan = self.get_by_id(plan_id)

        if plan is None:
            raise ValueError(f"Plan {plan_id} not found")

        plan.status = "FAILED"
        plan.failure_reason = failure_reason[:1000]

        self.db.commit()
        self.db.refresh(plan)

        return plan

    def get_by_id(
        self,
        plan_id: int,
    ) -> BlockPlan | None:
        return (
            self.db.query(BlockPlan)
            .filter(BlockPlan.id == plan_id)
            .first()
        )


class OverrideRepository:
    def __init__(self, db: Session):
        self.db = db

    def record_override(
        self,
        plan_id: int,
        assignment_id: int,
        task_id: int,
        action: str,
        reason: str,
        overridden_by: str,
        target_window_id: int | None = None,
    ) -> PlannerOverride:
        override = PlannerOverride(
            plan_id=plan_id,
            assignment_id=assignment_id,
            task_id=task_id,
            action=action,
            target_window_id=target_window_id,
            reason=reason,
            overridden_by=overridden_by,
        )

        self.db.add(override)
        self.db.commit()
        self.db.refresh(override)

        return override