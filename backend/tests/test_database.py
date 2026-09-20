from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from database.models import Base, MaintenanceTask
from database.repositories import upsert_tasks


def test_task_repository_upsert():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    record = {
        "task_id": "TMS-1",
        "source_system": "TMS",
        "source_record_id": "1",
        "department": "Engineering",
        "asset_id": "TRK-1",
        "corridor_id": "COR_01",
        "defect_type": "TRACK_DEFECT",
        "defect_severity": "A",
        "days_overdue": 4,
        "estimated_hours": 3.0,
        "asset_age_years": 10,
    }

    with Session() as db:
        assert upsert_tasks(db, [record]) == 1
        assert upsert_tasks(db, [record | {"days_overdue": 7}]) == 1
        task = db.scalar(select(MaintenanceTask).where(MaintenanceTask.task_id == "TMS-1"))
        assert task.days_overdue == 7
