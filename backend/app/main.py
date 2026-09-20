"""FastAPI application entrypoint for Person 1 (API layer).

Database engines and sessions stay out of this module (Person 2 owns
``app/database.py``). ML, optimizer, Celery, and Redis are not wired here.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.routers import get_routers
from app.schemas.common import ErrorResponse
from app.schemas.system import HealthResponse, RootResponse
from app.services.exceptions import ApiServiceError


from contextlib import asynccontextmanager
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    try:
        from database.connection import create_tables, SessionLocal
        from database.models import MaintenanceTask
        create_tables()
        logger.info("Database schema initialized successfully.")

        try:
            with SessionLocal() as db:
                task_count = db.query(MaintenanceTask).count()
                if task_count == 0:
                    logger.info("Database is empty. Seeding initial sample data...")
                    from pathlib import Path
                    from etl.pipeline import run_pipeline
                    backend_dir = Path(__file__).resolve().parent.parent
                    data_dir = backend_dir / "data_samples"
                    if not data_dir.exists():
                        data_dir = backend_dir / "data" / "samples"
                    if data_dir.exists():
                        result = run_pipeline(db, data_dir)
                        logger.info("Seeded initial data successfully: %s", result)
        except Exception as seed_exc:
            logger.warning("Could not seed initial sample data: %s", seed_exc)

        try:
            with SessionLocal() as db:
                from database.models import BlockPlan
                plan_count = db.query(BlockPlan).count()
                if plan_count == 0:
                    logger.info("No plans found. Generating initial seed Plan 1...")
                    from datetime import date, timedelta
                    from app.schemas.horizon import PlanGenerateRequest
                    from app.services import get_plan_service
                    today = date.today()
                    seed_payload = PlanGenerateRequest(
                        horizon_type="weekly",
                        horizon_start=today,
                        horizon_end=today + timedelta(days=6),
                    )
                    get_plan_service().generate_plan(seed_payload)
                    logger.info("Initial seed Plan 1 created successfully.")
        except Exception as plan_exc:
            logger.warning("Could not auto-generate initial seed plan: %s", plan_exc)

    except Exception as exc:
        logger.warning("Could not auto-create database tables on startup: %s", exc)
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the API application. ``settings`` is injectable for tests."""
    import os
    resolved = settings or get_settings()
    application = FastAPI(
        title=resolved.app_title,
        description=resolved.app_description,
        version=resolved.app_version,
        debug=resolved.debug,
        lifespan=lifespan,
    )
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    env_origins = os.getenv("CORS_ORIGINS") or os.getenv("ALLOWED_ORIGINS")
    if env_origins:
        cors_origins.extend([o.strip() for o in env_origins.split(",") if o.strip()])

    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    _register_exception_handlers(application)
    _register_system_routes(application, resolved)
    _register_routers(application)
    return application


def _register_exception_handlers(application: FastAPI) -> None:
    @application.exception_handler(ApiServiceError)
    async def service_error_handler(
        request: Request, exc: ApiServiceError
    ) -> JSONResponse:
        body = ErrorResponse(
            error=exc.error_code,
            message=exc.message,
            details=exc.details,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=body.model_dump(mode="json"),
        )



def _register_system_routes(application: FastAPI, settings: Settings) -> None:
    @application.get("/", response_model=RootResponse)
    def root() -> RootResponse:
        return RootResponse(
            service=settings.app_title,
            version=settings.app_version,
            environment=settings.environment,
            docs="/docs",
        )

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        """Process liveness only. Does not probe the database."""
        return HealthResponse(status="healthy")

    @application.get("/db-health")
    def db_health() -> dict:
        """Probe database connectivity and report safe diagnostic info."""
        import os
        import re
        from database.connection import DATABASE_URL, engine
        from sqlalchemy import text

        env_keys = [k for k in ["DATABASE_URL", "DATABASE_URI", "POSTGRES_URL", "DB_URL", "RENDER_DATABASE_URL"] if k in os.environ]
        masked = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", DATABASE_URL)

        try:
            with engine.connect() as conn:
                res = conn.execute(text("SELECT 1")).scalar()
                task_count = 0
                recent_plans = []
                try:
                    from database.models import MaintenanceTask, BlockPlan
                    from database.connection import SessionLocal
                    with SessionLocal() as s:
                        task_count = s.query(MaintenanceTask).count()
                        plans = s.query(BlockPlan.id, BlockPlan.status, BlockPlan.failure_reason).order_by(BlockPlan.id.desc()).limit(5).all()
                        recent_plans = [{"id": p[0], "status": p[1], "failure_reason": p[2]} for p in plans]
                except Exception as ex:
                    recent_plans = [{"error": str(ex)}]
                return {
                    "status": "connected",
                    "select_1": res,
                    "env_keys_present": env_keys,
                    "target": masked,
                    "task_count": task_count,
                    "recent_plans": recent_plans,
                }
        except Exception as exc:
            return {
                "status": "error",
                "error": str(exc),
                "env_keys_present": env_keys,
                "target": masked,
            }

    @application.get("/favicon.ico", include_in_schema=False)
    def favicon() -> Response:
        """Return 204 No Content for browser favicon requests to avoid 404 logs."""
        return Response(status_code=204)


def _register_routers(application: FastAPI) -> None:
    for router in get_routers():
        application.include_router(router)


app = create_app()
