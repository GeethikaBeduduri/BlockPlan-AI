"""Planner-override service interface."""

from __future__ import annotations

from typing import Protocol

from app.schemas.overrides import PlannerOverrideCreate, PlannerOverrideResponse
from app.services.exceptions import ConflictError, DependencyNotReady

_OVERRIDE_MESSAGE = (
    "Override APIs require Person 2 persistence so reasons can be stored. "
    "No override is applied and no success payload is fabricated."
)


class OverrideService(Protocol):
    def apply_override(
        self,
        plan_id: int,
        payload: PlannerOverrideCreate,
    ) -> PlannerOverrideResponse: ...


class UnavailableOverrideService:
    def apply_override(
        self,
        plan_id: int,
        payload: PlannerOverrideCreate,
    ) -> PlannerOverrideResponse:
        if payload.plan_id != plan_id:
            raise ConflictError("plan_id in the path and request body must match")
        raise DependencyNotReady(_OVERRIDE_MESSAGE)
