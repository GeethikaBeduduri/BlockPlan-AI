/**
 * Frontend View Model Types for SIH26027 Block Planning.
 *
 * ARCHITECTURAL DISTINCTION:
 * - API DTO Types (`@/api/types`): Exact mirror of backend Pydantic schemas.
 *   These are never altered and remain the single source of truth for network contracts.
 * - View Model Types (this file): Frontend presentation models produced by Adapters.
 *   These enrich DTOs with UI display strings, formatted dates, badge styles,
 *   and calculated presentation helpers while PRESERVING raw backend IDs and values.
 *
 * RULES:
 * 1. Primary entity IDs remain numbers (`number`), strictly matching backend `EntityId = int`.
 * 2. Backend enum values are retained alongside UI display strings.
 * 3. KPI percentages and criticality scores are NEVER re-calculated on the client;
 *    only formatting/color-mapping helpers are attached.
 * 4. The raw DTO is retained in a `raw` property for full traceability.
 */

import type {
  AssignmentStatus,
  BlockPlanResponse,
  CriticalTasksKpiResponse,
  DefectSeverity,
  Department,
  KpiResponse,
  MaintenanceTaskResponse,
  OverrideAction,
  PlanAssignmentResponse,
  PlanJobResponse,
  PlannerOverrideResponse,
  PlanningHorizonType,
  PlanStatus,
  TaskStatus,
  UnscheduledCriticalTaskResponse,
  Weekday,
} from '../api/types';

// ---------------------------------------------------------------------------
// Common UI Presentation Tokens
// ---------------------------------------------------------------------------

export type CriticalityLevel = 'Critical' | 'High' | 'Medium' | 'Low' | 'Unscored';

export interface BadgeStyle {
  label: string;
  color: string;
  bg: string;
  borderColor?: string;
}

// ---------------------------------------------------------------------------
// Task View Models
// ---------------------------------------------------------------------------

export interface TaskViewModel {
  /** Exact integer ID from backend (e.g. 1) */
  id: number;
  /** UI display string (e.g. "TSK-0001") */
  formattedId: string;
  /** Railway corridor ID (e.g. "COR_01") */
  corridorId: string;
  /** Raw backend Department enum ('Engineering' | 'Traction' | 'S&T') */
  department: Department;
  /** UI display name (e.g. "Engineering", "Traction Distribution", "Signal & Telecom (S&T)") */
  departmentDisplay: string;
  /** Short department code (e.g. "ENG", "TRC", "S&T") */
  departmentShort: string;
  /** Department theme hex color */
  departmentColor: string;
  /** Raw backend DefectSeverity enum ('A' | 'B' | 'C') */
  defectSeverity: DefectSeverity;
  /** UI severity display (e.g. "Class A (Critical)") */
  defectSeverityDisplay: string;
  /** Days overdue integer */
  daysOverdue: number;
  /** Whether daysOverdue > 0 */
  isOverdue: boolean;
  /** Task duration in hours (exact float from backend) */
  estimatedHours: number;
  /** Duration in minutes (hours * 60) for timeline visualization */
  estimatedMinutes: number;
  /** Formatted duration string (e.g. "2h 30m" or "45m") */
  estimatedDurationFormatted: string;
  /** Asset age in years */
  assetAgeYears: number;
  /** Raw backend TaskStatus enum ('open' | 'scheduled' | 'unscheduled' | 'completed' | 'cancelled') */
  status: TaskStatus;
  /** UI status display (e.g. "Open", "Scheduled", "Unscheduled") */
  statusDisplay: string;
  /** Criticality score 0-100 from ML service (null if unscored) */
  criticalityScore: number | null;
  /** Formatted score string (e.g. "87.4" or "—") */
  criticalityScoreFormatted: string;
  /** Semantic criticality tier */
  criticalityLevel: CriticalityLevel;
  /** Badge color styling */
  criticalityBadge: BadgeStyle;
  /** Parsed Date object for created_at (null if not provided) */
  createdAt: Date | null;
  /** Formatted created_at string (e.g. "2026-08-29 10:00") */
  createdAtFormatted: string;
  /** Parsed Date object for updated_at */
  updatedAt: Date | null;
  /** Original untransformed DTO */
  raw: MaintenanceTaskResponse;
}

export interface TaskListViewModel {
  items: TaskViewModel[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Plan Assignment View Models
// ---------------------------------------------------------------------------

export interface PlanAssignmentViewModel {
  /** Target task integer ID */
  taskId: number;
  formattedTaskId: string;
  /** Assigned window integer ID (null if unscheduled) */
  windowId: number | null;
  formattedWindowId: string;
  corridorId: string;
  department: Department;
  departmentDisplay: string;
  departmentShort: string;
  departmentColor: string;
  /** Day of assignment ('Mon' .. 'Sun' or null if unscheduled) */
  day: Weekday | null;
  dayDisplay: string;
  estimatedHours: number;
  estimatedMinutes: number;
  estimatedDurationFormatted: string;
  criticalityScore: number;
  criticalityScoreFormatted: string;
  criticalityLevel: CriticalityLevel;
  criticalityBadge: BadgeStyle;
  defectSeverity: DefectSeverity;
  defectSeverityDisplay: string;
  status: AssignmentStatus;
  statusDisplay: string;
  isScheduled: boolean;
  isOverridden: boolean;
  raw: PlanAssignmentResponse;
}

// ---------------------------------------------------------------------------
// Block Plan View Models
// ---------------------------------------------------------------------------

export interface BlockPlanViewModel {
  /** Plan integer ID */
  planId: number;
  formattedPlanId: string;
  /** Status ('pending' | 'generating' | 'ready' | 'failed' | 'superseded') */
  status: PlanStatus;
  statusDisplay: string;
  isReady: boolean;
  isGenerating: boolean;
  isFailed: boolean;
  horizonType: PlanningHorizonType;
  horizonTypeDisplay: string;
  horizonStart: Date;
  horizonEnd: Date;
  horizonSpanDays: number;
  horizonDateRangeFormatted: string;
  assignments: PlanAssignmentViewModel[];
  scheduledAssignments: PlanAssignmentViewModel[];
  unscheduledAssignments: PlanAssignmentViewModel[];
  totalTasksCount: number;
  scheduledTasksCount: number;
  unscheduledTasksCount: number;
  kpis: KpiViewModel | null;
  generatedAt: Date | null;
  generatedAtFormatted: string;
  raw: BlockPlanResponse;
}

export interface PlanJobViewModel {
  accepted: boolean;
  jobId: string;
  planId: number | null;
  formattedPlanId: string;
  horizonType: string | null;
  status: PlanStatus;
  statusDisplay: string;
  raw: PlanJobResponse;
}

// ---------------------------------------------------------------------------
// KPI View Models
// ---------------------------------------------------------------------------

export interface KpiViewModel {
  planId: number | null;
  horizonType: PlanningHorizonType | null;
  horizonTypeDisplay: string;
  horizonStart: Date | null;
  horizonEnd: Date | null;
  corridorId: string | null;
  department: Department | null;
  departmentDisplay: string | null;
  totalTasks: number;
  scheduledTasks: number;
  unscheduledTasks: number;
  criticalUnscheduledTasks: number;
  /** Exact percentage from backend (0 - 100) */
  assetAvailabilityPercent: number;
  assetAvailabilityFormatted: string;
  scheduledHours: number;
  availableWindowHours: number;
  /** Exact percentage from backend (0 - 100) */
  blockUtilizationPercent: number;
  blockUtilizationFormatted: string;
  planGenerationSeconds: number | null;
  planGenerationFormatted: string;
  raw: KpiResponse;
}

export interface UnscheduledCriticalTaskViewModel {
  planId: number;
  taskId: number;
  formattedTaskId: string;
  department: Department;
  departmentDisplay: string;
  departmentShort: string;
  departmentColor: string;
  corridorId: string;
  defectSeverity: DefectSeverity;
  defectSeverityDisplay: string;
  daysOverdue: number;
  estimatedHours: number;
  estimatedDurationFormatted: string;
  criticalityScore: number;
  criticalityScoreFormatted: string;
  criticalityLevel: CriticalityLevel;
  criticalityBadge: BadgeStyle;
  status: TaskStatus;
  statusDisplay: string;
  raw: UnscheduledCriticalTaskResponse;
}

export interface CriticalTasksKpiViewModel {
  items: UnscheduledCriticalTaskViewModel[];
  total: number;
  limit: number;
  offset: number;
  raw: CriticalTasksKpiResponse;
}

// ---------------------------------------------------------------------------
// Planner Override View Models
// ---------------------------------------------------------------------------

export interface PlannerOverrideViewModel {
  overrideId: number;
  planId: number;
  taskId: number;
  formattedTaskId: string;
  action: OverrideAction;
  actionDisplay: string;
  targetWindowId: number | null;
  formattedTargetWindowId: string;
  reason: string;
  overriddenBy: string | null;
  overriddenByDisplay: string;
  overriddenAt: Date | null;
  overriddenAtFormatted: string;
  raw: PlannerOverrideResponse;
}

// ---------------------------------------------------------------------------
// Block Window View Models (derived from plan assignments — no standalone API)
// ---------------------------------------------------------------------------

/**
 * A block maintenance window grouped from plan assignments.
 * Source: BlockPlanResponse.assignments (GET /plan/{plan_id})
 *
 * Because the backend exposes no standalone GET /windows endpoint,
 * window data is materialized by grouping plan assignments by window_id.
 */
export interface BlockWindowViewModel {
  /** Backend window_id (integer) */
  windowId: number;
  /** Formatted display (e.g. "WIN-0001") */
  formattedWindowId: string;
  /** Corridor identifier (e.g. "COR_01") */
  corridorId: string;
  /** Day of the week ('Mon' … 'Sun') */
  day: Weekday;
  /** Full weekday display ("Monday", etc.) */
  dayDisplay: string;
  /** Total capacity in hours from the plan optimizer context */
  availableHours: number;
  /** Sum of estimated_hours of all scheduled assignments in this window */
  scheduledHours: number;
  /** Remaining capacity hours */
  remainingHours: number;
  /** Utilization percent 0-100 (scheduledHours / availableHours * 100) */
  utilizationPercent: number;
  /** Formatted utilization string ("72.5%") */
  utilizationFormatted: string;
  /** Number of task assignments within this window */
  taskCount: number;
  /** Unique departments present in this window */
  departments: Department[];
  /** Department display strings */
  departmentDisplays: string[];
  /** Assignments within this window */
  assignments: PlanAssignmentViewModel[];
  /** Highest criticality_score across all assignments */
  peakCriticalityScore: number;
  /** Window status derived from assignment statuses */
  windowStatus: 'available' | 'partially_used' | 'full' | 'unassigned';
  /** Formatted capacity display ("8.0 h") */
  availableHoursFormatted: string;
}

/**
 * Per-corridor summary produced by grouping windows.
 * Used by the corridor cards in BlocksPage.
 */
export interface WindowCorridorSummaryViewModel {
  corridorId: string;
  totalWindows: number;
  totalAvailableHours: number;
  totalScheduledHours: number;
  totalRemainingHours: number;
  avgUtilizationPercent: number;
  avgUtilizationFormatted: string;
  windows: BlockWindowViewModel[];
  dayBreakdown: Record<Weekday, BlockWindowViewModel[]>;
}

// ---------------------------------------------------------------------------
// Gantt View Models
// ---------------------------------------------------------------------------

export interface GanttTaskItemViewModel {
  taskId: number;
  formattedTaskId: string;
  department: Department;
  departmentDisplay: string;
  departmentShort: string;
  departmentColor: string;
  durationHours: number;
  durationMinutes: number;
  durationFormatted: string;
  criticalityScore: number;
  criticalityScoreFormatted: string;
  criticalityLevel: CriticalityLevel;
  criticalityBadge: BadgeStyle;
  defectSeverity: DefectSeverity;
  defectSeverityDisplay: string;
  status: AssignmentStatus;
  statusDisplay: string;
  startOffsetMinutes: number;
  widthPercentage: number;
  leftOffsetPercentage: number;
  raw: PlanAssignmentResponse;
}

export interface GanttBlockViewModel {
  blockId: string;
  windowId: number;
  formattedWindowId: string;
  corridorId: string;
  day: Weekday;
  dayDisplay: string;
  tasks: GanttTaskItemViewModel[];
  departments: Department[];
  departmentDisplays: string[];
  totalDurationMinutes: number;
  totalDurationHours: number;
  availableHours: number;
  availableDurationMinutes: number;
  utilizationPercent: number;
  utilizationFormatted: string;
  isShared: boolean;
  startTimeDisplay: string;
  endTimeDisplay: string;
}

export interface GanttCorridorRowViewModel {
  corridorId: string;
  blocks: GanttBlockViewModel[];
}

export interface GanttPlanViewModel {
  planId: number;
  formattedPlanId: string;
  status: PlanStatus;
  statusDisplay: string;
  isReady: boolean;
  isGenerating: boolean;
  isFailed: boolean;
  horizonType: PlanningHorizonType;
  horizonTypeDisplay: string;
  horizonDateRangeFormatted: string;
  corridorRows: GanttCorridorRowViewModel[];
  blocks: GanttBlockViewModel[];
  scheduledAssignments: PlanAssignmentViewModel[];
  unscheduledAssignments: PlanAssignmentViewModel[];
  totalScheduledTasks: number;
  totalUnscheduledTasks: number;
  kpis: KpiViewModel | null;
  raw: BlockPlanResponse;
}

