from __future__ import annotations

from pathlib import Path

from integrations.coa.client import COAClient
from integrations.smms.client import SMMSClient
from integrations.tdms.client import TDMSClient
from integrations.tms.client import TMSClient


def extract_sources(data_dir: str | Path) -> dict[str, list[dict]]:
    data_dir = Path(data_dir)
    clients = {
        "TMS": TMSClient(data_dir / "tms_tasks.csv"),
        "SMMS": SMMSClient(data_dir / "smms_tasks.csv"),
        "TDMS": TDMSClient(data_dir / "tdms_tasks.csv"),
        "COA": COAClient(data_dir / "coa_windows.csv"),
    }
    return {source: client.fetch_records() for source, client in clients.items()}
