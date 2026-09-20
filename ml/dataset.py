import pandas as pd
import numpy as np

# Set random seed for reproducibility
np.random.seed(42)

def generate_task_data(num_rows):
    df = pd.DataFrame({
        'task_id': range(1, num_rows + 1),
        'department': np.random.choice(['Engineering', 'Traction', 'S&T'], num_rows),
        'corridor_id': np.random.choice(['COR_01','COR_02','COR_03','COR_04','COR_05'], num_rows),
        'defect_severity': np.random.choice(['A', 'B', 'C'], num_rows, p=[0.2, 0.3, 0.5]),
        'days_overdue': np.random.randint(0, 30, num_rows),
        'estimated_hours': np.random.randint(1, 8, num_rows),
        'asset_age_years': np.random.randint(1, 30, num_rows),
    })
    return df

# 1. Historical Dataset (with target label for training)
historical_tasks = generate_task_data(1000)

# Simulate non-linear actual risk score target
severity_map = {'A': 100, 'B': 60, 'C': 30}
severity_numeric = historical_tasks['defect_severity'].map(severity_map)
noise = np.random.normal(0, 5, 1000)

# Formula with interactions + noise
raw_risk = (
    severity_numeric * 0.4 +
    historical_tasks['days_overdue'] * 1.2 +
    historical_tasks['asset_age_years'] * 0.2 +
    (severity_numeric * historical_tasks['days_overdue'] * 0.01) +
    noise
)
# Normalize to 0-100
historical_tasks['actual_risk_score'] = ((raw_risk - raw_risk.min()) / (raw_risk.max() - raw_risk.min()) * 100).round(2)

# Save historical data
historical_tasks.to_csv('historical_tasks.csv', index=False)

# 2. Current active tasks (no target label)
tasks = generate_task_data(100)
tasks.to_csv('tasks.csv', index=False)

# 3. Block Windows
windows = pd.DataFrame({
    'window_id': range(1, 51),
    'corridor_id': np.random.choice(['COR_01','COR_02','COR_03','COR_04','COR_05'], 50),
    'day': np.random.choice(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], 50),
    'available_hours': np.random.randint(2, 10, 50),
})
windows.to_csv('windows.csv', index=False)

print("Data ready! Generated 'historical_tasks.csv', 'tasks.csv', and 'windows.csv'.")