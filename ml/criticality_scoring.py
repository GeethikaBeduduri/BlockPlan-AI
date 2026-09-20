import os
from pathlib import Path
import pandas as pd
from xgboost import XGBRegressor
import numpy as np

# 1. Load data
DATA_DIR = Path(__file__).resolve().parent / "data"

def _resolve_data_path(filename: str) -> Path:
    direct = Path(filename)
    if direct.is_file():
        return direct
    in_data = DATA_DIR / filename
    if in_data.is_file():
        return in_data
    return direct

historical = pd.read_csv(_resolve_data_path('historical_tasks.csv'))
current = pd.read_csv(_resolve_data_path('tasks.csv'))

# 2. Preprocessing
# Map defect severity to numeric to preserve ordinality
severity_map = {'A': 3, 'B': 2, 'C': 1}
historical['severity_numeric'] = historical['defect_severity'].map(severity_map)
current['severity_numeric'] = current['defect_severity'].map(severity_map)

# Feature list for the ML model
features = ['days_overdue', 'estimated_hours', 'asset_age_years', 'severity_numeric']

# Let's also include one-hot encoded departments
# Concatenate before dummy encoding to ensure columns match
all_data = pd.concat([historical, current], keys=['hist', 'curr'])
all_data = pd.get_dummies(all_data, columns=['department'], drop_first=True)

# Separate back to historical and current
historical_encoded = all_data.xs('hist')
current_encoded = all_data.xs('curr')

# Define full feature set (including department dummies)
dept_cols = [col for col in historical_encoded.columns if col.startswith('department_')]
feature_cols = features + dept_cols

X_train = historical_encoded[feature_cols]
y_train = historical_encoded['actual_risk_score']
X_predict = current_encoded[feature_cols]

# 3. Train XGBoost Regressor
print("Training XGBoost Regressor...")
model = XGBRegressor(n_estimators=100, learning_rate=0.08, max_depth=4, random_state=42)
model.fit(X_train, y_train)

# Save the trained model to a pickle file
import pickle
with open('model.pkl', 'wb') as f:
    pickle.dump(model, f)
print("Model saved to 'model.pkl'!")

# 4. Predict Risk Score for current active requests
current['predicted_risk'] = model.predict(X_predict)

# 5. Normalize predictions to 0-100 scale
min_val = current['predicted_risk'].min()
max_val = current['predicted_risk'].max()

if max_val - min_val > 0:
    current['criticality_score'] = (
        (current['predicted_risk'] - min_val) / (max_val - min_val) * 100
    ).round(2)
else:
    current['criticality_score'] = 50.0

# Sort from high criticality to low criticality
current = current.sort_values('criticality_score', ascending=False)

# Clean up temporary columns
current = current.drop(columns=['predicted_risk'])

# Save scored current tasks
output_csv = DATA_DIR / 'tasks_scored.csv' if DATA_DIR.exists() else Path('tasks_scored.csv')
current.to_csv(output_csv, index=False)

print("Scoring completed via XGBoost model!")
print("\nTop 10 High Priority Tasks:")
print(current[['task_id', 'department', 'corridor_id', 'defect_severity', 'days_overdue', 'criticality_score']].head(10))