-- Core schema for the railway maintenance planning data layer.
-- Run this against PostgreSQL/TimescaleDB before loading data.

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    id BIGSERIAL PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL UNIQUE,
    source_system VARCHAR(16) NOT NULL,
    source_record_id VARCHAR(64) NOT NULL,
    department VARCHAR(32) NOT NULL,
    asset_id VARCHAR(64) NOT NULL,
    corridor_id VARCHAR(32) NOT NULL,
    defect_type VARCHAR(64) NOT NULL,
    defect_severity CHAR(1) NOT NULL CHECK (defect_severity IN ('A', 'B', 'C')),
    days_overdue INTEGER NOT NULL DEFAULT 0 CHECK (days_overdue >= 0),
    estimated_hours DOUBLE PRECISION NOT NULL CHECK (estimated_hours > 0),
    asset_age_years INTEGER NOT NULL DEFAULT 0 CHECK (asset_age_years >= 0),
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    criticality_score DOUBLE PRECISION,
    source_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_task_source_record UNIQUE (source_system, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_corridor ON maintenance_tasks(corridor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON maintenance_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON maintenance_tasks(source_system);

CREATE TABLE IF NOT EXISTS block_windows (
    id BIGSERIAL PRIMARY KEY,
    window_id VARCHAR(64) NOT NULL UNIQUE,
    source_system VARCHAR(16) NOT NULL DEFAULT 'COA',
    source_record_id VARCHAR(64) NOT NULL,
    corridor_id VARCHAR(32) NOT NULL,
    window_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    available_hours DOUBLE PRECISION NOT NULL CHECK (available_hours > 0),
    status VARCHAR(24) NOT NULL DEFAULT 'AVAILABLE',
    source_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_window_source_record UNIQUE (source_system, source_record_id),
    CONSTRAINT ck_window_time CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_windows_corridor_date ON block_windows(corridor_id, window_date);
CREATE INDEX IF NOT EXISTS idx_windows_status ON block_windows(status);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id BIGSERIAL PRIMARY KEY,
    source_system VARCHAR(16) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
    records_read INTEGER NOT NULL DEFAULT 0,
    records_loaded INTEGER NOT NULL DEFAULT 0,
    error_message VARCHAR(1000)
);
