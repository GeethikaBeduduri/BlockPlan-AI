"""HTTP routers. Domain routers are registered from ``app.main`` via ``get_routers``."""

from collections.abc import Sequence

from fastapi import APIRouter

from app.routers import kpis, overrides, plans, tasks

ROUTERS: list[APIRouter] = [
    tasks.router,
    plans.router,
    kpis.router,
    overrides.router,
]


def get_routers() -> Sequence[APIRouter]:
    """Return routers ready for ``FastAPI.include_router``."""
    return tuple(ROUTERS)
