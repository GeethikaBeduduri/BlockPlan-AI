# Optimization Subsystem (SIH26027)

This directory contains the constraint programming and scheduling optimization engine for railway block possession planning.

## Directory Structure

```
optimization/
├── data/
│   ├── windows.csv            # Track possession availability windows by corridor
│   └── schedule.csv           # Generated block schedule assignments and metadata
├── schedule_generation.py     # Google OR-Tools CP-SAT scheduling optimizer
├── requirements.txt           # Subsystem Python dependencies
└── README.md
```

## Model Formulation

- **Solver Engine:** Google OR-Tools CP-SAT
- **Decision Variables:**
  - `x[task, window]`: Binary indicator if task is assigned to window
  - `y[window]`: Binary indicator if window has active maintenance
  - `d_active[department, window]`: Binary indicator for department presence in window
- **Constraints:**
  1. Task uniqueness (at most 1 window per task)
  2. Corridor alignment (task corridor must match window corridor)
  3. Window capacity (sum of task estimated hours <= window available hours)
- **Objective Function:**
  - Maximize sum of scheduled task criticality scores
  - Multi-department bundling bonus: extra reward for co-scheduling across S&T, Traction, and Engineering within the same block

## Setup & Execution

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Execute schedule optimization:**
   ```bash
   python schedule_generation.py
   ```
   Outputs:
   - `data/schedule.csv` — Comprehensive task assignment matrix
   - KPIs: Active blocks, bundled blocks, downtime saved (hours), and true track asset availability (%)
