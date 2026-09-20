import os
from pathlib import Path
import pandas as pd
from ortools.sat.python import cp_model
import numpy as np

DATA_DIR = Path(__file__).resolve().parent / "data"
ML_DATA_DIR = Path(__file__).resolve().parent.parent / "ml" / "data"

def _resolve_data_path(filename: str) -> Path:
    direct = Path(filename)
    if direct.is_file():
        return direct
    in_opt_data = DATA_DIR / filename
    if in_opt_data.is_file():
        return in_opt_data
    in_ml_data = ML_DATA_DIR / filename
    if in_ml_data.is_file():
        return in_ml_data
    return direct

def solve_schedule(tasks_file='tasks_scored.csv', windows_file='windows.csv',
                   output_file='schedule.csv'):
    """
    Run CP-SAT block schedule optimization.

    Can be called as a function from other modules or run as a script.
    Returns (schedule_df, kpis_dict).
    """
    # 1. Load data
    tasks = pd.read_csv(_resolve_data_path(tasks_file))
    windows = pd.read_csv(_resolve_data_path(windows_file))

    # Pre-convert dataframes to dicts/lists for fast access
    tasks_list = tasks.to_dict('records')
    windows_list = windows.to_dict('records')

    # Define departments
    departments = ['Engineering', 'Traction', 'S&T']

    # 2. Build CP-SAT Model
    model = cp_model.CpModel()

    # Decision variables: x[t_idx, w_idx] = 1 if task t is assigned to window w
    x = {}
    # Active window variables: y[w_idx] = 1 if window w is used by any task
    y = {}
    # Department window variables: d_active[dept, w_idx] = 1 if dept has tasks in window w
    d_active = {}

    for w_idx, w in enumerate(windows_list):
        y[w_idx] = model.NewBoolVar(f'window_active_{w_idx}')
        for dept in departments:
            d_active[(dept, w_idx)] = model.NewBoolVar(f'dept_active_{dept}_{w_idx}')

    for t_idx, t in enumerate(tasks_list):
        for w_idx, w in enumerate(windows_list):
            # We can only assign a task to a window on the SAME corridor
            if t['corridor_id'] == w['corridor_id']:
                x[(t_idx, w_idx)] = model.NewBoolVar(f'assign_task_{t_idx}_to_window_{w_idx}')

    # Constraints:
    # 1. Each task assigned to at most one window
    for t_idx in range(len(tasks_list)):
        assigned_vars = [x[(t_idx, w_idx)] for w_idx, w in enumerate(windows_list) if (t_idx, w_idx) in x]
        model.AddAtMostOne(assigned_vars)

    # 2. Capacity constraint for each window (hours used <= available hours)
    for w_idx, w in enumerate(windows_list):
        window_tasks = [x[(t_idx, w_idx)] * int(t['estimated_hours']) 
                        for t_idx, t in enumerate(tasks_list) if (t_idx, w_idx) in x]
        model.Add(sum(window_tasks) <= w['available_hours'])

    # 3. Link y[w_idx] with x[t_idx, w_idx]
    for w_idx, w in enumerate(windows_list):
        window_assigns = [x[(t_idx, w_idx)] for t_idx in range(len(tasks_list)) if (t_idx, w_idx) in x]
        if window_assigns:
            # If any task is assigned to w, y[w] must be 1.
            for var in window_assigns:
                model.Add(y[w_idx] >= var)
            # y[w] is 0 if no task is assigned.
            model.Add(y[w_idx] <= sum(window_assigns))
        else:
            model.Add(y[w_idx] == 0)

    # 4. Link d_active[(dept, w_idx)] to tasks of that department
    for w_idx, w in enumerate(windows_list):
        for dept in departments:
            dept_assigns = [x[(t_idx, w_idx)] for t_idx, t in enumerate(tasks_list) 
                            if (t_idx, w_idx) in x and t['department'] == dept]
            if dept_assigns:
                for var in dept_assigns:
                    model.Add(d_active[(dept, w_idx)] >= var)
                model.Add(d_active[(dept, w_idx)] <= sum(dept_assigns))
            else:
                model.Add(d_active[(dept, w_idx)] == 0)

    # Objective Function:
    # Maximize task criticality + Bonus for multi-department bundling (co-scheduling)
    # We want to encourage grouping S&T, Traction, and Engineering.
    # Bonus for bundling = 30 per additional department working in the same window.
    task_objective = []
    for (t_idx, w_idx), var in x.items():
        # Weight by criticality score (converted to int/scaled since CP-SAT uses integer arithmetic)
        criticality_int = int(round(tasks_list[t_idx]['criticality_score'] * 10))
        task_objective.append(var * criticality_int)

    bundling_objective = []
    for w_idx in range(len(windows_list)):
        # Sum of active departments in this window minus whether the window is active at all.
        # E.g., if 1 dept is active, sum(d_active) - y = 1 - 1 = 0 (no bundling bonus)
        # If 2 depts are active, 2 - 1 = 1 (bonus given once)
        # If 3 depts are active, 3 - 1 = 2 (bonus given twice)
        dept_sum = sum(d_active[(dept, w_idx)] for dept in departments)
        bundling_objective.append((dept_sum - y[w_idx]) * 300) # Scaled by 10 to match criticality_int

    model.Maximize(sum(task_objective) + sum(bundling_objective))

    # 3. Solve the Model
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0 # Hackathon speed
    status = solver.Solve(model)

    # 4. Extract Schedule
    schedule = []
    scheduled_windows_meta = {}

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("Optimization successful!")
        
        # Track details about each window to see if it ended up being bundled
        for w_idx, w in enumerate(windows_list):
            active_depts = []
            for dept in departments:
                if solver.Value(d_active[(dept, w_idx)]) == 1:
                    active_depts.append(dept)
            scheduled_windows_meta[w['window_id']] = {
                'active_departments': active_depts,
                'is_bundled': len(active_depts) > 1,
                'remaining_hours': w['available_hours'] - sum(
                    tasks_list[t_idx]['estimated_hours']
                    for t_idx, t in enumerate(tasks_list)
                    if (t_idx, w_idx) in x and solver.Value(x[(t_idx, w_idx)]) == 1
                )
            }

        for t_idx, t in enumerate(tasks_list):
            assigned = False
            for w_idx, w in enumerate(windows_list):
                if (t_idx, w_idx) in x and solver.Value(x[(t_idx, w_idx)]) == 1:
                    schedule.append({
                        'task_id': t['task_id'],
                        'department': t['department'],
                        'corridor_id': t['corridor_id'],
                        'day': w['day'],
                        'window_id': w['window_id'],
                        'estimated_hours': t['estimated_hours'],
                        'criticality_score': t['criticality_score'],
                        'defect_severity': t['defect_severity'],
                        'is_bundled': scheduled_windows_meta[w['window_id']]['is_bundled'],
                        'bundled_with': ",".join([d for d in scheduled_windows_meta[w['window_id']]['active_departments'] if d != t['department']])
                    })
                    assigned = True
                    break
            if not assigned:
                schedule.append({
                    'task_id': t['task_id'],
                    'department': t['department'],
                    'corridor_id': t['corridor_id'],
                    'day': 'UNSCHEDULED',
                    'window_id': None,
                    'estimated_hours': t['estimated_hours'],
                    'criticality_score': t['criticality_score'],
                    'defect_severity': t['defect_severity'],
                    'is_bundled': False,
                    'bundled_with': ""
                })
    else:
        print("Optimization failed to find a solution.")

    schedule_df = pd.DataFrame(schedule)
    schedule_df.to_csv(output_file, index=False)

    # 5. Calculate KPIs
    total = len(schedule_df)
    scheduled_count = len(schedule_df[schedule_df['day'] != 'UNSCHEDULED'])
    critical_unscheduled = len(schedule_df[
        (schedule_df['day'] == 'UNSCHEDULED') &
        (schedule_df['defect_severity'] == 'A')
    ])

    # Bundling Metrics
    total_active_windows = sum(1 for meta in scheduled_windows_meta.values() if len(meta['active_departments']) > 0)
    bundled_windows = sum(1 for meta in scheduled_windows_meta.values() if meta['is_bundled'])

    # Asset Availability Calculation
    # Let's say each of the 5 corridors runs 24 hours a day for 7 days (Total capacity = 5 * 24 * 7 = 840 hours)
    total_corridor_hours = 5 * 24 * 7

    # Each block scheduled incurs 1.5 hours of setup/restoration overhead.
    block_overhead = 1.5

    # Actual hours spent on maintenance
    maintenance_hours = sum(
        w['available_hours'] - meta['remaining_hours']
        for w_idx, w in enumerate(windows_list)
        for meta in [scheduled_windows_meta.get(w['window_id'])]
        if meta and len(meta['active_departments']) > 0
    )

    # Total block downtime = maintenance hours + setup overhead for each scheduled block
    total_active_windows = sum(1 for meta in scheduled_windows_meta.values() if len(meta['active_departments']) > 0)
    total_block_hours = maintenance_hours + (total_active_windows * block_overhead)

    # If tasks were scheduled in separate, unbundled blocks:
    unbundled_blocks_needed = scheduled_count
    unbundled_downtime = maintenance_hours + (unbundled_blocks_needed * block_overhead)

    # Hours saved by bundling (reduction in setup overhead blocks)
    hours_saved = round(unbundled_downtime - total_block_hours, 1)

    # True Track Asset Availability
    asset_availability = ((total_corridor_hours - total_block_hours) / total_corridor_hours) * 100

    kpis = {
        'total_tasks': total,
        'scheduled': scheduled_count,
        'critical_unscheduled': critical_unscheduled,
        'active_blocks': total_active_windows,
        'bundled_blocks': bundled_windows,
        'hours_saved': hours_saved,
        'asset_availability': round(asset_availability, 2),
    }

    print(f"\n--- Optimization Metrics ---")
    print(f"Total Tasks: {total}")
    print(f"Scheduled: {scheduled_count}")
    print(f"Critical Unscheduled: {critical_unscheduled}")
    print(f"Active Blocks Scheduled: {total_active_windows}")
    print(f"Bundled Blocks (Multi-Dept): {bundled_windows}")
    print(f"Downtime Hours Saved by Bundling: {hours_saved} hours")
    print(f"True Track Asset Availability: {round(asset_availability, 2)}%")

    return schedule_df, kpis


if __name__ == "__main__":
    solve_schedule()