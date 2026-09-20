/**
 * Planner Override Data Adapters.
 *
 * Converts PlannerOverrideResponse into PlannerOverrideViewModel.
 */

import type { PlannerOverrideResponse } from '../api/types';
import {
  formatIsoDateTime,
  formatOverrideAction,
  formatTaskId,
  formatWindowId,
  parseIsoDate,
} from './formatters';
import type { PlannerOverrideViewModel } from './types';

/**
 * Adapt a PlannerOverrideResponse DTO to PlannerOverrideViewModel.
 */
export function adaptPlannerOverride(
  dto: PlannerOverrideResponse,
): PlannerOverrideViewModel {
  return {
    overrideId: dto.override_id,
    planId: dto.plan_id,
    taskId: dto.task_id,
    formattedTaskId: formatTaskId(dto.task_id),
    action: dto.action,
    actionDisplay: formatOverrideAction(dto.action),
    targetWindowId: dto.target_window_id,
    formattedTargetWindowId: formatWindowId(dto.target_window_id),
    reason: dto.reason,
    overriddenBy: dto.overridden_by,
    overriddenByDisplay: dto.overridden_by ?? 'Chief Controller / Planner',
    overriddenAt: parseIsoDate(dto.overridden_at),
    overriddenAtFormatted: formatIsoDateTime(dto.overridden_at),
    raw: dto,
  };
}
