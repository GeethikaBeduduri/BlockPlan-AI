"""Default FastAPI dependencies and production service wiring.

Provides dependency injection providers for FastAPI routers.
Wires concrete application services to real SQL repositories, while
maintaining fail-loud DependencyNotReady exceptions when external
dependencies (database, ML, optimizer) are not connected.
"""

from __future__ import annotations

import logging

from app.services.kpi_service import ConcreteKpiService
from app.services.kpis import KpiService, UnavailableKpiService
from app.services.ml_service import (
    MlScoringService,
    UnavailableMlScoringService,
    get_ml_service as _get_ml_service,
)
from app.services.optimizer_service import UnavailableOptimizerService
from app.services.override_service import ConcreteOverrideService
from app.services.overrides import OverrideService, UnavailableOverrideService
from app.services.plan_service import ConcretePlanService
from app.services.plans import PlanService, UnavailablePlanService
from app.services.sql_repositories import (
    SqlAlchemyOverrideRepository,
    SqlAlchemyPlanRepository,
    SqlAlchemyTaskRepository,
    SqlAlchemyWindowRepository,
)
from app.services.task_service import ConcreteTaskService
from app.services.tasks import TaskService, UnavailableTaskService

logger = logging.getLogger(__name__)


def get_task_repository() -> SqlAlchemyTaskRepository:
    """Return production SQLAlchemy task repository."""
    return SqlAlchemyTaskRepository()


def get_window_repository() -> SqlAlchemyWindowRepository:
    """Return production SQLAlchemy window repository."""
    return SqlAlchemyWindowRepository()


def get_plan_repository() -> SqlAlchemyPlanRepository:
    """Return production SQLAlchemy plan repository."""
    return SqlAlchemyPlanRepository()


def get_override_repository() -> SqlAlchemyOverrideRepository:
    """Return production SQLAlchemy override repository."""
    return SqlAlchemyOverrideRepository()


def get_task_service() -> TaskService:
    """Return production TaskService wired with SqlAlchemyTaskRepository.

    Falls back to UnavailableTaskService if repository construction fails.
    """
    try:
        task_repo = get_task_repository()
        return ConcreteTaskService(repository=task_repo)
    except Exception as exc:
        logger.warning("Failed to initialize SqlAlchemyTaskRepository: %s", exc)
        return UnavailableTaskService()


def get_ml_service() -> MlScoringService:
    """Return production ML criticality-scoring service wired to model.pkl.

    Falls back to UnavailableMlScoringService if model file cannot be loaded.
    """
    try:
        return _get_ml_service()
    except Exception as exc:
        logger.warning("Failed to initialize ML scoring service: %s", exc)
        return UnavailableMlScoringService()


from app.services.cpsat_optimizer import CpSatOptimizerClient
from app.services.optimizer_service import OptimizerServiceAdapter, UnavailableOptimizerService


def get_plan_service() -> PlanService:
    """Return production PlanService wired with SqlAlchemyPlanRepository and CP-SAT optimizer.

    Falls back to UnavailablePlanService if repository construction fails.
    """
    try:
        task_repo = get_task_repository()
        window_repo = get_window_repository()
        plan_repo = get_plan_repository()
        ml_service = get_ml_service()
        optimizer_client = CpSatOptimizerClient()
        optimizer_adapter = OptimizerServiceAdapter(client=optimizer_client)
        return ConcretePlanService(
            task_repo=task_repo,
            window_repo=window_repo,
            plan_repo=plan_repo,
            ml=ml_service,
            optimizer=optimizer_adapter,
        )
    except Exception as exc:
        logger.warning("Failed to initialize ConcretePlanService: %s", exc)
        return UnavailablePlanService()


def get_override_service() -> OverrideService:
    """Return production OverrideService wired with SqlAlchemyOverrideRepository.

    Falls back to UnavailableOverrideService if repository construction fails.
    """
    try:
        override_repo = get_override_repository()
        plan_repo = get_plan_repository()
        window_repo = get_window_repository()
        return ConcreteOverrideService(
            override_repo=override_repo,
            plan_repo=plan_repo,
            window_repo=window_repo,
        )
    except Exception as exc:
        logger.warning("Failed to initialize ConcreteOverrideService: %s", exc)
        return UnavailableOverrideService()


def get_kpi_service() -> KpiService:
    """Return production KpiService wired with SqlAlchemyPlanRepository and SqlAlchemyTaskRepository."""
    try:
        plan_repo = get_plan_repository()
        task_repo = get_task_repository()
        return ConcreteKpiService(
            plan_repo=plan_repo,
            task_repo=task_repo,
        )
    except Exception as exc:
        logger.warning("Failed to initialize ConcreteKpiService: %s", exc)
        return UnavailableKpiService()

