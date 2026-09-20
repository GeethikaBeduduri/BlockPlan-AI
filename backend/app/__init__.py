"""Application service dependency wiring."""

from functools import lru_cache

from app.services.kpis import KpiService, UnavailableKpiService
from app.services.overrides import OverrideService, UnavailableOverrideService
from app.services.plans import PlanService, UnavailablePlanService
from app.services.tasks import TaskService, UnavailableTaskService


def get_task_service() -> TaskService:
    return UnavailableTaskService()


@lru_cache(maxsize=1)
def get_plan_service() -> PlanService:
    return UnavailablePlanService()


def get_override_service() -> OverrideService:
    return UnavailableOverrideService()


def get_kpi_service() -> KpiService:
    return UnavailableKpiService()