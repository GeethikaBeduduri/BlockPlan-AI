# Statistical Analytics Subsystem (SIH26027)

This directory contains the numerical analysis and statistical inference suite for railway maintenance evaluation.

## Directory Structure

```
analytics/
├── results/
│   └── analytics_results.json # Serialized statistical test outputs and forecasting metrics
├── analytics.py               # Statistical analytics suite (SciPy, Pandas, NumPy)
├── requirements.txt           # Subsystem Python dependencies
└── README.md
```

## Statistical Capabilities

1. **Cross-Department Criticality Comparison:** Kruskal-Wallis non-parametric H-test and pairwise Mann-Whitney U tests.
2. **Urgency & Survival Analysis:** Kaplan-Meier survival estimation for days overdue vs. criticality escalation.
3. **Feature Correlation Matrix:** Spearman rank correlation with two-sided significance tests.
4. **Outlier & Anomaly Detection:** Multivariate Z-score filtering across task attributes.
5. **Maintenance Load Forecasting:** Exponential smoothing with trend drift.
6. **Schedule Efficiency Analysis:** Window capacity utilization and corridor bottleneck scoring.

## Setup & Execution

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run full analytics suite:**
   ```bash
   python analytics.py
   ```
   Outputs:
   - `results/analytics_results.json` — Comprehensive metrics payload
