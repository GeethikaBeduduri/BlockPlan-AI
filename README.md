# BlockPlan-AI

## AI-Powered Automatic Block Planning (SIH26027)

A modular, production-ready intelligent railway block possession scheduling and planning platform. The system ingests maintenance requests across Track (TMS), Signal & Telecom (SMMS), Traction (TDMS), and Control Office Applications (COA), applies machine learning to score task criticality, uses mathematical optimization (OR-Tools CP-SAT) to co-schedule multi-department maintenance windows, and provides interactive review tools for railway section controllers.

---

## Repository Architecture

```
SIH26027/
├── backend/                  # FastAPI REST API, PostgreSQL/TimescaleDB Data Layer, ETL & Workers
│   ├── app/                  # REST API routers, Pydantic schemas, and service layer
│   ├── database/             # SQLAlchemy ORM models, connection management, migrations
│   ├── integrations/         # TMS, SMMS, TDMS, and COA ingestion adapters
│   ├── etl/                  # Ingestion extraction, transformation, and validation pipeline
│   ├── airflow/              # Scheduled orchestration DAGs
│   ├── scripts/              # Database utilities and sample generation
│   ├── data_samples/         # Ingestion CSV samples
│   ├── workers/              # Celery asynchronous background workers
│   ├── tests/                # Comprehensive unit, integration, and API test suites
│   ├── requirements.txt      # Backend Python dependencies
│   ├── pytest.ini            # Pytest configuration
│   └── README.md
├── frontend/                 # React 18 + Vite + TypeScript + TailwindCSS Web UI
│   ├── src/                  # Components, pages, hooks, state context, adapters
│   ├── package.json          # Frontend dependencies and scripts
│   ├── vite.config.ts        # Vite configuration and API proxy
│   └── README.md
├── ml/                       # Machine Learning Subsystem
│   ├── data/                 # Training and active task datasets
│   ├── criticality_scoring.py# XGBoost task criticality scoring pipeline
│   ├── dataset.py            # Synthetic dataset generator
│   ├── requirements.txt      # ML Python dependencies
│   └── README.md
├── optimization/             # Optimization Subsystem
│   ├── data/                 # Window availability and schedule output datasets
│   ├── schedule_generation.py# Google OR-Tools CP-SAT block schedule solver
│   ├── requirements.txt      # Optimization Python dependencies
│   └── README.md
├── analytics/                # Statistical Analytics Subsystem
│   ├── results/              # Analytics results JSON output
│   ├── analytics.py          # SciPy/Pandas statistical analytics suite
│   ├── requirements.txt      # Analytics Python dependencies
│   └── README.md
├── .gitignore                # Global git ignore configuration
├── README.md                 # Project root documentation
└── docker-compose.yml        # Multi-container local/production deployment
```

---

## Quick Start with Docker Compose

To launch all services (PostgreSQL/TimescaleDB, Redis, Backend API, Celery Worker, and Frontend UI):

```bash
docker-compose up --build
```

Access Points:
* **Frontend Web UI:** [http://localhost:5173](http://localhost:5173)
* **Backend API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)
* **API Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

---

## Local Development Setup

### 1. Backend & Data Layer
```bash
cd backend
pip install -r requirements.txt
pytest -v
uvicorn app.main:app --reload --port 8000
```

### 2. Celery Worker
```bash
cd backend
celery -A workers.celery_app.celery_app worker --loglevel=info
```

### 3. Frontend Web Application
```bash
cd frontend
npm install
npm run dev
```

### 4. Machine Learning Pipeline
```bash
cd ml
pip install -r requirements.txt
python criticality_scoring.py
```

### 5. Schedule Optimization Engine
```bash
cd optimization
pip install -r requirements.txt
python schedule_generation.py
```

### 6. Statistical Analytics Suite
```bash
cd analytics
pip install -r requirements.txt
python analytics.py
```
