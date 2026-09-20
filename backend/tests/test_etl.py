from datetime import date
from pathlib import Path

from etl.extract import extract_sources
from etl.transform import transform_sources
from etl.validate import validate_records


def test_extract_transform_validate(tmp_path: Path):
    from scripts.generate_sample_data import generate

    generate(tmp_path, tasks_per_source=5, windows_count=8, seed=7)
    raw = extract_sources(tmp_path)
    tasks, windows = transform_sources(raw, base_date=date(2026, 8, 24))
    validate_records(tasks, windows)

    assert len(tasks) == 15
    assert len(windows) == 8
    assert {task["source_system"] for task in tasks} == {"TMS", "SMMS", "TDMS"}
    assert {window["source_system"] for window in windows} == {"COA"}
