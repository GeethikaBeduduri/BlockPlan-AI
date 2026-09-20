/**
 * Gantt Adapter — Maps backend BlockPlanResponse to GanttPlanViewModel.
 *
 * Responsibilities:
 *  - Groups scheduled task assignments by window_id to form Gantt blocks.
 *  - Calculates timing offsets, task durations, and multi-department joint blocks.
 *  - Identifies shared blocks (tasks from >= 2 distinct departments in the same window).
 *  - Separates scheduled from unscheduled assignments.
 *  - Groups blocks by corridor for row-based Gantt rendering.
 *  - Preserves exact backend IDs, statuses, departments, and criticality scores.
 *  - NEVER invents synthetic assignments or recomputes optimization results.
 */

import type { Weekday } from '../api/types/enums';
import type { BlockPlanResponse, PlanAssignmentResponse } from '../api/types/models';
import {
  formatAssignmentStatus,
  formatCriticalityScore,
  formatDefectSeverity,
  formatDepartment,
  formatDuration,
  formatHorizonType,
  formatIsoDate,
  formatPlanId,
  formatPlanStatus,
  formatTaskId,
  formatWeekday,
  getCriticalityBadge,
  getCriticalityLevel,
  getDepartmentColor,
  getDepartmentShort,
} from './formatters';
import { adaptKpi } from './kpiAdapter';
import { adaptPlanAssignment } from './planAdapter';
import type {
  GanttBlockViewModel,
  GanttCorridorRowViewModel,
  GanttPlanViewModel,
  GanttTaskItemViewModel,
  PlanAssignmentViewModel,
} from './types';
import { formatWindowId } from './windowAdapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adaptGanttTaskItem(
  dto: PlanAssignmentResponse,
  startOffsetMinutes: number,
  availableDurationMinutes: number,
): GanttTaskItemViewModel {
  const durationHours = dto.estimated_hours;
  const durationMinutes = Math.round(durationHours * 60);
  const widthPercentage =
    availableDurationMinutes > 0
      ? Math.max(2, (durationMinutes / availableDurationMinutes) * 100)
      : 100;
  const leftOffsetPercentage =
    availableDurationMinutes > 0
      ? (startOffsetMinutes / availableDurationMinutes) * 100
      : 0;

  return {
    taskId: dto.task_id,
    formattedTaskId: formatTaskId(dto.task_id),
    department: dto.department,
    departmentDisplay: formatDepartment(dto.department),
    departmentShort: getDepartmentShort(dto.department),
    departmentColor: getDepartmentColor(dto.department),
    durationHours,
    durationMinutes,
    durationFormatted: formatDuration(durationHours),
    criticalityScore: dto.criticality_score,
    criticalityScoreFormatted: formatCriticalityScore(dto.criticality_score),
    criticalityLevel: getCriticalityLevel(dto.criticality_score),
    criticalityBadge: getCriticalityBadge(dto.criticality_score),
    defectSeverity: dto.defect_severity,
    defectSeverityDisplay: formatDefectSeverity(dto.defect_severity),
    status: dto.status,
    statusDisplay: formatAssignmentStatus(dto.status),
    startOffsetMinutes,
    widthPercentage,
    leftOffsetPercentage,
    raw: dto,
  };
}

// ---------------------------------------------------------------------------
// Main Adapter Function
// ---------------------------------------------------------------------------

/**
 * Adapt a backend BlockPlanResponse into a complete GanttPlanViewModel.
 */
export function adaptBlockPlanToGantt(dto: BlockPlanResponse): GanttPlanViewModel {
  const scheduledRaw: PlanAssignmentResponse[] = [];
  const unscheduledRaw: PlanAssignmentResponse[] = [];

  for (const a of dto.assignments ?? []) {
    if (a.window_id === null || a.window_id === undefined || a.status === 'unscheduled') {
      unscheduledRaw.push(a);
    } else {
      scheduledRaw.push(a);
    }
  }

  // Group scheduled assignments by window_id
  const windowMap = new Map<number, PlanAssignmentResponse[]>();
  for (const a of scheduledRaw) {
    const existing = windowMap.get(a.window_id!) ?? [];
    existing.push(a);
    windowMap.set(a.window_id!, existing);
  }

  const blocks: GanttBlockViewModel[] = [];

  for (const [windowId, assignments] of windowMap.entries()) {
    const first = assignments[0]!;
    const corridorId = first.corridor_id;
    const day: Weekday = first.day ?? 'Mon';

    const totalDurationHours = assignments.reduce(
      (sum, item) => sum + (item.estimated_hours ?? 0),
      0,
    );
    const totalDurationMinutes = Math.round(totalDurationHours * 60);

    // Floor window capacity at totalDurationHours or minimum 4h
    const availableHours = Math.max(4.0, totalDurationHours);
    const availableDurationMinutes = Math.round(availableHours * 60);

    const utilizationPercent =
      availableHours > 0
        ? Math.min(100, (totalDurationHours / availableHours) * 100)
        : 0;
    const utilizationFormatted = `${utilizationPercent.toFixed(1)}%`;

    const departments = Array.from(new Set(assignments.map((a) => a.department)));
    const departmentDisplays = departments.map(formatDepartment);
    const isShared = departments.length > 1;

    // Sequence tasks inside the window
    let offsetAcc = 0;
    const taskItems: GanttTaskItemViewModel[] = [];
    for (const item of assignments) {
      const taskItem = adaptGanttTaskItem(item, offsetAcc, availableDurationMinutes);
      taskItems.push(taskItem);
      offsetAcc += taskItem.durationMinutes;
    }

    const formattedWinId = formatWindowId(windowId);
    blocks.push({
      blockId: formattedWinId,
      windowId,
      formattedWindowId: formattedWinId,
      corridorId,
      day,
      dayDisplay: formatWeekday(day),
      tasks: taskItems,
      departments,
      departmentDisplays,
      totalDurationMinutes,
      totalDurationHours,
      availableHours,
      availableDurationMinutes,
      utilizationPercent,
      utilizationFormatted,
      isShared,
      startTimeDisplay: '08:00',
      endTimeDisplay: `${Math.floor(8 + availableHours).toString().padStart(2, '0')}:00`,
    });
  }

  // Group blocks by corridor
  const corridorMap = new Map<string, GanttBlockViewModel[]>();
  for (const b of blocks) {
    const existing = corridorMap.get(b.corridorId) ?? [];
    existing.push(b);
    corridorMap.set(b.corridorId, existing);
  }

  const corridorRows: GanttCorridorRowViewModel[] = Array.from(
    corridorMap.entries(),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([corridorId, corBlocks]) => ({
      corridorId,
      blocks: corBlocks.sort((x, y) => x.windowId - y.windowId),
    }));

  const scheduledAssignments: PlanAssignmentViewModel[] = scheduledRaw.map(adaptPlanAssignment);
  const unscheduledAssignments: PlanAssignmentViewModel[] = unscheduledRaw.map(adaptPlanAssignment);

  return {
    planId: dto.plan_id,
    formattedPlanId: formatPlanId(dto.plan_id),
    status: dto.status,
    statusDisplay: formatPlanStatus(dto.status),
    isReady: dto.status === 'ready',
    isGenerating: dto.status === 'generating' || dto.status === 'pending',
    isFailed: dto.status === 'failed',
    horizonType: dto.horizon_type,
    horizonTypeDisplay: formatHorizonType(dto.horizon_type),
    horizonDateRangeFormatted: `${formatIsoDate(dto.horizon_start)} → ${formatIsoDate(dto.horizon_end)}`,
    corridorRows,
    blocks,
    scheduledAssignments,
    unscheduledAssignments,
    totalScheduledTasks: scheduledAssignments.length,
    totalUnscheduledTasks: unscheduledAssignments.length,
    kpis: dto.kpis ? adaptKpi(dto.kpis) : null,
    raw: dto,
  };
}
