from __future__ import annotations

from datetime import date
from pathlib import Path

from database.connection import SessionLocal
from sqlalchemy.orm import Session

from etl.extract import extract_sources
from etl.load import load_to_database
from etl.transform import transform_sources
from etl.validate import validate_records


def run_pipeline(
    db: Session,
    data_dir: str | Path,
    base_date: date | None = None,
) -> dict[str, int]:
    raw = extract_sources(data_dir)
    tasks, windows = transform_sources(raw, base_date=base_date)
    validate_records(tasks, windows)
    return load_to_database(db, tasks, windows)


def main() -> None:
    backend_dir = Path(__file__).resolve().parent.parent
    data_dir = backend_dir / "data_samples"
    if not data_dir.exists():
        data_dir = backend_dir / "data" / "samples"

    db = SessionLocal()
    try:
        result = run_pipeline(db, data_dir)
        print("ETL pipeline completed successfully.")
        print(f"Tasks loaded: {result['tasks']}")
        print(f"Block windows loaded: {result['windows']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()