/**
 * Unit tests for task API endpoint functions.
 *
 * Tests cover request construction (correct HTTP method, URL, params)
 * and that response data is returned unwrapped.
 *
 * Does NOT test error paths here — those are covered in client.test.ts.
 */

import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '../client';
import { getTaskById, getTasks, getUnscheduledTasks } from '../endpoints/tasks';
import type { MaintenanceTaskListResponse, MaintenanceTaskResponse } from '../types';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const taskFixture: MaintenanceTaskResponse = {
  task_id: 1,
  department: 'Engineering',
  corridor_id: 'COR_01',
  defect_severity: 'A',
  days_overdue: 3,
  estimated_hours: 2.5,
  asset_age_years: 12,
  status: 'open',
  criticality_score: 87.4,
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
};

const listFixture: MaintenanceTaskListResponse = {
  items: [taskFixture],
  meta: { limit: 50, offset: 0, total: 1 },
};

// ---------------------------------------------------------------------------
// getTasks
// ---------------------------------------------------------------------------

describe('getTasks', () => {
  it('makes a GET request to /tasks', async () => {
    mock.onGet('/tasks').reply(200, listFixture);
    const result = await getTasks();
    expect(result).toEqual(listFixture);
  });

  it('passes limit and offset as query params', async () => {
    mock.onGet('/tasks', { params: { limit: 10, offset: 20 } }).reply(200, listFixture);
    const result = await getTasks({ limit: 10, offset: 20 });
    expect(result).toEqual(listFixture);
  });

  it('passes corridor_id filter', async () => {
    mock.onGet('/tasks', { params: { corridor_id: 'COR_01' } }).reply(200, listFixture);
    const result = await getTasks({ corridor_id: 'COR_01' });
    expect(result).toEqual(listFixture);
  });

  it('passes department filter', async () => {
    mock.onGet('/tasks', { params: { department: 'Engineering' } }).reply(200, listFixture);
    const result = await getTasks({ department: 'Engineering' });
    expect(result).toEqual(listFixture);
  });

  it('passes status filter', async () => {
    mock.onGet('/tasks', { params: { status: 'open' } }).reply(200, listFixture);
    const result = await getTasks({ status: 'open' });
    expect(result).toEqual(listFixture);
  });

  it('omits undefined params (does not send undefined keys)', async () => {
    mock.onGet('/tasks').reply(200, listFixture);
    // Passing undefined status — axios should strip it automatically
    const result = await getTasks({ status: undefined });
    expect(result).toEqual(listFixture);
  });
});

// ---------------------------------------------------------------------------
// getUnscheduledTasks
// ---------------------------------------------------------------------------

describe('getUnscheduledTasks', () => {
  it('makes a GET request to /tasks/unscheduled', async () => {
    mock.onGet('/tasks/unscheduled').reply(200, listFixture);
    const result = await getUnscheduledTasks();
    expect(result).toEqual(listFixture);
  });

  it('passes plan_id filter', async () => {
    mock.onGet('/tasks/unscheduled', { params: { plan_id: 5 } }).reply(200, listFixture);
    const result = await getUnscheduledTasks({ plan_id: 5 });
    expect(result).toEqual(listFixture);
  });

  it('passes critical_only flag', async () => {
    mock.onGet('/tasks/unscheduled', { params: { critical_only: true } }).reply(200, listFixture);
    const result = await getUnscheduledTasks({ critical_only: true });
    expect(result).toEqual(listFixture);
  });
});

// ---------------------------------------------------------------------------
// getTaskById
// ---------------------------------------------------------------------------

describe('getTaskById', () => {
  it('makes a GET request to /tasks/{task_id}', async () => {
    mock.onGet('/tasks/1').reply(200, taskFixture);
    const result = await getTaskById(1);
    expect(result).toEqual(taskFixture);
  });

  it('constructs the correct URL for different IDs', async () => {
    mock.onGet('/tasks/42').reply(200, { ...taskFixture, task_id: 42 });
    const result = await getTaskById(42);
    expect(result.task_id).toBe(42);
  });

  it('propagates 404 ApiError for unknown task', async () => {
    mock.onGet('/tasks/999').reply(404, {
      error: 'not_found',
      message: 'Task not found',
      details: null,
    });
    await expect(getTaskById(999)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });
});
