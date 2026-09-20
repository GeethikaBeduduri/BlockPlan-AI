# Machine Learning Subsystem (SIH26027)

This directory contains the machine learning components for predictive risk scoring and task criticality prioritization.

## Directory Structure

```
ml/
├── data/
│   ├── historical_tasks.csv   # Historical maintenance task dataset with actual risk scores
│   ├── tasks.csv              # Active unassigned maintenance tasks
│   └── tasks_scored.csv       # Scored maintenance tasks output (0-100 criticality)
├── criticality_scoring.py     # XGBoost Regressor training and batch scoring pipeline
├── dataset.py                 # Synthetic dataset generator for reproducibility
├── requirements.txt           # Subsystem Python dependencies
└── README.md
```

## Setup & Execution

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Generate synthetic datasets (optional):**
   ```bash
   python dataset.py
   ```

3. **Train XGBoost model and score active tasks:**
   ```bash
   python criticality_scoring.py
   ```
   Outputs:
   - `model.pkl` — Serialized XGBoost regression model
   - `data/tasks_scored.csv` — Maintenance tasks augmented with `criticality_score` [0.0–100.0]
