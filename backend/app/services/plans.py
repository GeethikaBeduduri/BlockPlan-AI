"""Block-plan service interface. No optimizer or Celery in this layer."""

from __future__ import annotations

from typing import Protocol

from app.schemas.horizon import PlanGenerateRequest
from app.schemas.plans import BlockPlanResponse, PlanJobResponse
from app.services.exceptions import DependencyNotReady

_PLAN_MESSAGE = (
    "Plan APIs require Person 2 persistence and Group 1 ML/optimizer services. "
    "Generation is not executed and no plan payload is fabricated. Celery is not wired."
)


class PlanService(Protocol):
    def generate_plan(self, payload: PlanGenerateRequest) -> PlanJobResponse: ...

    def get_plan(self, plan_id: int) -> BlockPlanResponse: ...


class UnavailablePlanService:
    def generate_plan(self, payload: PlanGenerateRequest) -> PlanJobResponse:
        raise DependencyNotReady(_PLAN_MESSAGE)

    def get_plan(self, plan_id: int) -> BlockPlanResponse:
        raise DependencyNotReady(_PLAN_MESSAGE)
