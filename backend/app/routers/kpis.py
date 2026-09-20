"""KPI HTTP routes. Computation lives in ``KpiService``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.routers.responses import UNAVAILABLE_RESPONSES
from app.schemas.common import PaginationParams
from app.schemas.enums import PlanningHorizonType
from app.schemas.kpis import CriticalTasksKpiResponse, KpiQuery, KpiResponse
from app.services import get_kpi_service
from app.services.kpis import KpiService

router = APIRouter(prefix="/kpis", tags=["kpis"])

# ---------------------------------------------------------------------------
# Shared query-parameter helper
# ---------------------------------------------------------------------------

def _kpi_query(
    plan_id: Annotated[int | None, Query(gt=0, description="Filter to a specific plan")] = None,
    corridor_id: Annotated[
        str | None, Query(min_length=2, max_length=32, description="Filter by corridor")
    ] = None,
    department: Annotated[
        str | None, Query(description="Filter by department (e.g. Engineering, S_AND_T, Electrical)")
    ] = None,
    horizon_type: PlanningHorizonType | None = None,
) -> KpiQuery:
    from app.schemas.enums import Department

    dept_enum = None
    if department:
        try:
            dept_enum = Department(department)
        except ValueError:
            pass

    return KpiQuery(
        plan_id=plan_id,
        corridor_id=corridor_id,
        department=dept_enum,
        horizon_type=horizon_type,
    )



@router.get(
    "/availability",
    response_model=KpiResponse,
    responses=UNAVAILABLE_RESPONSES,
    summary="Asset availability KPI for a plan or horizon",
    description=(
        "Returns the percentage of scheduled tasks relative to total tasks "
        "(prototype formula: scheduled_tasks / total_tasks * 100). "
        "Requires a stored plan from Person 2 — returns 503 until available."
    ),
)
def availability(
    service: Annotated[KpiService, Depends(get_kpi_service)],
    query: Annotated[KpiQuery, Depends(_kpi_query)],
) -> KpiResponse:
    return service.availability(query)


@router.get(
    "/utilization",
    response_model=KpiResponse,
    responses=UNAVAILABLE_RESPONSES,
    summary="Window utilization KPI for a plan or horizon",
    description=(
        "Returns scheduled_hours vs available_window_hours. "
        "Requires a stored plan from Person 2 — returns 503 until available."
    ),
)
def utilization(
    service: Annotated[KpiService, Depends(get_kpi_service)],
    query: Annotated[KpiQuery, Depends(_kpi_query)],
) -> KpiResponse:
    return service.utilization(query)


@router.get(
    "/critical-tasks",
    response_model=CriticalTasksKpiResponse,
    responses=UNAVAILABLE_RESPONSES,
    summary="Unscheduled critical (severity-A) tasks for a plan",
    description=(
        "Lists severity-A maintenance tasks that could not be scheduled. "
        "Supports pagination. Returns 503 until Person 2 persistence is ready."
    ),
)
def critical_tasks(
    service: Annotated[KpiService, Depends(get_kpi_service)],
    query: Annotated[KpiQuery, Depends(_kpi_query)],
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CriticalTasksKpiResponse:
    return service.critical_tasks(
        query,
        pagination=PaginationParams(limit=limit, offset=offset),
    )
