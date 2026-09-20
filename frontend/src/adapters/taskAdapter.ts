/**
 * Task Data Adapters.
 *
 * Converts MaintenanceTaskResponse and MaintenanceTaskListResponse API DTOs
 * into TaskViewModel and TaskListViewModel without modifying original values.
 */

import type {
  MaintenanceTaskListResponse,
  MaintenanceTaskResponse,
} from '../api/types';
import {
  formatCriticalityScore,
  formatDefectSeverity,
  formatDepartment,
  formatDuration,
  formatIsoDateTime,
  formatTaskId,
  formatTaskStatus,
  getCriticalityBadge,
  getCriticalityLevel,
  getDepartmentColor,
  getDepartmentShort,
  parseIsoDate,
} from './formatters';
import type { TaskListViewModel, TaskViewModel } from './types';

/**
 * Adapt a single maintenance task DTO to a TaskViewModel.
 */
export function adaptTask(dto: MaintenanceTaskResponse): TaskViewModel {
  const estimatedHours = dto.estimated_hours;
  const estimatedMinutes = Math.round(estimatedHours * 60);

  return {
    id: dto.task_id,
    formattedId: formatTaskId(dto.task_id),
    corridorId: dto.corridor_id,
    department: dto.department,
    departmentDisplay: formatDepartment(dto.department),
    departmentShort: getDepartmentShort(dto.department),
    departmentColor: getDepartmentColor(dto.department),
    defectSeverity: dto.defect_severity,
    defectSeverityDisplay: formatDefectSeverity(dto.defect_severity),
    daysOverdue: dto.days_overdue,
    isOverdue: dto.days_overdue > 0,
    estimatedHours,
    estimatedMinutes,
    estimatedDurationFormatted: formatDuration(estimatedHours),
    assetAgeYears: dto.asset_age_years,
    status: dto.status,
    statusDisplay: formatTaskStatus(dto.status),
    criticalityScore: dto.criticality_score,
    criticalityScoreFormatted: formatCriticalityScore(dto.criticality_score),
    criticalityLevel: getCriticalityLevel(dto.criticality_score),
    criticalityBadge: getCriticalityBadge(dto.criticality_score),
    createdAt: parseIsoDate(dto.created_at),
    createdAtFormatted: formatIsoDateTime(dto.created_at),
    updatedAt: parseIsoDate(dto.updated_at),
    raw: dto,
  };
}

/**
 * Adapt a paginated maintenance task list DTO to a TaskListViewModel.
 */
export function adaptTaskList(dto: MaintenanceTaskListResponse): TaskListViewModel {
  const limit = dto.meta.limit;
  const offset = dto.meta.offset;
  const total = dto.meta.total;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasMore = offset + limit < total;

  return {
    items: dto.items.map(adaptTask),
    total,
    limit,
    offset,
    page,
    totalPages,
    hasMore,
  };
}
