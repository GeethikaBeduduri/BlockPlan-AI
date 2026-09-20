/**
 * KPI Data Adapters.
 *
 * Converts KpiResponse and CriticalTasksKpiResponse API DTOs into
 * KpiViewModel and CriticalTasksKpiViewModel.
 *
 * CRITICAL RULE:
 * KPI percentage values (asset_availability_percent, block_utilization_percent)
 * are NEVER recomputed or derived. They are passed directly from backend DTOs.
 */

import type {
  CriticalTasksKpiResponse,
  KpiResponse,
  UnscheduledCriticalTaskResponse,
} from '../api/types';
import {
  formatCriticalityScore,
  formatDefectSeverity,
  formatDepartment,
  formatDuration,
  formatHorizonType,
  formatTaskId,
  formatTaskStatus,
  getCriticalityBadge,
  getCriticalityLevel,
  getDepartmentColor,
  getDepartmentShort,
  parseIsoDate,
} from './formatters';
import type {
  CriticalTasksKpiViewModel,
  KpiViewModel,
  UnscheduledCriticalTaskViewModel,
} from './types';

/**
 * Adapt a single KpiResponse DTO to KpiViewModel.
 */
export function adaptKpi(dto: KpiResponse): KpiViewModel {
  const planGen = dto.plan_generation_seconds;
  const planGenFormatted =
    planGen !== null && planGen !== undefined ? `${planGen.toFixed(2)}s` : '—';

  return {
    planId: dto.plan_id,
    horizonType: dto.horizon_type,
    horizonTypeDisplay: formatHorizonType(dto.horizon_type),
    horizonStart: parseIsoDate(dto.horizon_start),
    horizonEnd: parseIsoDate(dto.horizon_end),
    corridorId: dto.corridor_id,
    department: dto.department,
    departmentDisplay: dto.department ? formatDepartment(dto.department) : null,
    totalTasks: dto.total_tasks,
    scheduledTasks: dto.scheduled_tasks,
    unscheduledTasks: dto.unscheduled_tasks,
    criticalUnscheduledTasks: dto.critical_unscheduled_tasks,
    assetAvailabilityPercent: dto.asset_availability_percent,
    assetAvailabilityFormatted: `${dto.asset_availability_percent.toFixed(1)}%`,
    scheduledHours: dto.scheduled_hours,
    availableWindowHours: dto.available_window_hours,
    blockUtilizationPercent: dto.block_utilization_percent,
    blockUtilizationFormatted: `${dto.block_utilization_percent.toFixed(1)}%`,
    planGenerationSeconds: planGen,
    planGenerationFormatted: planGenFormatted,
    raw: dto,
  };
}

/**
 * Adapt an UnscheduledCriticalTaskResponse DTO to UnscheduledCriticalTaskViewModel.
 */
export function adaptUnscheduledCriticalTask(
  dto: UnscheduledCriticalTaskResponse,
): UnscheduledCriticalTaskViewModel {
  return {
    planId: dto.plan_id,
    taskId: dto.task_id,
    formattedTaskId: formatTaskId(dto.task_id),
    department: dto.department,
    departmentDisplay: formatDepartment(dto.department),
    departmentShort: getDepartmentShort(dto.department),
    departmentColor: getDepartmentColor(dto.department),
    corridorId: dto.corridor_id,
    defectSeverity: dto.defect_severity,
    defectSeverityDisplay: formatDefectSeverity(dto.defect_severity),
    daysOverdue: dto.days_overdue,
    estimatedHours: dto.estimated_hours,
    estimatedDurationFormatted: formatDuration(dto.estimated_hours),
    criticalityScore: dto.criticality_score,
    criticalityScoreFormatted: formatCriticalityScore(dto.criticality_score),
    criticalityLevel: getCriticalityLevel(dto.criticality_score),
    criticalityBadge: getCriticalityBadge(dto.criticality_score),
    status: dto.status,
    statusDisplay: formatTaskStatus(dto.status),
    raw: dto,
  };
}

/**
 * Adapt a CriticalTasksKpiResponse DTO to CriticalTasksKpiViewModel.
 */
export function adaptCriticalTasksKpi(
  dto: CriticalTasksKpiResponse,
): CriticalTasksKpiViewModel {
  return {
    items: dto.items.map(adaptUnscheduledCriticalTask),
    total: dto.meta.total,
    limit: dto.meta.limit,
    offset: dto.meta.offset,
    raw: dto,
  };
}
