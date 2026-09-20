from datetime import date

from integrations.coa.mapper import map_coa_record
from integrations.smms.mapper import map_smms_record
from integrations.tdms.mapper import map_tdms_record
from integrations.tms.mapper import map_tms_record
from integrations.validators import validate_task, validate_window


def sample_task():
    return {
        "task_id": 1,
        "corridor_id": "COR_01",
        "defect_severity": "A",
        "days_overdue": 5,
        "estimated_hours": 4,
        "asset_age_years": 10,
    }


def test_source_mappers_produce_unique_ids():
    assert map_tms_record(sample_task())["task_id"] == "TMS-1"
    assert map_smms_record(sample_task())["task_id"] == "SMMS-1"
    assert map_tdms_record(sample_task())["task_id"] == "TDMS-1"


def test_task_validation():
    record = map_tms_record(sample_task())
    validate_task(record)
    assert record["department"] == "Engineering"


def test_coa_mapping_and_validation():
    record = map_coa_record(
        {"window_id": 1, "corridor_id": "COR_01", "day": "Mon", "available_hours": 4, "start_hour": 1},
        base_date=date(2026, 8, 24),
    )
    validate_window(record)
    assert record["window_id"] == "COA-1"
    assert record["window_date"] == date(2026, 8, 24)
