/**
 * Plan API functions.
 *
 * Backend source: app/routers/plans.py
 * Endpoints consumed:
 *   POST /generate-plan       → PlanJobResponse  (HTTP 202 Accepted)
 *   GET  /plan/{plan_id}      → BlockPlanResponse
 *
 * Notes on async generation flow:
 *   POST /generate-plan enqueues a Celery job and returns immediately with
 *   HTTP 202. The response contains a plan_id and a job_id. Callers must
 *   poll GET /plan/{plan_id} until plan.status transitions from
 *   "pending" / "generating" to "ready" or "failed".
 *   The polling logic lives at the component/hook layer, not here.
 *
 * Rules:
 *   - All functions go through the shared apiClient.
 *   - No mock data, no fallbacks, no invented response fields.
 */

import { apiClient } from '../client';
import type {
  BlockPlanResponse,
  PlanGenerateRequest,
  PlanJobResponse,
} from '../types';

// ---------------------------------------------------------------------------
// POST /generate-plan  (HTTP 202 Accepted)
// ---------------------------------------------------------------------------

/**
 * Enqueue an asynchronous block-plan generation job.
 *
 * The backend returns HTTP 202 immediately with a PlanJobResponse containing
 * the job handle. Poll GET /plan/{plan_id} for the completed result.
 *
 * @param request – horizon type/dates and optional corridor/department filter
 * @returns PlanJobResponse with accepted, job_id, plan_id, status
 */
export async function generatePlan(
  request: PlanGenerateRequest,
): Promise<PlanJobResponse> {
  const response = await apiClient.post<PlanJobResponse>(
    '/generate-plan',
    request,
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// GET /plan/{plan_id}
// ---------------------------------------------------------------------------

/**
 * Retrieve a block plan by its ID.
 *
 * @param planId – positive integer plan identifier
 * @returns BlockPlanResponse including assignments and embedded KpiResponse
 * @throws ApiError with code "not_found" if the plan does not exist
 */
export async function getPlan(planId: number): Promise<BlockPlanResponse> {
  const response = await apiClient.get<BlockPlanResponse>(`/plan/${planId}`);
  return response.data;
}
