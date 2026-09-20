from __future__ import annotations

from datetime import date

from integrations.coa.mapper import map_coa_record
from integrations.smms.mapper import map_smms_record
from integrations.tdms.mapper import map_tdms_record
from integrations.tms.mapper import map_tms_record


def transform_sources(raw: dict[str, list[dict]], base_date: date | None = None) -> tuple[list[dict], list[dict]]:
    tasks = []
    windows = []

    for record in raw.get("TMS", []):
        tasks.append(map_tms_record(record))
    for record in raw.get("SMMS", []):
        tasks.append(map_smms_record(record))
    for record in raw.get("TDMS", []):
        tasks.append(map_tdms_record(record))
    for record in raw.get("COA", []):
        windows.append(map_coa_record(record, base_date=base_date))

    return tasks, windows
