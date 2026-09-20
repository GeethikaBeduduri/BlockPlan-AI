"""Concrete planner override service implementation.

Validates and applies manual planner overrides to generated block plans.
Ensures durable audit logging and constraint verification before committing changes.
"""

from __future__ import annotations

from app.schemas.enums import AssignmentStatus, OverrideAction, PlanStatus
from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.services.exceptions import ConflictError, NotFoundError, OverrideValidationError
from app.services.repositories import OverrideRepository, PlanRepository, WindowRepository


class ConcreteOverrideService:
    """Production planner override service.

    Orchestrates:
      1. Path/Body plan_id consistency verification.
      2. Plan existence and status verification (must be READY).
      3. Assignment existence verification within the plan.
      4. Target window existence and corridor matching validation.
      5. Window capacity validation (for REASSIGN action).
      6. Committing the override record via ``OverrideRepository`` for audit logging.
      7. Returning the updated override response.
    """

    def __init__(
        self,
        *,
        override_repo: OverrideRepository,
        plan_repo: PlanRepository,
        window_repo: WindowRepository | None = None,
    ) -> None:
        self._override_repo = override_repo
        self._plan_repo = plan_repo
        self._window_repo = window_repo

    def apply_override(
        self,
        plan_id: int,
        payload: PlannerOverrideCreate,
        overridden_by: str | None = None,
    ) -> PlannerOverrideResponse:
        """Validate and apply a manual override to a generated block plan.

        Raises:
            ConflictError (409): If path plan_id != body plan_id.
            NotFoundError (404): If plan, task assignment, or target window does not exist.
            OverrideValidationError (422): If corridor mismatch, plan not ready, or capacity exceeded.
        """
        # Step 1: Verify path vs body plan_id match
        if payload.plan_id != plan_id:
            raise ConflictError("plan_id in the path and request body must match")

        # Step 2: Retrieve target plan from persistence
        plan = self._plan_repo.get_by_id(plan_id)
        if plan is None:
            raise NotFoundError(f"Block plan {plan_id} not found.")

        if plan.status is not PlanStatus.READY:
            raise OverrideValidationError(
                f"Cannot override block plan {plan_id} with status '{plan.status.value}'. "
                "Overrides are only permitted on plans in 'ready' status."
            )

        # Step 3: Find the assignment in the plan
        assignment = next(
            (a for a in plan.assignments if a.task_id == payload.task_id),
            None,
        )
        if assignment is None:
            raise NotFoundError(
                f"Task {payload.task_id} was not found in block plan {plan_id} assignments."
            )

        # Step 4: Validate target window if action requires a window (REASSIGN / FORCE_SCHEDULE)
        if payload.action in {OverrideAction.REASSIGN, OverrideAction.FORCE_SCHEDULE}:
            target_window_id = payload.target_window_id
            if target_window_id is None:
                raise OverrideValidationError(
                    f"Override action '{payload.action.value}' requires target_window_id."
                )

            # Check target window corridor matching
            if self._window_repo is not None:
                all_windows_res = self._window_repo.list_all(corridor_id=None)
                target_window = next(
                    (w for w in all_windows_res.items if w.window_id == target_window_id),
                    None,
                )
                if target_window is None:
                    raise NotFoundError(
                        f"Target block window {target_window_id} not found."
                    )

                if target_window.corridor_id != assignment.corridor_id:
                    raise OverrideValidationError(
                        f"Corridor mismatch for override: task {payload.task_id} corridor is "
                        f"'{assignment.corridor_id}' but target window {target_window_id} is "
                        f"on corridor '{target_window.corridor_id}'."
                    )

                # For REASSIGN (not FORCE_SCHEDULE), verify window capacity
                if payload.action is OverrideAction.REASSIGN:
                    current_window_tasks = [
                        a
                        for a in plan.assignments
                        if a.window_id == target_window_id and a.task_id != payload.task_id
                    ]
                    current_hours = sum(a.estimated_hours for a in current_window_tasks)
                    if current_hours + assignment.estimated_hours > target_window.available_hours + 1e-6:
                        raise OverrideValidationError(
                            f"Window capacity exceeded for window {target_window_id}: "
                            f"current ({current_hours:.2f}h) + task ({assignment.estimated_hours:.2f}h) > "
                            f"available ({target_window.available_hours:.2f}h). "
                            "Use action 'force_schedule' if you wish to override capacity limits."
                        )

        elif payload.action is OverrideAction.UNSCHEDULE:
            if payload.target_window_id is not None:
                raise OverrideValidationError(
                    "Override action 'unschedule' must not specify a target_window_id."
                )

        # Step 5: Commit audit record to OverrideRepository
        return self._override_repo.record_override(
            plan_id=plan_id,
            payload=payload,
            overridden_by=overridden_by,
        )
