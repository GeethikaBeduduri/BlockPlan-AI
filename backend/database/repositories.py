from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from database.models import BlockWindow, MaintenanceTask


def _upsert_by_source_record(db: Session, model, records: list[dict]) -> int:
    for record in records:
        existing = db.scalar(
            select(model).where(
                model.source_system == record["source_system"],
                model.source_record_id == record["source_record_id"],
            )
        )
        if existing is None:
            db.add(model(**record))
        else:
            for key, value in record.items():
                if key not in {"id", "created_at"}:
                    setattr(existing, key, value)
    db.commit()
    return len(records)


def upsert_tasks(db: Session, records: list[dict]) -> int:
    return _upsert_by_source_record(db, MaintenanceTask, records)


def upsert_windows(db: Session, records: list[dict]) -> int:
    return _upsert_by_source_record(db, BlockWindow, records)


def get_pending_tasks(db: Session, limit: int | None = None) -> list[MaintenanceTask]:
    statement = select(MaintenanceTask).where(MaintenanceTask.status == "PENDING").order_by(
        MaintenanceTask.criticality_score.desc().nullslast()
    )
    if limit:
        statement = statement.limit(limit)
    return list(db.scalars(statement).all())


def get_available_windows(db: Session, corridor_id: str | None = None) -> list[BlockWindow]:
    statement = select(BlockWindow).where(BlockWindow.status == "AVAILABLE").order_by(
        BlockWindow.window_date, BlockWindow.start_time
    )
    if corridor_id:
        statement = statement.where(BlockWindow.corridor_id == corridor_id)
    return list(db.scalars(statement).all())
