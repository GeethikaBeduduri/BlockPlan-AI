/**
 * TypeScript types derived from backend Pydantic schemas.
 *
 * Source of truth: app/schemas/*.py  (backend — do NOT modify)
 * These types must track the backend schemas exactly.
 * Do NOT add fields that the backend does not emit.
 * Do NOT invent frontend-specific response shapes.
 *
 * Naming convention:
 *   Backend Python class  →  TypeScript interface
 *   FieldError            →  FieldError
 *   PageMeta              →  PageMeta
 *   etc.
 */

import type {
  AssignmentStatus,
  DefectSeverity,
  Department,
  ErrorCode,
  OverrideAction,
  PlanningHorizonType,
  PlanStatus,
  TaskStatus,
  Weekday,
} from './enums';

// ---------------------------------------------------------------------------
// Shared / common  (app/schemas/common.py)
// ---------------------------------------------------------------------------

/** app/schemas/common.py – PageMeta */
export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

/** app/schemas/common.py – FieldError */
export interface FieldError {
  field: string;
  message: string;
}

/** app/schemas/common.py – ErrorResponse */
export interface ErrorResponse {
  error: ErrorCode;
  message: string;
  details: FieldError[] | null;
}

// ---------------------------------------------------------------------------
// System  (app/schemas/system.py)
// ---------------------------------------------------------------------------

/** app/schemas/system.py – HealthResponse */
export interface HealthResponse {
  status: string;
}

/** app/schemas/system.py – RootResponse */
export interface RootResponse {
  service: string;
  version: string;
  environment: string;
  docs: string;
}

// ---------------------------------------------------------------------------
// Tasks  (app/schemas/tasks.py)
// ---------------------------------------------------------------------------

/**
 * app/schemas/tasks.py – MaintenanceTaskResponse
 * Returned by GET /tasks and GET /tasks/{task_id}
 */
export interface MaintenanceTaskResponse {
  task_id: number;
  department: Department;
  corridor_id: string;
  defect_severity: DefectSeverity;
  days_overdue: number;
  estimated_hours: number;
  asset_age_years: number;
  status: TaskStatus;
  criticality_score: number | null;
  created_at: string | null; // ISO 8601 datetime string
  updated_at: string | null; // ISO 8601 datetime string
}

/**
 * app/schemas/tasks.py – MaintenanceTaskListResponse
 * Returned by GET /tasks and GET /tasks/unscheduled
 */
export interface MaintenanceTaskListResponse {
  items: MaintenanceTaskResponse[];
  meta: PageMeta;
}

/**
 * app/schemas/tasks.py – UnscheduledCriticalTaskResponse
 * Used inside CriticalTasksKpiResponse
 */
export interface UnscheduledCriticalTaskResponse {
  plan_id: number;
  task_id: number;
  department: Department;
  corridor_id: string;
  defect_severity: DefectSeverity;
  days_overdue: number;
  estimated_hours: number;
  criticality_score: number;
  status: TaskStatus;
}

// ---------------------------------------------------------------------------
// Assignments  (app/schemas/assignments.py)
// ---------------------------------------------------------------------------

/**
 * app/schemas/assignments.py – PlanAssignmentResponse
 * One row inside BlockPlanResponse.assignments
 */
export interface PlanAssignmentResponse {
  task_id: number;
  window_id: number | null;
  corridor_id: string;
  department: Department;
  day: Weekday | null;
  estimated_hours: number;
  criticality_score: number;
  defect_severity: DefectSeverity;
  status: AssignmentStatus;
}

// ---------------------------------------------------------------------------
// KPIs  (app/schemas/kpis.py)
// ---------------------------------------------------------------------------

/**
 * app/schemas/kpis.py – KpiResponse
 * Returned by GET /kpis/availability and GET /kpis/utilization
 */
export interface KpiResponse {
  plan_id: number | null;
  horizon_type: PlanningHorizonType | null;
  horizon_start: string | null; // ISO 8601 date string (YYYY-MM-DD)
  horizon_end: string | null;   // ISO 8601 date string (YYYY-MM-DD)
  corridor_id: string | null;
  department: Department | null;
  total_tasks: number;
  scheduled_tasks: number;
  unscheduled_tasks: number;
  critical_unscheduled_tasks: number;
  asset_availability_percent: number;
  scheduled_hours: number;
  available_window_hours: number;
  block_utilization_percent: number;
  plan_generation_seconds: number | null;
}

/**
 * app/schemas/kpis.py – CriticalTasksKpiResponse
 * Returned by GET /kpis/critical-tasks
 */
export interface CriticalTasksKpiResponse {
  items: UnscheduledCriticalTaskResponse[];
  meta: PageMeta;
}

// ---------------------------------------------------------------------------
// Plans  (app/schemas/plans.py + app/schemas/horizon.py)
// ---------------------------------------------------------------------------

/**
 * app/schemas/plans.py – BlockPlanResponse
 * Returned by GET /plan/{plan_id}
 */
export interface BlockPlanResponse {
  plan_id: number;
  status: PlanStatus;
  horizon_type: PlanningHorizonType;
  horizon_start: string; // ISO 8601 date string
  horizon_end: string;   // ISO 8601 date string
  assignments: PlanAssignmentResponse[];
  kpis: KpiResponse | null;
  generated_at: string | null; // ISO 8601 datetime string
  created_at: string | null;
  updated_at: string | null;
}

/**
 * app/schemas/plans.py – PlanJobResponse
 * Returned by POST /generate-plan (HTTP 202 Accepted)
 */
export interface PlanJobResponse {
  accepted: boolean;
  job_id: string;
  plan_id: number | null;
  horizon_type: string | null;
  status: PlanStatus;
}

// ---------------------------------------------------------------------------
// Horizon / Plan generation request  (app/schemas/horizon.py)
// ---------------------------------------------------------------------------

/**
 * app/schemas/horizon.py – PlanGenerateRequest
 * Request body for POST /generate-plan
 *
 * Backend validation rules (enforced server-side):
 *   daily   → horizon_end === horizon_start
 *   weekly  → horizon_end === horizon_start + 6 days
 *   monthly → span is 27–30 days inclusive (28–31 calendar days)
 */
export interface PlanGenerateRequest {
  horizon_type: PlanningHorizonType;
  horizon_start: string; // ISO 8601 date string (YYYY-MM-DD)
  horizon_end: string;   // ISO 8601 date string (YYYY-MM-DD)
  corridor_id?: string | null;
  department?: Department | null;
}

// ---------------------------------------------------------------------------
// Overrides  (app/schemas/overrides.py)
// ---------------------------------------------------------------------------

/**
 * app/schemas/overrides.py – PlannerOverrideCreate
 * Request body for PUT /plan/{plan_id}/override
 *
 * Backend validation rules (enforced server-side):
 *   reassign / force_schedule → target_window_id is required
 *   unschedule                → target_window_id must be absent / null
 */
export interface PlannerOverrideCreate {
  plan_id: number;
  task_id: number;
  action: OverrideAction;
  target_window_id?: number | null;
  /** Minimum 10 chars, maximum 2000 chars. Required for SIH audit logging. */
  reason: string;
}

/**
 * app/schemas/overrides.py – PlannerOverrideResponse
 * Returned by PUT /plan/{plan_id}/override
 */
export interface PlannerOverrideResponse {
  override_id: number;
  plan_id: number;
  task_id: number;
  action: OverrideAction;
  target_window_id: number | null;
  reason: string;
  overridden_by: string | null;
  overridden_at: string | null; // ISO 8601 datetime string
}

// ---------------------------------------------------------------------------
// Block Windows  (app/schemas/windows.py)
// ---------------------------------------------------------------------------

/**
 * app/schemas/windows.py – BlockWindowResponse
 * Individual block possession window configuration.
 */
export interface BlockWindowResponse {
  window_id: number;
  corridor_id: string;
  day: Weekday;
  available_hours: number;
  starts_at?: string | null; // ISO 8601 datetime string
  ends_at?: string | null;   // ISO 8601 datetime string
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * app/schemas/windows.py – BlockWindowListResponse
 * List of block windows with pagination metadata.
 */
export interface BlockWindowListResponse {
  items: BlockWindowResponse[];
  meta: PageMeta;
}

