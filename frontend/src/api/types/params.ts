/**
 * Query parameter interfaces for endpoints that accept filter/pagination params.
 * Mirrors the backend Query() dependencies exactly.
 */

import type { Department, PlanningHorizonType, TaskStatus } from './enums';

// ---------------------------------------------------------------------------
// GET /tasks  (app/routers/tasks.py – list_tasks)
// ---------------------------------------------------------------------------
export interface TaskListParams {
  limit?: number;         // 1–500, default 50
  offset?: number;        // ≥ 0, default 0
  corridor_id?: string;   // 2–32 chars
  department?: Department;
  status?: TaskStatus;
}

// ---------------------------------------------------------------------------
// GET /tasks/unscheduled  (app/routers/tasks.py – list_unscheduled_tasks)
// ---------------------------------------------------------------------------
export interface UnscheduledTaskParams {
  limit?: number;          // 1–500, default 50
  offset?: number;         // ≥ 0, default 0
  plan_id?: number;        // > 0
  corridor_id?: string;    // 2–32 chars
  critical_only?: boolean; // default false
}

// ---------------------------------------------------------------------------
// GET /kpis/*  (app/routers/kpis.py – _kpi_query)
// ---------------------------------------------------------------------------
export interface KpiQueryParams {
  plan_id?: number;             // > 0
  corridor_id?: string;         // 2–32 chars
  department?: string;          // Department enum value
  horizon_type?: PlanningHorizonType;
}

// ---------------------------------------------------------------------------
// GET /kpis/critical-tasks  (app/routers/kpis.py – critical_tasks)
// adds pagination on top of KpiQueryParams
// ---------------------------------------------------------------------------
export interface CriticalTasksParams extends KpiQueryParams {
  limit?: number;   // 1–500, default 50
  offset?: number;  // ≥ 0, default 0
}
