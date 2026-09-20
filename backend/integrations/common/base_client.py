from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import pandas as pd


class SourceClient(ABC):
    """Common contract for TMS, SMMS, TDMS and COA adapters."""

    source_system: str

    @abstractmethod
    def fetch_records(self) -> list[dict[str, Any]]:
        raise NotImplementedError


class CsvSourceClient(SourceClient):
    def __init__(self, csv_path: str | Path, source_system: str) -> None:
        self.csv_path = Path(csv_path)
        self.source_system = source_system

    def fetch_records(self) -> list[dict[str, Any]]:
        if not self.csv_path.exists():
            raise FileNotFoundError(f"Source file not found: {self.csv_path}")
        return pd.read_csv(self.csv_path).to_dict(orient="records")
