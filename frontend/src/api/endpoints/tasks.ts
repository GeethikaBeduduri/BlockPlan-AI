/**
 * Task API functions.
 *
 * Backend source: app/routers/tasks.py
 * Endpoints consumed:
 *   GET  /tasks               → MaintenanceTaskListResponse
 *   GET  /tasks/unscheduled   → MaintenanceTaskListResponse
 *   GET  /tasks/{task_id}     → MaintenanceTaskResponse
 *
 * Rules:
 *   - All functions go through the shared apiClient.
 *   - Query parameters are serialised by axios; undefined values are omitted.
 *   - No mock data, no fallbacks, no invented response fields.
 */

import { apiClient } from '../client';
import type {
  MaintenanceTaskListResponse,
  MaintenanceTaskResponse,
  TaskListParams,
  UnscheduledTaskParams,
} from '../types';

// ---------------------------------------------------------------------------
// GET /tasks
// ---------------------------------------------------------------------------

/**
 * List maintenance tasks with optional filtering and pagination.
 *
 * @param params – filter/pagination query params (all optional)
 * @returns paginated list of MaintenanceTaskResponse plus PageMeta
 */
export async function getTasks(
  params?: TaskListParams,
): Promise<MaintenanceTaskListResponse> {
  const response = await apiClient.get<MaintenanceTaskListResponse>('/tasks', {
    params,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// GET /tasks/unscheduled
// Note: /tasks/unscheduled MUST be registered before /tasks/{task_id} in the
// router (it already is in the backend). The frontend simply calls the correct
// URL path — no routing ambiguity.
// ---------------------------------------------------------------------------

/**
 * List tasks that have not yet been assigned to any block window.
 *
 * @param params – optional plan/corridor/criticality filter + pagination
 * @returns paginated list of MaintenanceTaskResponse plus PageMeta
 */
export async function getUnscheduledTasks(
  params?: UnscheduledTaskParams,
): Promise<MaintenanceTaskListResponse> {
  const response = await apiClient.get<MaintenanceTaskListResponse>(
    '/tasks/unscheduled',
    { params },
  );
  return response.data;
}

// ---------------------------------------------------------------------------
// GET /tasks/{task_id}
// ---------------------------------------------------------------------------

/**
 * Fetch a single maintenance task by its positive-integer ID.
 *
 * @param taskId – positive integer (backend validates > 0)
 * @returns MaintenanceTaskResponse
 * @throws ApiError with code "not_found" if the task does not exist
 */
export async function getTaskById(taskId: number): Promise<MaintenanceTaskResponse> {
  const response = await apiClient.get<MaintenanceTaskResponse>(`/tasks/${taskId}`);
  return response.data;
}
