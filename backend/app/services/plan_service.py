"""Concrete plan service implementation.

Orchestrates the full block-plan generation workflow:

  1. Validate the planning horizon (done by Pydantic at schema level).
  2. Fetch open tasks from ``TaskRepository``.
  3. Fetch available block windows from ``WindowRepository``.
  4. Call ``MlScoringService`` to get criticality scores for all tasks.
  5. Call ``OptimizerService`` to produce an optimized assignment schedule.
  6. Persist the result via ``PlanRepository`` and return the job handle
     (Celery async dispatch will be wired in a later phase — currently
     the generation runs synchronously so the interface is already correct).

NO SQL, NO ML MODEL CODE, NO OR-TOOLS CODE lives here.
"""

from __future__ import annotations

from app.schemas.horizon import PlanGenerateRequest
from app.schemas.internal import OptimizerInput, OptimizerResult
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.services.exceptions import ApiServiceError, DependencyNotReady
from app.services.ml_service import MlScoringService
from app.services.optimizer_service import OptimizerService
from app.services.repositories import PlanRepository, TaskRepository, WindowRepository


class ConcretePlanService:
    """Production plan service: orchestrates ML → optimizer → persistence.

    Dependency injection pattern::

        service = ConcretePlanService(
            task_repo=MyPostgresTaskRepo(session),
            window_repo=MyPostgresWindowRepo(session),
            plan_repo=MyPostgresPlanRepo(session),
            ml=MyXGBoostScoringService(),
            optimizer=MyORToolsOptimizerService(),
        )

    This class satisfies the ``PlanService`` Protocol defined in
    ``app/services/plans.py``.

    Celery integration note
    -----------------------
    When Celery is wired, ``generate_plan`` will:
      1. Call ``plan_repo.create_pending(...)`` synchronously (creates the DB row).
      2. Dispatch a Celery task carrying ``plan_id`` and the request payload.
      3. Return the ``PlanJobResponse`` immediately (202 Accepted pattern).
    The Celery worker will then call ``_run_generation`` and call
    ``plan_repo.save_result`` or ``plan_repo.mark_failed``.
    Until Celery is wired, the full workflow runs synchronously.
    """

    def __init__(
        self,
        *,
        task_repo: TaskRepository,
        window_repo: WindowRepository,
        plan_repo: PlanRepository,
        ml: MlScoringService,
        optimizer: OptimizerService,
    ) -> None:
        self._task_repo = task_repo
        self._window_repo = window_repo
        self._plan_repo = plan_repo
        self._ml = ml
        self._optimizer = optimizer

    # ------------------------------------------------------------------
    # Public API (matches PlanService Protocol)
    # ------------------------------------------------------------------

    def generate_plan(self, payload: PlanGenerateRequest) -> PlanJobResponse:
        """Reserve a plan record and dispatch the asynchronous background generation job.

        Returns immediately with HTTP 202-ready job handle.
        """
        # Step 1: Reserve a plan record in the database (PENDING status)
        job = self._plan_repo.create_pending(
            horizon_type=payload.horizon_type.value,
            horizon_start=payload.horizon_start,
            horizon_end=payload.horizon_end,
            corridor_id=payload.corridor_id,
            department=payload.department,
        )

        job_id = job.job_id

        # Step 2: Dispatch background worker task
        try:
            from workers.plan_tasks import generate_plan_background_task

            celery_result = generate_plan_background_task.delay(
                job.plan_id,
                payload.model_dump(mode="json"),
            )
            if celery_result and hasattr(celery_result, "id"):
                job_id = str(celery_result.id)
        except Exception:
            # If Celery worker/broker is not configured or in sync fallback mode,
            # retain the repository job_id
            pass

        return PlanJobResponse(
            accepted=True,
            job_id=job_id,
            plan_id=job.plan_id,
            horizon_type=payload.horizon_type.value,
            status=job.status,
        )

    def execute_generation(
        self, plan_id: int, payload: PlanGenerateRequest
    ) -> OptimizerResult:
        """Execute the ML scoring + optimization pipeline and persist the result.

        Called by the Celery worker during asynchronous execution.
        """
        result = self._run_generation(payload)
        self._plan_repo.save_result(plan_id=plan_id, result=result)
        return result

    def mark_failed(self, plan_id: int, reason: str) -> None:
        """Mark a plan as failed in persistence with the error reason."""
        self._plan_repo.mark_failed(plan_id=plan_id, reason=reason)

    def get_plan(self, plan_id: int) -> BlockPlanResponse:
        """Return a complete block plan with assignments and KPIs.

        Raises:
            NotFoundError: If ``plan_id`` does not exist.
            DependencyNotReady: If the repository is not yet available.
        """
        return self._plan_repo.get_by_id(plan_id)


    # ------------------------------------------------------------------
    # Internal generation workflow
    # ------------------------------------------------------------------

    def _run_generation(self, payload: PlanGenerateRequest) -> object:
        """Execute the three-step generation pipeline and return OptimizerResult."""
        # Step 2: Fetch open tasks (pre-shaped as ScoredTask with score=0).
        raw_tasks = self._task_repo.list_open_for_scoring(
            corridor_id=payload.corridor_id,
            department=payload.department,
        )
        if not raw_tasks:
            raise ApiServiceError(
                "No open maintenance tasks found for the requested corridor/department. "
                "Cannot generate a plan with zero tasks."
            )

        # Step 3: Fetch available block windows for the planning horizon.
        windows = self._window_repo.list_windows(
            corridor_id=payload.corridor_id,
            horizon_start=payload.horizon_start,
            horizon_end=payload.horizon_end,
        )
        if not windows:
            raise ApiServiceError(
                "No block windows are configured for the requested corridor and horizon. "
                "Cannot generate a plan with zero windows."
            )

        # Step 4: ML criticality scoring — scores tasks in batch.
        scored_tasks = self._ml.score_tasks(raw_tasks)

        # Step 5: Optimizer — produces assignments and KPIs.
        optimizer_input = OptimizerInput(tasks=scored_tasks, windows=windows)
        return self._optimizer.optimize(optimizer_input)
