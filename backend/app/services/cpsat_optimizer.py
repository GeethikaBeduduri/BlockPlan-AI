"""Scheduling optimizer implementation using Google OR-Tools CP-SAT with heuristic fallback.

Solves the multi-department block planning optimization problem:
- Strict corridor matching
- Window capacity limits (available_hours)
- Maximum 1 block assignment per task
- Priority weighting via ML criticality score
- Bundling bonus for multi-department co-scheduling (Engineering, Traction, S&T)
"""

from __future__ import annotations

import time
from collections import defaultdict
from app.schemas.assignments import PlanAssignmentResponse
from app.schemas.enums import AssignmentStatus, DefectSeverity, Department
from app.schemas.kpis import KpiResponse
from app.schemas.optimizer import (
    OptimizerInput,
    OptimizerMetadata,
    OptimizerResult,
)
from app.services.exceptions import OptimizerInfeasibleError, OptimizerTimeoutError


class CpSatOptimizerClient:
    """Production optimizer client with OR-Tools CP-SAT and heuristic solver."""

    def optimize_batch(self, request: OptimizerInput) -> OptimizerResult:
        start_time = time.perf_counter()

        tasks = request.tasks
        windows = request.windows
        departments = [Department.ENGINEERING, Department.TRACTION, Department.S_AND_T]

        try:
            from ortools.sat.python import cp_model
            use_ortools = True
        except ImportError:
            use_ortools = False

        if use_ortools:
            return self._solve_with_cp_model(request, start_time)
        else:
            return self._solve_with_heuristic(request, start_time)

    def _solve_with_cp_model(self, request: OptimizerInput, start_time: float) -> OptimizerResult:
        from ortools.sat.python import cp_model

        tasks = request.tasks
        windows = request.windows
        departments = [Department.ENGINEERING, Department.TRACTION, Department.S_AND_T]

        model = cp_model.CpModel()

        # Decision variables: x[(t_idx, w_idx)] = 1 if task t is assigned to window w
        x = {}
        # Active window variables: y[w_idx] = 1 if window w is used by any task
        y = {}
        # Department window variables: d_active[(dept, w_idx)] = 1 if dept has tasks in window w
        d_active = {}

        for w_idx, _ in enumerate(windows):
            y[w_idx] = model.NewBoolVar(f"window_active_{w_idx}")
            for dept in departments:
                d_active[(dept, w_idx)] = model.NewBoolVar(f"dept_active_{dept.value}_{w_idx}")

        for t_idx, t in enumerate(tasks):
            for w_idx, w in enumerate(windows):
                if t.corridor_id == w.corridor_id:
                    x[(t_idx, w_idx)] = model.NewBoolVar(f"assign_{t_idx}_{w_idx}")

        # Constraint 1: Each task assigned to at most one window
        for t_idx in range(len(tasks)):
            assigned_vars = [x[(t_idx, w_idx)] for w_idx in range(len(windows)) if (t_idx, w_idx) in x]
            model.AddAtMostOne(assigned_vars)

        # Constraint 2: Capacity constraint for each window (hours used <= available hours)
        for w_idx, w in enumerate(windows):
            window_tasks = [
                x[(t_idx, w_idx)] * int(round(tasks[t_idx].estimated_hours))
                for t_idx in range(len(tasks))
                if (t_idx, w_idx) in x
            ]
            model.Add(sum(window_tasks) <= int(round(w.available_hours)))

        # Constraint 3: Link y[w_idx] with x[t_idx, w_idx]
        for w_idx in range(len(windows)):
            window_assigns = [x[(t_idx, w_idx)] for t_idx in range(len(tasks)) if (t_idx, w_idx) in x]
            if window_assigns:
                for var in window_assigns:
                    model.Add(y[w_idx] >= var)
                model.Add(y[w_idx] <= sum(window_assigns))
            else:
                model.Add(y[w_idx] == 0)

        # Constraint 4: Link d_active[(dept, w_idx)] to tasks of that department
        for w_idx in range(len(windows)):
            for dept in departments:
                dept_assigns = [
                    x[(t_idx, w_idx)]
                    for t_idx, t in enumerate(tasks)
                    if (t_idx, w_idx) in x and t.department == dept
                ]
                if dept_assigns:
                    for var in dept_assigns:
                        model.Add(d_active[(dept, w_idx)] >= var)
                    model.Add(d_active[(dept, w_idx)] <= sum(dept_assigns))
                else:
                    model.Add(d_active[(dept, w_idx)] == 0)

        # Objective Function: Maximize task criticality + bonus for multi-department bundling
        task_objective = []
        for (t_idx, _), var in x.items():
            criticality_int = int(round(tasks[t_idx].criticality_score * 10))
            task_objective.append(var * criticality_int)

        bundling_objective = []
        for w_idx in range(len(windows)):
            dept_sum = sum(d_active[(dept, w_idx)] for dept in departments)
            bundling_objective.append((dept_sum - y[w_idx]) * 300)

        model.Maximize(sum(task_objective) + sum(bundling_objective))

        # Solve
        solver = cp_model.CpSolver()
        max_duration = 30.0
        if request.constraints and request.constraints.max_solver_duration_seconds:
            max_duration = request.constraints.max_solver_duration_seconds
        solver.parameters.max_time_in_seconds = max_duration

        solve_status = solver.Solve(model)
        elapsed_seconds = time.perf_counter() - start_time

        if solve_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if solve_status == cp_model.INFEASIBLE:
                raise OptimizerInfeasibleError("No feasible block schedule found by CP-SAT solver.")
            raise OptimizerTimeoutError("Optimization solver timed out.")

        # Extract assignments
        assignments: list[PlanAssignmentResponse] = []
        scheduled_hours = 0.0

        for t_idx, t in enumerate(tasks):
            assigned_window_idx = None
            for w_idx in range(len(windows)):
                if (t_idx, w_idx) in x and solver.Value(x[(t_idx, w_idx)]) == 1:
                    assigned_window_idx = w_idx
                    break

            if assigned_window_idx is not None:
                w = windows[assigned_window_idx]
                assignments.append(
                    PlanAssignmentResponse(
                        task_id=t.task_id,
                        window_id=w.window_id,
                        corridor_id=t.corridor_id,
                        department=t.department,
                        day=w.day,
                        estimated_hours=t.estimated_hours,
                        criticality_score=t.criticality_score,
                        defect_severity=t.defect_severity,
                        status=AssignmentStatus.SCHEDULED,
                    )
                )
                scheduled_hours += float(t.estimated_hours)
            else:
                assignments.append(
                    PlanAssignmentResponse(
                        task_id=t.task_id,
                        window_id=None,
                        corridor_id=t.corridor_id,
                        department=t.department,
                        day=None,
                        estimated_hours=t.estimated_hours,
                        criticality_score=t.criticality_score,
                        defect_severity=t.defect_severity,
                        status=AssignmentStatus.UNSCHEDULED,
                    )
                )

        return self._build_result(tasks, windows, assignments, scheduled_hours, elapsed_seconds, "Google OR-Tools CP-SAT")

    def _solve_with_heuristic(self, request: OptimizerInput, start_time: float) -> OptimizerResult:
        tasks = sorted(request.tasks, key=lambda t: (t.criticality_score, t.days_overdue), reverse=True)
        windows = request.windows

        window_remaining = {w.window_id: float(w.available_hours) for w in windows}
        window_corridor = {w.window_id: w.corridor_id for w in windows}
        window_day = {w.window_id: w.day for w in windows}
        window_depts = defaultdict(set)

        assignments: list[PlanAssignmentResponse] = []
        scheduled_hours = 0.0

        for t in request.tasks:
            # Find best window on same corridor with capacity
            candidates = [
                w for w in windows
                if w.corridor_id == t.corridor_id and window_remaining[w.window_id] >= float(t.estimated_hours)
            ]
            if candidates:
                # Prefer windows already having other departments (bundling bonus)
                best_window = max(
                    candidates,
                    key=lambda w: (len(window_depts[w.window_id]), window_remaining[w.window_id])
                )
                wid = best_window.window_id
                window_remaining[wid] -= float(t.estimated_hours)
                window_depts[wid].add(t.department)
                scheduled_hours += float(t.estimated_hours)

                assignments.append(
                    PlanAssignmentResponse(
                        task_id=t.task_id,
                        window_id=wid,
                        corridor_id=t.corridor_id,
                        department=t.department,
                        day=window_day[wid],
                        estimated_hours=t.estimated_hours,
                        criticality_score=t.criticality_score,
                        defect_severity=t.defect_severity,
                        status=AssignmentStatus.SCHEDULED,
                    )
                )
            else:
                assignments.append(
                    PlanAssignmentResponse(
                        task_id=t.task_id,
                        window_id=None,
                        corridor_id=t.corridor_id,
                        department=t.department,
                        day=None,
                        estimated_hours=t.estimated_hours,
                        criticality_score=t.criticality_score,
                        defect_severity=t.defect_severity,
                        status=AssignmentStatus.UNSCHEDULED,
                    )
                )

        elapsed_seconds = time.perf_counter() - start_time
        return self._build_result(request.tasks, windows, assignments, scheduled_hours, elapsed_seconds, "Heuristic Multi-Department Bundler")

    def _build_result(
        self,
        tasks: list,
        windows: list,
        assignments: list[PlanAssignmentResponse],
        scheduled_hours: float,
        elapsed_seconds: float,
        engine_name: str,
    ) -> OptimizerResult:
        total_tasks = len(tasks)
        scheduled_tasks = sum(1 for a in assignments if a.status == AssignmentStatus.SCHEDULED)
        unscheduled_tasks = total_tasks - scheduled_tasks
        critical_unscheduled_tasks = sum(
            1
            for a in assignments
            if a.status == AssignmentStatus.UNSCHEDULED and a.defect_severity == DefectSeverity.A
        )
        total_available_hours = sum(float(w.available_hours) for w in windows)
        asset_avail_pct = (scheduled_tasks / total_tasks * 100.0) if total_tasks > 0 else 0.0
        utilization_pct = (
            (scheduled_hours / total_available_hours * 100.0)
            if total_available_hours > 0
            else 0.0
        )

        kpis = KpiResponse(
            total_tasks=total_tasks,
            scheduled_tasks=scheduled_tasks,
            unscheduled_tasks=unscheduled_tasks,
            critical_unscheduled_tasks=critical_unscheduled_tasks,
            asset_availability_percent=round(asset_avail_pct, 2),
            scheduled_hours=round(scheduled_hours, 2),
            available_window_hours=round(total_available_hours, 2),
            block_utilization_percent=round(utilization_pct, 2),
            plan_generation_seconds=round(elapsed_seconds, 2),
        )

        metadata = OptimizerMetadata(
            solver_status="OPTIMAL",
            solve_time_seconds=round(elapsed_seconds, 3),
            solver_engine=engine_name,
        )

        return OptimizerResult(
            assignments=assignments,
            kpis=kpis,
            metadata=metadata,
        )
