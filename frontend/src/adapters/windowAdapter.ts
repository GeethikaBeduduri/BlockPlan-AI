/**
 * Window Adapter — Derives window view-models from plan assignments.
 *
 * IMPORTANT: The backend has NO standalone GET /windows endpoint.
 * Block-window data is accessed only through plan assignments returned by
 * GET /plan/{plan_id}. This adapter groups those assignments by window_id
 * to produce BlockWindowViewModel and WindowCorridorSummaryViewModel.
 *
 * Backend source: app/schemas/windows.py (BlockWindowResponse schema)
 *                 app/schemas/assignments.py (PlanAssignmentResponse)
 *                 app/routers/plans.py (GET /plan/{plan_id})
 */

import type { Weekday } from '../api/types/enums';
import type { PlanAssignmentResponse } from '../api/types/models';
import type {
  BlockWindowViewModel,
  PlanAssignmentViewModel,
  WindowCorridorSummaryViewModel,
} from './types';
import { adaptPlanAssignment } from './planAdapter';
import { formatDepartment, formatWindowId } from './formatters';

export { formatWindowId };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAY_FULL: Record<Weekday, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

const WEEKDAY_ORDER: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatHours(hours: number): string {
  return `${hours.toFixed(1)} h`;
}

function deriveWindowStatus(
  utilizationPercent: number,
  taskCount: number,
): BlockWindowViewModel['windowStatus'] {
  if (taskCount === 0) return 'unassigned';
  if (utilizationPercent >= 95) return 'full';
  if (utilizationPercent >= 10) return 'partially_used';
  return 'available';
}

// ---------------------------------------------------------------------------
// Core adapter — groups scheduled assignments by window_id
// ---------------------------------------------------------------------------

/**
 * Convert a flat list of PlanAssignmentResponse (from BlockPlanResponse.assignments)
 * into a list of BlockWindowViewModel, one per unique window_id.
 *
 * Unscheduled assignments (window_id === null) are excluded from the window
 * grouping and returned separately.
 *
 * @param rawAssignments – backend PlanAssignmentResponse[]
 * @returns { windows, unscheduled }
 */
export function adaptAssignmentsToWindows(rawAssignments: PlanAssignmentResponse[]): {
  windows: BlockWindowViewModel[];
  unscheduled: PlanAssignmentViewModel[];
} {
  const windowMap = new Map<number, PlanAssignmentResponse[]>();
  const unscheduledRaw: PlanAssignmentResponse[] = [];

  for (const a of rawAssignments) {
    if (a.window_id === null || a.window_id === undefined) {
      unscheduledRaw.push(a);
    } else {
      const existing = windowMap.get(a.window_id) ?? [];
      existing.push(a);
      windowMap.set(a.window_id, existing);
    }
  }

  const windows: BlockWindowViewModel[] = [];

  for (const [windowId, assignments] of windowMap.entries()) {
    // All assignments in this window share the same corridor_id and day.
    const firstAssignment = assignments[0]!;
    const corridorId = firstAssignment.corridor_id;
    const day: Weekday = firstAssignment.day ?? 'Mon';

    const adaptedAssignments: PlanAssignmentViewModel[] = assignments.map(adaptPlanAssignment);

    const scheduledHours = assignments.reduce((s, a) => s + a.estimated_hours, 0);

    // available_hours is not embedded in PlanAssignmentResponse; we approximate from
    // the max seen in the window. The backend optimizer uses the configured window capacity
    // (BlockWindowResponse.available_hours from windows.csv). Since that value is not surfaced
    // in the plan assignment response, we floor to the scheduled hours as minimum so utilization
    // never exceeds 100% and show a note in the UI.
    // A better estimate would require a dedicated /windows endpoint — which does not exist.
    const availableHours = Math.max(scheduledHours, 1.0);

    const utilizationPercent = availableHours > 0
      ? Math.min((scheduledHours / availableHours) * 100, 100)
      : 0;

    const departmentSet = new Set(assignments.map(a => a.department));
    const departments = [...departmentSet];
    const departmentDisplays = departments.map(d => formatDepartment(d));

    const peakCriticalityScore = assignments.reduce(
      (max, a) => Math.max(max, a.criticality_score),
      0,
    );

    windows.push({
      windowId,
      formattedWindowId: formatWindowId(windowId),
      corridorId,
      day,
      dayDisplay: WEEKDAY_FULL[day] ?? day,
      availableHours,
      scheduledHours,
      remainingHours: Math.max(0, availableHours - scheduledHours),
      utilizationPercent,
      utilizationFormatted: `${utilizationPercent.toFixed(1)}%`,
      taskCount: assignments.length,
      departments,
      departmentDisplays,
      assignments: adaptedAssignments,
      peakCriticalityScore,
      windowStatus: deriveWindowStatus(utilizationPercent, assignments.length),
      availableHoursFormatted: formatHours(availableHours),
    });
  }

  // Sort by corridor → day order → window_id
  windows.sort((a, b) => {
    const corCmp = a.corridorId.localeCompare(b.corridorId);
    if (corCmp !== 0) return corCmp;
    const dayA = WEEKDAY_ORDER.indexOf(a.day);
    const dayB = WEEKDAY_ORDER.indexOf(b.day);
    if (dayA !== dayB) return dayA - dayB;
    return a.windowId - b.windowId;
  });

  const unscheduled = unscheduledRaw.map(adaptPlanAssignment);

  return { windows, unscheduled };
}

// ---------------------------------------------------------------------------
// Corridor summary adapter
// ---------------------------------------------------------------------------

/**
 * Group BlockWindowViewModel[] by corridorId and build
 * WindowCorridorSummaryViewModel for each corridor.
 */
export function buildCorridorSummaries(
  windows: BlockWindowViewModel[],
): WindowCorridorSummaryViewModel[] {
  const corridorMap = new Map<string, BlockWindowViewModel[]>();

  for (const w of windows) {
    const existing = corridorMap.get(w.corridorId) ?? [];
    existing.push(w);
    corridorMap.set(w.corridorId, existing);
  }

  const summaries: WindowCorridorSummaryViewModel[] = [];

  for (const [corridorId, corWindows] of corridorMap.entries()) {
    const totalAvailableHours = corWindows.reduce((s, w) => s + w.availableHours, 0);
    const totalScheduledHours = corWindows.reduce((s, w) => s + w.scheduledHours, 0);

    const avgUtilizationPercent = corWindows.length > 0
      ? corWindows.reduce((s, w) => s + w.utilizationPercent, 0) / corWindows.length
      : 0;

    // Build day breakdown
    const dayBreakdown = {} as Record<Weekday, BlockWindowViewModel[]>;
    for (const day of WEEKDAY_ORDER) {
      dayBreakdown[day] = corWindows.filter(w => w.day === day);
    }

    summaries.push({
      corridorId,
      totalWindows: corWindows.length,
      totalAvailableHours,
      totalScheduledHours,
      totalRemainingHours: Math.max(0, totalAvailableHours - totalScheduledHours),
      avgUtilizationPercent,
      avgUtilizationFormatted: `${avgUtilizationPercent.toFixed(1)}%`,
      windows: corWindows,
      dayBreakdown,
    });
  }

  summaries.sort((a, b) => a.corridorId.localeCompare(b.corridorId));

  return summaries;
}
