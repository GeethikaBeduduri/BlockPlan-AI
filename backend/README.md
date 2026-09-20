# Backend Subsystem (SIH26027)

This directory contains the core FastAPI application, PostgreSQL/TimescaleDB data layer, ETL pipelines, integration adapters, and Celery asynchronous background workers.

## Directory Structure

```
backend/
├── app/                       # FastAPI REST API, schemas, routers, and services
│   ├── config.py              # Application settings and environment variables
│   ├── dependencies.py        # Dependency injection providers
│   ├── main.py                # FastAPI ASGI application entrypoint
│   ├── routers/               # Endpoint controllers (tasks, windows, plan, kpis, overrides)
│   ├── schemas/               # Pydantic v2 domain schemas and request/response models
│   └── services/              # Business logic, SQL repositories, ML/Optimizer adapters
├── database/                  # PostgreSQL/TimescaleDB models and connection management
│   ├── connection.py          # SQLAlchemy engine and session factory
│   ├── models.py              # SQLAlchemy ORM declarative models
│   ├── migrations/            # SQL migration scripts (001_initial_schema.sql, etc.)
│   ├── repositories.py        # Task upsert & query database functions
│   └── plan_repositories.py   # Block plan & assignment persistence
├── integrations/              # Source system adapters
│   ├── tms/                   # Track Management System (TMS) adapter
│   ├── smms/                  # Signal & Telecom System (SMMS) adapter
│   ├── tdms/                  # Traction Distribution System (TDMS) adapter
│   ├── coa/                   # Control Office Application (COA) adapter
│   ├── common/                # Common ingestion models
│   └── validators.py          # Ingestion validation rules
├── etl/                       # Ingestion ETL pipeline
│   ├── extract.py             # CSV/API extractor
│   ├── transform.py           # Field normalization and domain mapping
│   ├── validate.py            # Record constraint validators
│   ├── load.py                # Database bulk loader
│   └── pipeline.py            # End-to-end orchestrated ETL runner
├── airflow/                   # Airflow DAGs for scheduled data sync
│   └── dags/
├── scripts/                   # Database seeding and utility scripts
│   └── generate_sample_data.py
├── data_samples/              # Deterministic CSV samples for TMS, SMMS, TDMS, COA
├── workers/                   # Celery asynchronous task workers
│   ├── celery_app.py          # Celery app instance configured with Redis broker
│   └── plan_tasks.py          # Asynchronous plan generation background task
├── tests/                     # Comprehensive test suite (Unit, Integration, API, DB)
│   ├── api/                   # Router and schema tests
│   ├── integration/           # End-to-end multi-layer integration tests
│   ├── unit/                  # Service and repository adapter unit tests
│   ├── test_database.py       # Database schema and model tests
│   ├── test_etl.py            # ETL pipeline tests
│   ├── test_integrations.py   # Integration adapter tests
│   ├── test_plan_repositories.py # Plan repository CRUD tests
│   └── conftest.py            # Global test fixtures (eager Celery mode)
├── requirements.txt           # Python backend dependencies
├── pytest.ini                 # Pytest configuration
└── README.md
```

## Local Development & Testing

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run tests:**
   ```bash
   pytest -v
   ```

3. **Start FastAPI development server:**
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **Start Celery worker:**
   ```bash
   celery -A workers.celery_app.celery_app worker --loglevel=info
   ```
