"""Integration documentation marker for tests requiring external infrastructure.

The tests in this package are marked as integration tests and may require:
- A running Redis instance (for Celery tasks).
- A running PostgreSQL database (for repository implementations).
- Real ML scoring service (Group 1 implementation).
- Real optimizer service (Group 1 implementation).

To run only unit tests (no external services required):
    pytest tests/unit/ tests/api/ -v

To run all tests including integration:
    pytest -v  (requires services defined in docker-compose.yml to be running)

To run integration tests only:
    pytest tests/integration/ -v
"""
