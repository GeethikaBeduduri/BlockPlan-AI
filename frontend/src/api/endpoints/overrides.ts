/**
 * Planner override API functions.
 *
 * Backend source: app/routers/overrides.py
 * Endpoint consumed:
 *   PUT /plan/{plan_id}/override  → PlannerOverrideResponse  (HTTP 200)
 *
 * Business rules enforced server-side (do NOT duplicate in frontend):
 *   - reassign / force_schedule → target_window_id is required
 *   - unschedule               → target_window_id must be absent / null
 *   - reason is mandatory (min 10 chars, max 2000 chars) for SIH audit log
 *   - plan_id in URL must match plan_id in request body
 *
 * Rules:
 *   - All functions go through the shared apiClient.
 *   - No mock data, no fallbacks, no invented response fields.
 */

import { apiClient } from '../client';
import type { PlannerOverrideCreate, PlannerOverrideResponse } from '../types';

// ---------------------------------------------------------------------------
// PUT /plan/{plan_id}/override
// ---------------------------------------------------------------------------

/**
 * Apply a planner override to an existing generated plan.
 *
 * @param planId  – positive integer plan ID (must match payload.plan_id)
 * @param payload – override action, task, optional target window, and reason
 * @returns PlannerOverrideResponse with the recorded override details
 * @throws ApiError with code "override_rejected" if the override is invalid
 * @throws ApiError with code "not_found" if the plan does not exist
 */
export async function updatePlanOverride(
  planId: number,
  payload: PlannerOverrideCreate,
): Promise<PlannerOverrideResponse> {
  const response = await apiClient.put<PlannerOverrideResponse>(
    `/plan/${planId}/override`,
    payload,
  );
  return response.data;
}
