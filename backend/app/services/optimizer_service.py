"""OR-Tools scheduling optimizer service interface and integration adapter.

Architecture Boundary
---------------------
- Group 1 (Optimization Team) owns the constraint-programming solver
  (e.g., Google OR-Tools CP-SAT, MILP models, heuristic algorithms).
- Person 1 (Backend) owns the integration contract, schedule validation,
  constraint verification (corridor matching, window capacity), and boundary error handling.

This module defines:
  1. ``OptimizerClient`` Protocol (what Group 1 or transport client implements).
  2. ``OptimizerService`` Protocol (what backend services like PlanService consume).
  3. ``OptimizerServiceAdapter`` (robust backend adapter that validates 1:1 task
     completeness, verifies corridor matching & window capacity, guards KPIs,
     and translates solver outages/timeouts).
  4. ``UnavailableOptimizerService`` (default placeholder until Group 1 lands).
  5. ``LocalCallableOptimizerClient`` (convenience wrapper for in-memory Python solvers).
"""

from __future__ import annotations

from typing import Callable, Protocol, runtime_checkable

from app.schemas.enums import AssignmentStatus
from app.schemas.optimizer import OptimizerInput, OptimizerResult
from app.services.exceptions import (
    ApiServiceError,
    OptimizerInfeasibleError,
    OptimizerResponseValidationError,
    OptimizerServiceError,
    OptimizerTimeoutError,
    OptimizerUnavailableError,
)

_OPT_NOT_READY_MSG = (
    "OR-Tools scheduling optimizer component is not wired. "
    "Group 1 must implement OptimizerClient or OptimizerService and register it. "
    "No schedule is computed and no assignments are fabricated."
)


@runtime_checkable
class OptimizerClient(Protocol):
    """Low-level driver interface for scheduling optimization.

    Group 1 can back this via:
      - Local Python function/class invoking OR-Tools CP-SAT solver
      - Internal HTTP/REST service endpoint
      - RPC/gRPC microservice
      - Celery async worker
    """

    def optimize_batch(self, request: OptimizerInput) -> OptimizerResult:
        """Execute scheduling solver for the provided tasks and block windows.

        Args:
            request: Ranked tasks, available windows, planning horizon, and constraints.

        Returns:
            OptimizerResult containing task assignments, KPIs, and solver telemetry.

        Raises:
            OptimizerUnavailableError / ConnectionError: If solver service is offline.
            OptimizerTimeoutError / TimeoutError: If solver exceeds time limit.
            OptimizerInfeasibleError: If no feasible block schedule exists.
            Exception: Any unexpected solver failure.
        """
        ...


@runtime_checkable
class OptimizerService(Protocol):
    """High-level service interface consumed by backend workflows (e.g. PlanService)."""

    def optimize(self, payload: OptimizerInput) -> OptimizerResult:
        """Execute optimization and return validated assignments with KPIs."""
        ...


class OptimizerServiceAdapter:
    """Production backend adapter wrapping any ``OptimizerClient``.

    Responsibilities:
      - Validates input (non-empty tasks and windows).
      - Delegates to configured ``OptimizerClient``.
      - Enforces strict response verification:
          * 1:1 Task Completeness: Every task must have an assignment (SCHEDULED or UNSCHEDULED).
            No tasks may be silently dropped or omitted.
          * No duplicate or unexpected task IDs.
          * Corridor Matching: Tasks must only be assigned to windows of the same corridor.
          * Capacity Enforcement: Total scheduled task hours in a window cannot exceed window available_hours.
          * KPI Consistency: Total tasks in KPI matches input count; scheduled + unscheduled == total.
          * Never silently marks failed/infeasible solver results as successful.
      - Maps transport/solver exceptions into typed ``ApiServiceError`` hierarchy.
    """

    def __init__(self, client: OptimizerClient) -> None:
        self._client = client

    def optimize(self, payload: OptimizerInput) -> OptimizerResult:
        """Send input to optimizer client and rigorously validate the generated schedule."""
        if not payload.tasks:
            raise ApiServiceError("Optimizer request must contain at least one task.")
        if not payload.windows:
            raise ApiServiceError("Optimizer request must contain at least one block window.")

        expected_task_ids = {t.task_id for t in payload.tasks}
        task_map = {t.task_id: t for t in payload.tasks}
        window_map = {w.window_id: w for w in payload.windows}

        # 1. Execute solver call with exception translation
        try:
            result = self._client.optimize_batch(payload)
        except OptimizerUnavailableError:
            raise
        except OptimizerTimeoutError:
            raise
        except OptimizerInfeasibleError:
            raise
        except OptimizerResponseValidationError:
            raise
        except TimeoutError as exc:
            raise OptimizerTimeoutError(f"Scheduling optimization timed out: {exc}") from exc
        except ConnectionError as exc:
            raise OptimizerUnavailableError(
                f"Scheduling optimizer service unreachable: {exc}"
            ) from exc
        except Exception as exc:
            raise OptimizerServiceError(f"Scheduling optimization failed: {exc}") from exc

        # 2. Validate result structure
        if result is None or result.assignments is None or result.kpis is None:
            raise OptimizerResponseValidationError(
                "Optimizer returned an empty or malformed result."
            )

        # 3. Check solver status if metadata is present
        if result.metadata is not None:
            status = (result.metadata.solver_status or "").upper()
            if status in {"INFEASIBLE", "MODEL_INVALID"}:
                raise OptimizerInfeasibleError(
                    f"Optimizer determined schedule is infeasible (solver status: {status})."
                )
            if status == "TIMEOUT":
                raise OptimizerTimeoutError(
                    "Optimizer timed out before finding a feasible schedule."
                )

        # 4. Validate 1:1 Task ID Completeness and uniqueness
        received_task_ids: set[int] = set()
        window_scheduled_hours: dict[int, float] = {w.window_id: 0.0 for w in payload.windows}

        for assignment in result.assignments:
            tid = assignment.task_id
            if tid in received_task_ids:
                raise OptimizerResponseValidationError(
                    f"Optimizer returned duplicate assignment for task_id={tid}."
                )
            received_task_ids.add(tid)

            if tid not in task_map:
                raise OptimizerResponseValidationError(
                    f"Optimizer returned assignment for unexpected task_id={tid} not in request."
                )

            task_feature = task_map[tid]

            # Invariant checks for scheduled tasks
            if assignment.status in {AssignmentStatus.SCHEDULED, AssignmentStatus.OVERRIDDEN}:
                wid = assignment.window_id
                if wid is None:
                    raise OptimizerResponseValidationError(
                        f"Task {tid} is marked scheduled but has no window_id."
                    )
                if wid not in window_map:
                    raise OptimizerResponseValidationError(
                        f"Task {tid} was assigned to unknown window_id={wid}."
                    )

                assigned_window = window_map[wid]

                # Corridor Matching validation
                if task_feature.corridor_id != assigned_window.corridor_id:
                    raise OptimizerResponseValidationError(
                        f"Corridor mismatch for task {tid}: task corridor is '{task_feature.corridor_id}' "
                        f"but assigned window {wid} corridor is '{assigned_window.corridor_id}'."
                    )

                # Accumulate hours for capacity limit validation
                window_scheduled_hours[wid] += assignment.estimated_hours

            elif assignment.status is AssignmentStatus.UNSCHEDULED:
                if assignment.window_id is not None or assignment.day is not None:
                    raise OptimizerResponseValidationError(
                        f"Unscheduled task {tid} must not have window_id or day assigned."
                    )

        # Ensure no tasks were silently omitted
        missing_task_ids = expected_task_ids - received_task_ids
        if missing_task_ids:
            raise OptimizerResponseValidationError(
                f"Optimizer silently omitted tasks from the schedule: {sorted(missing_task_ids)}. "
                "All tasks must be present as either scheduled or unscheduled."
            )

        # 5. Window Capacity Limit Verification
        for wid, scheduled_hrs in window_scheduled_hours.items():
            avail_hrs = window_map[wid].available_hours
            if scheduled_hrs > avail_hrs + 1e-6:
                raise OptimizerResponseValidationError(
                    f"Window capacity exceeded for window_id={wid}: "
                    f"scheduled {scheduled_hrs:.2f}h > available {avail_hrs:.2f}h."
                )

        # 6. KPI Invariant Verification
        kpi = result.kpis
        if kpi.total_tasks != len(payload.tasks):
            raise OptimizerResponseValidationError(
                f"KPI total_tasks ({kpi.total_tasks}) does not match input task count ({len(payload.tasks)})."
            )
        if kpi.scheduled_tasks + kpi.unscheduled_tasks != kpi.total_tasks:
            raise OptimizerResponseValidationError(
                f"KPI invariant violated: scheduled ({kpi.scheduled_tasks}) + "
                f"unscheduled ({kpi.unscheduled_tasks}) != total ({kpi.total_tasks})."
            )

        return result


class UnavailableOptimizerService:
    """Explicit placeholder until Group 1 provides the OR-Tools implementation."""

    def optimize(self, payload: OptimizerInput) -> OptimizerResult:
        raise OptimizerUnavailableError(_OPT_NOT_READY_MSG)

    def optimize_batch(self, request: OptimizerInput) -> OptimizerResult:
        raise OptimizerUnavailableError(_OPT_NOT_READY_MSG)


class LocalCallableOptimizerClient:
    """Adapter for in-process Python callables (e.g. Group 1 local OR-Tools solver).

    Accepts a callable: ``Callable[[OptimizerInput], OptimizerResult]``.
    """

    def __init__(
        self,
        handler: Callable[[OptimizerInput], OptimizerResult],
    ) -> None:
        self._handler = handler

    def optimize_batch(self, request: OptimizerInput) -> OptimizerResult:
        return self._handler(request)
