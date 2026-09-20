/**
 * Plan Data Adapters.
 *
 * Converts BlockPlanResponse, PlanAssignmentResponse, and PlanJobResponse
 * into BlockPlanViewModel, PlanAssignmentViewModel, and PlanJobViewModel.
 */

import type {
  BlockPlanResponse,
  PlanAssignmentResponse,
  PlanJobResponse,
} from '../api/types';
import {
  formatAssignmentStatus,
  formatCriticalityScore,
  formatDefectSeverity,
  formatDepartment,
  formatDuration,
  formatHorizonType,
  formatIsoDate,
  formatIsoDateTime,
  formatPlanId,
  formatPlanStatus,
  formatTaskId,
  formatWeekday,
  formatWindowId,
  getCriticalityBadge,
  getCriticalityLevel,
  getDepartmentColor,
  getDepartmentShort,
  parseIsoDate,
} from './formatters';
import { adaptKpi } from './kpiAdapter';
import type {
  BlockPlanViewModel,
  PlanAssignmentViewModel,
  PlanJobViewModel,
} from './types';

/**
 * Adapt a single PlanAssignmentResponse DTO to PlanAssignmentViewModel.
 */
export function adaptPlanAssignment(
  dto: PlanAssignmentResponse,
): PlanAssignmentViewModel {
  const estimatedHours = dto.estimated_hours;
  const estimatedMinutes = Math.round(estimatedHours * 60);

  return {
    taskId: dto.task_id,
    formattedTaskId: formatTaskId(dto.task_id),
    windowId: dto.window_id,
    formattedWindowId: formatWindowId(dto.window_id),
    corridorId: dto.corridor_id,
    department: dto.department,
    departmentDisplay: formatDepartment(dto.department),
    departmentShort: getDepartmentShort(dto.department),
    departmentColor: getDepartmentColor(dto.department),
    day: dto.day,
    dayDisplay: formatWeekday(dto.day),
    estimatedHours,
    estimatedMinutes,
    estimatedDurationFormatted: formatDuration(estimatedHours),
    criticalityScore: dto.criticality_score,
    criticalityScoreFormatted: formatCriticalityScore(dto.criticality_score),
    criticalityLevel: getCriticalityLevel(dto.criticality_score),
    criticalityBadge: getCriticalityBadge(dto.criticality_score),
    defectSeverity: dto.defect_severity,
    defectSeverityDisplay: formatDefectSeverity(dto.defect_severity),
    status: dto.status,
    statusDisplay: formatAssignmentStatus(dto.status),
    isScheduled: dto.status === 'scheduled' || dto.status === 'overridden',
    isOverridden: dto.status === 'overridden',
    raw: dto,
  };
}

/**
 * Adapt a BlockPlanResponse DTO to BlockPlanViewModel.
 */
export function adaptBlockPlan(dto: BlockPlanResponse): BlockPlanViewModel {
  const startDate = parseIsoDate(dto.horizon_start) ?? new Date();
  const endDate = parseIsoDate(dto.horizon_end) ?? new Date();
  const spanMs = endDate.getTime() - startDate.getTime();
  const horizonSpanDays = Math.max(1, Math.round(spanMs / (1000 * 60 * 60 * 24)) + 1);

  const assignments = dto.assignments.map(adaptPlanAssignment);
  const scheduledAssignments = assignments.filter((a) => a.isScheduled);
  const unscheduledAssignments = assignments.filter((a) => !a.isScheduled);

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
    horizonStart: startDate,
    horizonEnd: endDate,
    horizonSpanDays,
    horizonDateRangeFormatted: `${formatIsoDate(dto.horizon_start)} → ${formatIsoDate(dto.horizon_end)}`,
    assignments,
    scheduledAssignments,
    unscheduledAssignments,
    totalTasksCount: assignments.length,
    scheduledTasksCount: scheduledAssignments.length,
    unscheduledTasksCount: unscheduledAssignments.length,
    kpis: dto.kpis ? adaptKpi(dto.kpis) : null,
    generatedAt: parseIsoDate(dto.generated_at),
    generatedAtFormatted: formatIsoDateTime(dto.generated_at),
    raw: dto,
  };
}

/**
 * Adapt a PlanJobResponse DTO to PlanJobViewModel.
 */
export function adaptPlanJob(dto: PlanJobResponse): PlanJobViewModel {
  return {
    accepted: dto.accepted,
    jobId: dto.job_id,
    planId: dto.plan_id,
    formattedPlanId: formatPlanId(dto.plan_id),
    horizonType: dto.horizon_type,
    status: dto.status,
    statusDisplay: formatPlanStatus(dto.status),
    raw: dto,
  };
}
