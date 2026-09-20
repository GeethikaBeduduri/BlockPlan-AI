-- Optional TimescaleDB enhancement.
-- Execute this only on a PostgreSQL instance with TimescaleDB installed.

CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT create_hypertable('ingestion_runs', 'started_at', if_not_exists => TRUE);
