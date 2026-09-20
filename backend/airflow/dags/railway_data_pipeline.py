from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from airflow import DAG
from airflow.operators.python import PythonOperator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from etl.pipeline import run_pipeline


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/railway_planning",
)
DATA_DIR = Path(os.getenv("RAILWAY_DATA_DIR", "data_samples"))


def load_railway_data() -> None:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as db:
        result = run_pipeline(db, DATA_DIR)
        print(f"Railway ETL completed: {result}")


with DAG(
    dag_id="railway_maintenance_data_pipeline",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
    tags=["railway", "tms", "smms", "tdms", "coa", "etl"],
) as dag:
    load_data = PythonOperator(
        task_id="extract_transform_validate_load",
        python_callable=load_railway_data,
    )
