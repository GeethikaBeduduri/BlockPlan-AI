from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from database.models import IngestionRun
from database.repositories import upsert_tasks, upsert_windows


def load_to_database(db: Session, tasks: list[dict], windows: list[dict]) -> dict[str, int]:
    result = {"tasks": 0, "windows": 0}

    for source in ("TMS", "SMMS", "TDMS"):
        source_tasks = [task for task in tasks if task["source_system"] == source]
        if not source_tasks:
            continue
        run = IngestionRun(source_system=source, records_read=len(source_tasks))
        db.add(run)
        db.commit()
        try:
            result["tasks"] += upsert_tasks(db, source_tasks)
            run.records_loaded = len(source_tasks)
            run.status = "SUCCESS"
        except Exception as exc:
            db.rollback()
            run.status = "FAILED"
            run.error_message = str(exc)[:1000]
            raise
        finally:
            run.finished_at = datetime.now(UTC)
            db.add(run)
            db.commit()

    if windows:
        run = IngestionRun(source_system="COA", records_read=len(windows))
        db.add(run)
        db.commit()
        try:
            result["windows"] = upsert_windows(db, windows)
            run.records_loaded = len(windows)
            run.status = "SUCCESS"
        except Exception as exc:
            db.rollback()
            run.status = "FAILED"
            run.error_message = str(exc)[:1000]
            raise
        finally:
            run.finished_at = datetime.now(UTC)
            db.add(run)
            db.commit()

    return result
