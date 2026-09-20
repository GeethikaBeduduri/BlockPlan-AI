from pathlib import Path

from integrations.common.base_client import CsvSourceClient


class TDMSClient(CsvSourceClient):
    def __init__(self, csv_path: str | Path) -> None:
        super().__init__(csv_path, "TDMS")
