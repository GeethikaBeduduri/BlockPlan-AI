/**
 * Unit tests for override and KPI API endpoint functions.
 *
 * Tests cover:
 *   - updatePlanOverride: PUT /plan/{plan_id}/override
 *   - getAvailabilityKpi: GET /kpis/availability
 *   - getUtilizationKpi: GET /kpis/utilization
 *   - getCriticalTasksKpi: GET /kpis/critical-tasks
 */

import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '../client';
import { getCriticalTasksKpi, getAvailabilityKpi, getUtilizationKpi } from '../endpoints/kpis';
import { updatePlanOverride } from '../endpoints/overrides';
import type {
  CriticalTasksKpiResponse,
  KpiResponse,
  PlannerOverrideCreate,
  PlannerOverrideResponse,
} from '../types';

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

const kpiFixture: KpiResponse = {
  plan_id: 7,
  horizon_type: 'weekly',
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  corridor_id: null,
  department: null,
  total_tasks: 20,
  scheduled_tasks: 16,
  unscheduled_tasks: 4,
  critical_unscheduled_tasks: 1,
  asset_availability_percent: 80.0,
  scheduled_hours: 32.0,
  available_window_hours: 40.0,
  block_utilization_percent: 80.0,
  plan_generation_seconds: 5.2,
};

const overrideResponseFixture: PlannerOverrideResponse = {
  override_id: 1,
  plan_id: 7,
  task_id: 3,
  action: 'reassign',
  target_window_id: 5,
  reason: 'Higher priority task requires this window slot.',
  overridden_by: null,
  overridden_at: '2026-08-29T09:00:00Z',
};

const criticalTasksFixture: CriticalTasksKpiResponse = {
  items: [
    {
      plan_id: 7,
      task_id: 3,
      department: 'Engineering',
      corridor_id: 'COR_01',
      defect_severity: 'A',
      days_overdue: 5,
      estimated_hours: 3.0,
      criticality_score: 92.0,
      status: 'unscheduled',
    },
  ],
  meta: { limit: 50, offset: 0, total: 1 },
};

// ---------------------------------------------------------------------------
// updatePlanOverride
// ---------------------------------------------------------------------------

describe('updatePlanOverride', () => {
  it('makes a PUT request to /plan/{plan_id}/override', async () => {
    mock.onPut('/plan/7/override').reply(200, overrideResponseFixture);
    const payload: PlannerOverrideCreate = {
      plan_id: 7,
      task_id: 3,
      action: 'reassign',
      target_window_id: 5,
      reason: 'Higher priority task requires this window slot.',
    };
    const result = await updatePlanOverride(7, payload);
    expect(result).toEqual(overrideResponseFixture);
  });

  it('sends the payload body correctly', async () => {
    let capturedBody: unknown;
    mock.onPut('/plan/7/override').reply((config) => {
      capturedBody = JSON.parse(config.data as string);
      return [200, overrideResponseFixture];
    });
    const payload: PlannerOverrideCreate = {
      plan_id: 7,
      task_id: 3,
      action: 'reassign',
      target_window_id: 5,
      reason: 'Higher priority task requires this window slot.',
    };
    await updatePlanOverride(7, payload);
    expect(capturedBody).toMatchObject({
      plan_id: 7,
      task_id: 3,
      action: 'reassign',
      target_window_id: 5,
    });
  });

  it('constructs the correct URL for different plan IDs', async () => {
    mock.onPut('/plan/42/override').reply(200, { ...overrideResponseFixture, plan_id: 42 });
    const result = await updatePlanOverride(42, {
      plan_id: 42,
      task_id: 3,
      action: 'unschedule',
      reason: 'Resource unavailable for the planned window.',
    });
    expect(result.plan_id).toBe(42);
  });

  it('propagates override_rejected error (400)', async () => {
    mock.onPut('/plan/7/override').reply(400, {
      error: 'override_rejected',
      message: 'reassign requires target_window_id',
      details: null,
    });
    await expect(
      updatePlanOverride(7, {
        plan_id: 7,
        task_id: 3,
        action: 'reassign',
        reason: 'Trying without window ID.',
      }),
    ).rejects.toMatchObject({
      code: 'override_rejected',
      status: 400,
    });
  });
});

// ---------------------------------------------------------------------------
// getAvailabilityKpi
// ---------------------------------------------------------------------------

describe('getAvailabilityKpi', () => {
  it('makes a GET request to /kpis/availability', async () => {
    mock.onGet('/kpis/availability').reply(200, kpiFixture);
    const result = await getAvailabilityKpi();
    expect(result).toEqual(kpiFixture);
  });

  it('passes plan_id as query param', async () => {
    mock.onGet('/kpis/availability', { params: { plan_id: 7 } }).reply(200, kpiFixture);
    const result = await getAvailabilityKpi({ plan_id: 7 });
    expect(result.plan_id).toBe(7);
  });

  it('passes corridor_id filter', async () => {
    mock.onGet('/kpis/availability', { params: { corridor_id: 'COR_01' } }).reply(200, kpiFixture);
    const result = await getAvailabilityKpi({ corridor_id: 'COR_01' });
    expect(result).toEqual(kpiFixture);
  });

  it('propagates 503 dependency_not_ready error', async () => {
    mock.onGet('/kpis/availability').reply(503, {
      error: 'dependency_not_ready',
      message: 'Persistence layer not ready',
      details: null,
    });
    await expect(getAvailabilityKpi()).rejects.toMatchObject({
      code: 'dependency_not_ready',
      status: 503,
    });
  });
});

// ---------------------------------------------------------------------------
// getUtilizationKpi
// ---------------------------------------------------------------------------

describe('getUtilizationKpi', () => {
  it('makes a GET request to /kpis/utilization', async () => {
    mock.onGet('/kpis/utilization').reply(200, kpiFixture);
    const result = await getUtilizationKpi();
    expect(result).toEqual(kpiFixture);
  });

  it('passes horizon_type filter', async () => {
    mock.onGet('/kpis/utilization', { params: { horizon_type: 'weekly' } }).reply(200, kpiFixture);
    const result = await getUtilizationKpi({ horizon_type: 'weekly' });
    expect(result).toEqual(kpiFixture);
  });

  it('propagates 503 error', async () => {
    mock.onGet('/kpis/utilization').reply(503, {
      error: 'dependency_not_ready',
      message: 'Persistence layer not ready',
      details: null,
    });
    await expect(getUtilizationKpi()).rejects.toMatchObject({
      code: 'dependency_not_ready',
    });
  });
});

// ---------------------------------------------------------------------------
// getCriticalTasksKpi
// ---------------------------------------------------------------------------

describe('getCriticalTasksKpi', () => {
  it('makes a GET request to /kpis/critical-tasks', async () => {
    mock.onGet('/kpis/critical-tasks').reply(200, criticalTasksFixture);
    const result = await getCriticalTasksKpi();
    expect(result).toEqual(criticalTasksFixture);
  });

  it('passes limit and offset', async () => {
    mock
      .onGet('/kpis/critical-tasks', { params: { limit: 10, offset: 0 } })
      .reply(200, criticalTasksFixture);
    const result = await getCriticalTasksKpi({ limit: 10, offset: 0 });
    expect(result.items).toHaveLength(1);
  });

  it('returns items and meta', async () => {
    mock.onGet('/kpis/critical-tasks').reply(200, criticalTasksFixture);
    const result = await getCriticalTasksKpi();
    expect(result.meta.total).toBe(1);
    expect(result.items[0].defect_severity).toBe('A');
  });

  it('propagates 503 error', async () => {
    mock.onGet('/kpis/critical-tasks').reply(503, {
      error: 'dependency_not_ready',
      message: 'Persistence layer not ready',
      details: null,
    });
    await expect(getCriticalTasksKpi()).rejects.toMatchObject({
      code: 'dependency_not_ready',
      status: 503,
    });
  });
});
