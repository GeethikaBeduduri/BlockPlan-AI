/**
 * KPI API functions.
 *
 * Backend source: app/routers/kpis.py  (prefix: /kpis)
 * Endpoints consumed:
 *   GET /kpis/availability    → KpiResponse
 *   GET /kpis/utilization     → KpiResponse
 *   GET /kpis/critical-tasks  → CriticalTasksKpiResponse
 *
 * Shared query parameters (_kpi_query dependency):
 *   plan_id, corridor_id, department, horizon_type
 *
 * /kpis/critical-tasks additionally accepts:
 *   limit, offset  (pagination, default 50 / 0)
 *
 * IMPORTANT: KPI values (availability, utilization, critical task counts)
 * are computed exclusively by the backend. The frontend MUST NOT calculate,
 * derive, or synthesise these values. Always display what the backend returns.
 *
 * Rules:
 *   - All functions go through the shared apiClient.
 *   - No mock data, no fallbacks, no invented response fields.
 */

import { apiClient } from '../client';
import type {
  CriticalTasksKpiResponse,
  CriticalTasksParams,
  KpiQueryParams,
  KpiResponse,
} from '../types';

// ---------------------------------------------------------------------------
// GET /kpis/availability
// ---------------------------------------------------------------------------

/**
 * Asset availability KPI for a plan or horizon.
 *
 * Prototype formula (computed backend-side): scheduled_tasks / total_tasks * 100
 *
 * @param params – optional plan/corridor/department/horizon filter
 * @returns KpiResponse containing asset_availability_percent and related counts
 */
export async function getAvailabilityKpi(
  params?: KpiQueryParams,
): Promise<KpiResponse> {
  const response = await apiClient.get<KpiResponse>('/kpis/availability', {
    params,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// GET /kpis/utilization
// ---------------------------------------------------------------------------

/**
 * Window utilization KPI for a plan or horizon.
 *
 * Prototype formula (computed backend-side): scheduled_hours / available_window_hours * 100
 *
 * @param params – optional plan/corridor/department/horizon filter
 * @returns KpiResponse containing block_utilization_percent and hour totals
 */
export async function getUtilizationKpi(
  params?: KpiQueryParams,
): Promise<KpiResponse> {
  const response = await apiClient.get<KpiResponse>('/kpis/utilization', {
    params,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// GET /kpis/critical-tasks
// ---------------------------------------------------------------------------

/**
 * Paginated list of unscheduled severity-A tasks for a plan.
 *
 * @param params – optional KPI filters plus pagination (limit/offset)
 * @returns CriticalTasksKpiResponse (items array + PageMeta)
 */
export async function getCriticalTasksKpi(
  params?: CriticalTasksParams,
): Promise<CriticalTasksKpiResponse> {
  const response = await apiClient.get<CriticalTasksKpiResponse>(
    '/kpis/critical-tasks',
    { params },
  );
  return response.data;
}
