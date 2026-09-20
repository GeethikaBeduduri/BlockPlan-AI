"""KPI service interface. Formulas stay out of the router layer."""

from __future__ import annotations

from typing import Protocol

from app.schemas.common import PaginationParams
from app.schemas.kpis import CriticalTasksKpiResponse, KpiQuery, KpiResponse
from app.services.exceptions import DependencyNotReady

_KPI_MESSAGE = (
    "KPI APIs require a stored plan from Person 2 (and optimizer outputs from Group 1). "
    "No availability, utilization, or critical-task figures are fabricated."
)


class KpiService(Protocol):
    def availability(self, query: KpiQuery) -> KpiResponse: ...

    def utilization(self, query: KpiQuery) -> KpiResponse: ...

    def critical_tasks(
        self,
        query: KpiQuery,
        pagination: PaginationParams,
    ) -> CriticalTasksKpiResponse: ...


class UnavailableKpiService:
    def availability(self, query: KpiQuery) -> KpiResponse:
        raise DependencyNotReady(_KPI_MESSAGE)

    def utilization(self, query: KpiQuery) -> KpiResponse:
        raise DependencyNotReady(_KPI_MESSAGE)

    def critical_tasks(
        self,
        query: KpiQuery,
        pagination: PaginationParams,
    ) -> CriticalTasksKpiResponse:
        raise DependencyNotReady(_KPI_MESSAGE)
