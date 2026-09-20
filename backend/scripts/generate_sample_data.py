from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


DEPARTMENTS = {
    "TMS": ("Engineering", "TRACK_DEFECT"),
    "SMMS": ("S&T", "SIGNAL_DEFECT"),
    "TDMS": ("Traction", "OHE_DEFECT"),
}


def generate(output_dir: Path, tasks_per_source: int = 30, windows_count: int = 50, seed: int = 42) -> None:
    rng = np.random.default_rng(seed)
    output_dir.mkdir(parents=True, exist_ok=True)
    corridors = [f"COR_{i:02d}" for i in range(1, 11)]
    severities = ["A", "B", "C"]

    for source, (department, defect_type) in DEPARTMENTS.items():
        rows = []
        for i in range(1, tasks_per_source + 1):
            rows.append(
                {
                    "task_id": i,
                    "department": department,
                    "corridor_id": rng.choice(corridors),
                    "defect_severity": rng.choice(severities, p=[0.2, 0.3, 0.5]),
                    "days_overdue": int(rng.integers(0, 31)),
                    "estimated_hours": int(rng.integers(1, 8)),
                    "asset_age_years": int(rng.integers(1, 31)),
                    "asset_id": f"{source}-ASSET-{i:04d}",
                    "defect_type": defect_type,
                }
            )
        pd.DataFrame(rows).to_csv(output_dir / f"{source.lower()}_tasks.csv", index=False)

    rows = []
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i in range(1, windows_count + 1):
        hours = int(rng.integers(2, 9))
        start_hour = int(rng.choice([0, 1, 2, 22]))
        if start_hour == 22:
            start_hour = 1
        rows.append(
            {
                "window_id": i,
                "corridor_id": rng.choice(corridors),
                "day": rng.choice(days),
                "available_hours": hours,
                "start_hour": start_hour,
            }
        )
    pd.DataFrame(rows).to_csv(output_dir / "coa_windows.csv", index=False)

    print(f"Generated {tasks_per_source * 3} maintenance tasks and {windows_count} COA windows in {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("data_samples"))
    parser.add_argument("--tasks-per-source", type=int, default=30)
    parser.add_argument("--windows", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    generate(args.output, args.tasks_per_source, args.windows, args.seed)
