from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import logging
import re

logger = logging.getLogger(__name__)

def _resolve_database_url() -> str:
    env_url = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_URI")
        or os.getenv("POSTGRES_URL")
        or os.getenv("DB_URL")
        or os.getenv("RENDER_DATABASE_URL")
    )
    if env_url:
        if env_url.startswith("postgres://"):
            return env_url.replace("postgres://", "postgresql+psycopg://", 1)
        elif env_url.startswith("postgresql://") and not env_url.startswith("postgresql+psycopg://"):
            return env_url.replace("postgresql://", "postgresql+psycopg://", 1)
        return env_url

    # Check if local PostgreSQL is actually reachable
    import socket
    pg_host = os.getenv("POSTGRES_HOST", "localhost")
    pg_port = int(os.getenv("POSTGRES_PORT", "5432"))
    try:
        with socket.create_connection((pg_host, pg_port), timeout=0.5):
            return f"postgresql+psycopg://postgres:postgres@{pg_host}:{pg_port}/railway_planning"
    except (OSError, TimeoutError):
        pass

    # Fallback to local persistent SQLite file for out-of-the-box local development
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sqlite_path = os.path.join(backend_dir, "railway_block_planning.db").replace("\\", "/")
    logger.info("Local PostgreSQL not reachable on %s:%s; using SQLite fallback: %s", pg_host, pg_port, sqlite_path)
    return f"sqlite:///{sqlite_path}"


DATABASE_URL = _resolve_database_url()

# Mask password for logging
_masked = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", DATABASE_URL)
logger.info("Configured database target: %s", _masked)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    from database.models import Base

    Base.metadata.create_all(bind=engine)