"""
Statistical Analytics & Advanced Numerical Computations for Railway Maintenance.

Provides deep statistical analysis of maintenance data using SciPy, NumPy, and Pandas:
- Cross-department criticality comparison (Kruskal-Wallis test)
- Survival analysis for task urgency
- Feature correlation analysis (Spearman)
- Anomaly detection (Z-score based)
- Maintenance load forecasting (exponential smoothing)
- Schedule efficiency analysis

Tech: SciPy, NumPy, Pandas
"""

import pandas as pd
import numpy as np
from scipy import stats
from scipy.signal import savgol_filter
import warnings
import os
import json

warnings.filterwarnings('ignore')

# ---------------------------------------------------------------------------
# 1. Cross-Department Criticality Analysis
# ---------------------------------------------------------------------------
def department_criticality_analysis(tasks_df):
    """
    Kruskal-Wallis H-test: Are criticality score distributions
    significantly different across departments?
    Also computes per-department descriptive statistics.
    """
    departments = tasks_df['department'].unique()
    groups = [tasks_df[tasks_df['department'] == d]['criticality_score'].values
              for d in departments]

    # Filter out empty groups
    groups = [g for g in groups if len(g) > 0]

    result = {
        'test_name': 'Kruskal-Wallis H-test',
        'hypothesis': 'Criticality distributions differ across departments',
        'department_stats': {}
    }

    if len(groups) >= 2:
        h_stat, p_value = stats.kruskal(*groups)
        result['h_statistic'] = round(float(h_stat), 4)
        result['p_value'] = round(float(p_value), 6)
        result['significant_at_005'] = bool(p_value < 0.05)
        result['interpretation'] = (
            "Significant difference exists between department criticality distributions."
            if p_value < 0.05
            else "No significant difference between department criticality distributions."
        )

    for dept in departments:
        dept_data = tasks_df[tasks_df['department'] == dept]['criticality_score']
        result['department_stats'][dept] = {
            'count': int(len(dept_data)),
            'mean': round(float(dept_data.mean()), 2),
            'median': round(float(dept_data.median()), 2),
            'std': round(float(dept_data.std()), 2),
            'min': round(float(dept_data.min()), 2),
            'max': round(float(dept_data.max()), 2),
            'q25': round(float(dept_data.quantile(0.25)), 2),
            'q75': round(float(dept_data.quantile(0.75)), 2),
            'iqr': round(float(dept_data.quantile(0.75) - dept_data.quantile(0.25)), 2),
            'skewness': round(float(dept_data.skew()), 4),
            'kurtosis': round(float(dept_data.kurtosis()), 4),
        }

    # Pairwise Mann-Whitney U tests
    if len(departments) >= 2:
        pairwise = []
        for i in range(len(departments)):
            for j in range(i + 1, len(departments)):
                d1 = tasks_df[tasks_df['department'] == departments[i]]['criticality_score']
                d2 = tasks_df[tasks_df['department'] == departments[j]]['criticality_score']
                if len(d1) > 0 and len(d2) > 0:
                    u_stat, p_val = stats.mannwhitneyu(d1, d2, alternative='two-sided')
                    pairwise.append({
                        'department_1': departments[i],
                        'department_2': departments[j],
                        'u_statistic': round(float(u_stat), 2),
                        'p_value': round(float(p_val), 6),
                        'significant': bool(p_val < 0.05)
                    })
        result['pairwise_tests'] = pairwise

    return result


# ---------------------------------------------------------------------------
# 2. Survival / Urgency Analysis
# ---------------------------------------------------------------------------
def urgency_survival_analysis(tasks_df):
    """
    Kaplan-Meier-style estimation: How quickly do tasks become critical
    as days_overdue increases?

    We estimate the probability of a task remaining non-critical
    at each overdue day threshold.
    """
    # Define "critical" as criticality_score >= 70
    critical_threshold = 70.0

    # Sort by days_overdue
    sorted_tasks = tasks_df.sort_values('days_overdue').copy()
    sorted_tasks['is_critical'] = sorted_tasks['criticality_score'] >= critical_threshold

    # Group by days_overdue
    day_groups = sorted_tasks.groupby('days_overdue').agg(
        total=('task_id', 'count'),
        critical=('is_critical', 'sum')
    ).reset_index()

    # Kaplan-Meier-style survival curve
    survival_curve = []
    at_risk = len(sorted_tasks)
    survival_prob = 1.0

    for _, row in day_groups.iterrows():
        events = int(row['critical'])
        if at_risk > 0:
            hazard = events / at_risk
            survival_prob *= (1 - hazard)
        at_risk -= int(row['total'])

        survival_curve.append({
            'days_overdue': int(row['days_overdue']),
            'survival_probability': round(survival_prob, 4),
            'critical_at_this_day': events,
            'remaining_at_risk': max(at_risk, 0)
        })

    # Median survival time (days until 50% become critical)
    median_survival = None
    for point in survival_curve:
        if point['survival_probability'] <= 0.5:
            median_survival = point['days_overdue']
            break

    # Severity-stratified analysis
    severity_analysis = {}
    for sev in ['A', 'B', 'C']:
        sev_data = tasks_df[tasks_df['defect_severity'] == sev]
        if len(sev_data) > 0:
            severity_analysis[sev] = {
                'count': int(len(sev_data)),
                'avg_days_overdue': round(float(sev_data['days_overdue'].mean()), 1),
                'avg_criticality': round(float(sev_data['criticality_score'].mean()), 2),
                'pct_critical': round(float(
                    (sev_data['criticality_score'] >= critical_threshold).sum() / len(sev_data) * 100
                ), 1)
            }

    return {
        'critical_threshold': critical_threshold,
        'survival_curve': survival_curve,
        'median_survival_days': median_survival,
        'severity_breakdown': severity_analysis
    }


# ---------------------------------------------------------------------------
# 3. Feature Correlation Analysis
# ---------------------------------------------------------------------------
def feature_correlation_analysis(tasks_df):
    """
    Spearman rank correlation between all numeric features.
    Identifies which features most strongly predict criticality.
    """
    # Map severity to numeric
    severity_map = {'A': 3, 'B': 2, 'C': 1}
    df = tasks_df.copy()
    df['severity_numeric'] = df['defect_severity'].map(severity_map)

    numeric_cols = ['days_overdue', 'estimated_hours', 'asset_age_years',
                    'severity_numeric', 'criticality_score']
    available_cols = [c for c in numeric_cols if c in df.columns]

    if len(available_cols) < 2:
        return {'error': 'Insufficient numeric columns for correlation analysis'}

    # Spearman correlation matrix
    corr_matrix = df[available_cols].corr(method='spearman')

    # Convert to serializable format
    correlation_matrix = {}
    for col in available_cols:
        correlation_matrix[col] = {
            c: round(float(corr_matrix.loc[col, c]), 4)
            for c in available_cols
        }

    # Top correlates with criticality_score
    if 'criticality_score' in available_cols:
        criticality_corrs = corr_matrix['criticality_score'].drop('criticality_score')
        top_correlates = [
            {
                'feature': feat,
                'correlation': round(float(corr_val), 4),
                'strength': (
                    'Strong' if abs(corr_val) > 0.7
                    else 'Moderate' if abs(corr_val) > 0.4
                    else 'Weak'
                ),
                'direction': 'Positive' if corr_val > 0 else 'Negative'
            }
            for feat, corr_val in criticality_corrs.sort_values(
                key=abs, ascending=False
            ).items()
        ]
    else:
        top_correlates = []

    # Statistical significance of correlations
    significance_tests = []
    for i, col1 in enumerate(available_cols):
        for col2 in available_cols[i + 1:]:
            corr_val, p_val = stats.spearmanr(
                df[col1].dropna(), df[col2].dropna()
            )
            significance_tests.append({
                'feature_1': col1,
                'feature_2': col2,
                'correlation': round(float(corr_val), 4),
                'p_value': round(float(p_val), 6),
                'significant': bool(p_val < 0.05)
            })

    return {
        'method': 'Spearman Rank Correlation',
        'correlation_matrix': correlation_matrix,
        'top_criticality_correlates': top_correlates,
        'significance_tests': significance_tests
    }


# ---------------------------------------------------------------------------
# 4. Anomaly Detection
# ---------------------------------------------------------------------------
def anomaly_detection(tasks_df, z_threshold=2.5):
    """
    Z-score based outlier detection for task attributes.
    Tasks with extreme values in any feature are flagged as anomalies.
    """
    df = tasks_df.copy()
    severity_map = {'A': 3, 'B': 2, 'C': 1}
    df['severity_numeric'] = df['defect_severity'].map(severity_map)

    features = ['days_overdue', 'estimated_hours', 'asset_age_years',
                'criticality_score', 'severity_numeric']
    available = [f for f in features if f in df.columns]

    anomalies = []
    feature_stats = {}

    for feat in available:
        col = df[feat].dropna()
        if len(col) == 0:
            continue

        z_scores = np.abs(stats.zscore(col))
        outlier_mask = z_scores > z_threshold
        outlier_indices = col.index[outlier_mask].tolist()

        feature_stats[feat] = {
            'mean': round(float(col.mean()), 2),
            'std': round(float(col.std()), 2),
            'z_threshold': z_threshold,
            'num_outliers': int(outlier_mask.sum()),
            'outlier_pct': round(float(outlier_mask.sum() / len(col) * 100), 1)
        }

        for idx in outlier_indices:
            anomalies.append({
                'task_id': int(df.loc[idx, 'task_id']),
                'anomaly_feature': feat,
                'value': round(float(df.loc[idx, feat]), 2),
                'z_score': round(float(z_scores[col.index.get_loc(idx)]), 2),
                'department': df.loc[idx, 'department'],
                'corridor_id': df.loc[idx, 'corridor_id'],
                'defect_severity': df.loc[idx, 'defect_severity'],
            })

    # Multi-variate anomaly: tasks that are outliers in 2+ features
    if anomalies:
        task_anomaly_counts = {}
        for a in anomalies:
            tid = a['task_id']
            task_anomaly_counts[tid] = task_anomaly_counts.get(tid, 0) + 1

        multi_anomalies = [
            {'task_id': tid, 'num_anomalous_features': count}
            for tid, count in task_anomaly_counts.items()
            if count >= 2
        ]
    else:
        multi_anomalies = []

    return {
        'z_threshold': z_threshold,
        'total_tasks_analyzed': len(df),
        'total_anomalies_detected': len(anomalies),
        'feature_stats': feature_stats,
        'anomalous_tasks': anomalies,
        'multi_feature_anomalies': sorted(
            multi_anomalies,
            key=lambda x: x['num_anomalous_features'],
            reverse=True
        )
    }


# ---------------------------------------------------------------------------
# 5. Maintenance Load Forecasting
# ---------------------------------------------------------------------------
def maintenance_load_forecast(historical_df, forecast_periods=7):
    """
    Simple Exponential Smoothing to forecast daily maintenance load.
    Simulates a time series from historical data.
    """
    # Simulate daily task arrivals from historical data
    np.random.seed(42)
    num_days = 30
    daily_load = []
    for day in range(num_days):
        # Simulate: on average, tasks arrive proportional to severity distribution
        num_tasks = np.random.poisson(lam=historical_df.shape[0] / num_days)
        sampled = historical_df.sample(n=min(num_tasks, len(historical_df)), replace=True)
        daily_hours = sampled['estimated_hours'].sum()
        daily_load.append({
            'day': day + 1,
            'task_count': int(num_tasks),
            'total_hours': float(daily_hours),
            'avg_severity': round(float(
                sampled['defect_severity'].map({'A': 3, 'B': 2, 'C': 1}).mean()
            ), 2) if len(sampled) > 0 else 0
        })

    # Extract hours time series
    hours_series = np.array([d['total_hours'] for d in daily_load])

    # Simple Exponential Smoothing
    alpha = 0.3  # smoothing factor
    smoothed = np.zeros(len(hours_series))
    smoothed[0] = hours_series[0]
    for i in range(1, len(hours_series)):
        smoothed[i] = alpha * hours_series[i] + (1 - alpha) * smoothed[i - 1]

    # Forecast next periods
    forecast = []
    last_smoothed = smoothed[-1]
    for i in range(forecast_periods):
        # Drift adjustment
        if len(smoothed) > 1:
            trend = np.mean(np.diff(smoothed[-5:]))
        else:
            trend = 0
        predicted = last_smoothed + trend * (i + 1)
        forecast.append({
            'day': num_days + i + 1,
            'predicted_hours': round(max(float(predicted), 0), 1),
            'confidence_lower': round(max(float(predicted * 0.7), 0), 1),
            'confidence_upper': round(float(predicted * 1.3), 1),
        })

    return {
        'method': 'Simple Exponential Smoothing with Trend',
        'smoothing_alpha': alpha,
        'historical_days': num_days,
        'forecast_periods': forecast_periods,
        'daily_history': daily_load,
        'smoothed_values': [round(float(s), 1) for s in smoothed],
        'forecast': forecast,
        'trend_direction': 'Increasing' if forecast[-1]['predicted_hours'] > smoothed[-1] else 'Decreasing',
        'avg_daily_load': round(float(hours_series.mean()), 1)
    }


# ---------------------------------------------------------------------------
# 6. Schedule Efficiency Analysis
# ---------------------------------------------------------------------------
def schedule_efficiency_analysis(schedule_df, windows_df):
    """
    Analyze the efficiency of the generated schedule.
    """
    scheduled = schedule_df[schedule_df['day'] != 'UNSCHEDULED']
    unscheduled = schedule_df[schedule_df['day'] == 'UNSCHEDULED']

    # Window utilization
    window_usage = {}
    for _, row in scheduled.iterrows():
        wid = row['window_id']
        if pd.notna(wid):
            wid = int(wid)
            if wid not in window_usage:
                window_usage[wid] = {'hours_used': 0, 'task_count': 0, 'departments': set()}
            window_usage[wid]['hours_used'] += row['estimated_hours']
            window_usage[wid]['task_count'] += 1
            window_usage[wid]['departments'].add(row['department'])

    utilization_rates = []
    for w_idx, w_row in windows_df.iterrows():
        wid = int(w_row['window_id'])
        available = w_row['available_hours']
        usage = window_usage.get(wid, {'hours_used': 0, 'task_count': 0, 'departments': set()})
        util = usage['hours_used'] / available * 100 if available > 0 else 0

        utilization_rates.append({
            'window_id': wid,
            'corridor_id': w_row['corridor_id'],
            'day': w_row['day'],
            'available_hours': int(available),
            'used_hours': int(usage['hours_used']),
            'utilization_pct': round(util, 1),
            'num_tasks': usage['task_count'],
            'num_departments': len(usage['departments']),
            'is_bundled': len(usage['departments']) > 1
        })

    # Corridor-level summary
    corridor_summary = {}
    for _, row in schedule_df.iterrows():
        cor = row['corridor_id']
        if cor not in corridor_summary:
            corridor_summary[cor] = {
                'total': 0, 'scheduled': 0, 'unscheduled': 0,
                'avg_criticality': [], 'severity_a': 0
            }
        corridor_summary[cor]['total'] += 1
        corridor_summary[cor]['avg_criticality'].append(row['criticality_score'])
        if row['day'] != 'UNSCHEDULED':
            corridor_summary[cor]['scheduled'] += 1
        else:
            corridor_summary[cor]['unscheduled'] += 1
        if row['defect_severity'] == 'A':
            corridor_summary[cor]['severity_a'] += 1

    for cor in corridor_summary:
        crits = corridor_summary[cor]['avg_criticality']
        corridor_summary[cor]['avg_criticality'] = round(np.mean(crits), 2)
        corridor_summary[cor]['scheduling_rate'] = round(
            corridor_summary[cor]['scheduled'] / corridor_summary[cor]['total'] * 100, 1
        )

    # Overall efficiency metrics
    avg_util = np.mean([u['utilization_pct'] for u in utilization_rates
                        if u['used_hours'] > 0])
    total_available = sum(u['available_hours'] for u in utilization_rates)
    total_used = sum(u['used_hours'] for u in utilization_rates)

    return {
        'total_tasks': len(schedule_df),
        'scheduled_count': len(scheduled),
        'unscheduled_count': len(unscheduled),
        'scheduling_rate_pct': round(len(scheduled) / len(schedule_df) * 100, 1),
        'avg_window_utilization_pct': round(float(avg_util), 1) if not np.isnan(avg_util) else 0,
        'total_window_hours_available': int(total_available),
        'total_window_hours_used': int(total_used),
        'overall_capacity_utilization_pct': round(total_used / total_available * 100, 1) if total_available > 0 else 0,
        'window_utilization': sorted(utilization_rates,
                                     key=lambda x: x['utilization_pct'], reverse=True),
        'corridor_summary': corridor_summary
    }


# ---------------------------------------------------------------------------
# Full Analytics Runner
# ---------------------------------------------------------------------------
def _resolve_analytics_path(filename: str) -> str | None:
    from pathlib import Path
    direct = Path(filename)
    if direct.is_file():
        return str(direct)
    # Check subsystem folders
    base_dir = Path(__file__).resolve().parent
    candidates = [
        base_dir / filename,
        base_dir.parent / "ml" / "data" / filename,
        base_dir.parent / "optimization" / "data" / filename,
    ]
    for c in candidates:
        if c.is_file():
            return str(c)
    return None

def run_full_analytics():
    """Run all analytics and return combined results."""
    print("Running Statistical Analytics Suite...")

    results = {}

    # Load data
    tasks_scored_path = _resolve_analytics_path('tasks_scored.csv')
    tasks_path = _resolve_analytics_path('tasks.csv')
    historical_path = _resolve_analytics_path('historical_tasks.csv')
    schedule_path = _resolve_analytics_path('schedule.csv')
    windows_path = _resolve_analytics_path('windows.csv')

    if tasks_scored_path:
        tasks = pd.read_csv(tasks_scored_path)
    elif tasks_path:
        tasks = pd.read_csv(tasks_path)
        tasks['criticality_score'] = 50.0  # default if not scored
    else:
        return {'error': 'No task data found'}

    if historical_path:
        historical = pd.read_csv(historical_path)
    else:
        historical = None

    if schedule_path:
        schedule = pd.read_csv(schedule_path)
    else:
        schedule = None

    if windows_path:
        windows = pd.read_csv(windows_path)
    else:
        windows = None

    # 1. Department criticality analysis
    print("  [1/6] Department criticality analysis...")
    results['department_analysis'] = department_criticality_analysis(tasks)

    # 2. Urgency survival analysis
    print("  [2/6] Urgency survival analysis...")
    results['urgency_analysis'] = urgency_survival_analysis(tasks)

    # 3. Feature correlation
    print("  [3/6] Feature correlation analysis...")
    results['correlation_analysis'] = feature_correlation_analysis(tasks)

    # 4. Anomaly detection
    print("  [4/6] Anomaly detection...")
    results['anomaly_detection'] = anomaly_detection(tasks)

    # 5. Maintenance load forecasting
    if historical is not None:
        print("  [5/6] Maintenance load forecasting...")
        results['load_forecast'] = maintenance_load_forecast(historical)
    else:
        results['load_forecast'] = {'note': 'Historical data not available for forecasting'}

    # 6. Schedule efficiency
    if schedule is not None and windows is not None:
        print("  [6/6] Schedule efficiency analysis...")
        results['schedule_efficiency'] = schedule_efficiency_analysis(schedule, windows)
    else:
        results['schedule_efficiency'] = {'note': 'Schedule or windows data not available'}

    print("\n--- Analytics Summary ---")
    dept_analysis = results['department_analysis']
    if 'p_value' in dept_analysis:
        print(f"Department Criticality H-test p-value: {dept_analysis['p_value']}")
        print(f"  -> {dept_analysis['interpretation']}")

    urgency = results['urgency_analysis']
    if urgency['median_survival_days'] is not None:
        print(f"Median Days Until Critical: {urgency['median_survival_days']}")

    anomalies = results['anomaly_detection']
    print(f"Anomalies Detected: {anomalies['total_anomalies_detected']}")

    if 'schedule_efficiency' in results and 'scheduling_rate_pct' in results['schedule_efficiency']:
        eff = results['schedule_efficiency']
        print(f"Scheduling Rate: {eff['scheduling_rate_pct']}%")
        print(f"Avg Window Utilization: {eff['avg_window_utilization_pct']}%")

    return results


if __name__ == "__main__":
    from pathlib import Path
    results = run_full_analytics()
    # Save to JSON
    results_dir = Path(__file__).resolve().parent / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    out_file = results_dir / 'analytics_results.json'
    with open(out_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nFull analytics saved to '{out_file}'")
