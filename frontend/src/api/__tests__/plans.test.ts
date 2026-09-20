/**
 * Unit tests for plan API endpoint functions.
 *
 * Tests cover:
 *   - generatePlan: POST /generate-plan with correct body and 202 response
 *   - getPlan: GET /plan/{plan_id} with correct URL construction
 */

import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '../client';
import { generatePlan, getPlan } from '../endpoints/plans';
import type {
  BlockPlanResponse,
  PlanGenerateRequest,
  PlanJobResponse,
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

const generateRequest: PlanGenerateRequest = {
  horizon_type: 'daily',
  horizon_start: '2026-08-29',
  horizon_end: '2026-08-29',
  corridor_id: 'COR_01',
  department: null,
};

const jobResponseFixture: PlanJobResponse = {
  accepted: true,
  job_id: 'celery-uuid-123',
  plan_id: 7,
  horizon_type: 'daily',
  status: 'pending',
};

const planResponseFixture: BlockPlanResponse = {
  plan_id: 7,
  status: 'ready',
  horizon_type: 'daily',
  horizon_start: '2026-08-29',
  horizon_end: '2026-08-29',
  assignments: [
    {
      task_id: 1,
      window_id: 3,
      corridor_id: 'COR_01',
      department: 'Engineering',
      day: 'Fri',
      estimated_hours: 2.5,
      criticality_score: 87.4,
      defect_severity: 'A',
      status: 'scheduled',
    },
  ],
  kpis: {
    plan_id: 7,
    horizon_type: 'daily',
    horizon_start: '2026-08-29',
    horizon_end: '2026-08-29',
    corridor_id: 'COR_01',
    department: null,
    total_tasks: 10,
    scheduled_tasks: 8,
    unscheduled_tasks: 2,
    critical_unscheduled_tasks: 0,
    asset_availability_percent: 80.0,
    scheduled_hours: 16.0,
    available_window_hours: 20.0,
    block_utilization_percent: 80.0,
    plan_generation_seconds: 3.14,
  },
  generated_at: '2026-08-29T08:00:00Z',
  created_at: '2026-08-29T07:59:00Z',
  updated_at: '2026-08-29T08:00:00Z',
};

// ---------------------------------------------------------------------------
// generatePlan
// ---------------------------------------------------------------------------

describe('generatePlan', () => {
  it('makes a POST to /generate-plan', async () => {
    mock.onPost('/generate-plan').reply(202, jobResponseFixture);
    const result = await generatePlan(generateRequest);
    expect(result).toEqual(jobResponseFixture);
  });

  it('sends the request body as JSON', async () => {
    let capturedBody: unknown;
    mock.onPost('/generate-plan').reply((config) => {
      capturedBody = JSON.parse(config.data as string);
      return [202, jobResponseFixture];
    });
    await generatePlan(generateRequest);
    expect(capturedBody).toMatchObject({
      horizon_type: 'daily',
      horizon_start: '2026-08-29',
      horizon_end: '2026-08-29',
      corridor_id: 'COR_01',
    });
  });

  it('returns accepted=true for a successful job submission', async () => {
    mock.onPost('/generate-plan').reply(202, jobResponseFixture);
    const result = await generatePlan(generateRequest);
    expect(result.accepted).toBe(true);
  });

  it('propagates backend validation errors (422)', async () => {
    mock.onPost('/generate-plan').reply(422, {
      error: 'validation_error',
      message: 'weekly horizon must cover exactly 7 inclusive days',
      details: null,
    });
    await expect(generatePlan(generateRequest)).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
    });
  });
});

// ---------------------------------------------------------------------------
// getPlan
// ---------------------------------------------------------------------------

describe('getPlan', () => {
  it('makes a GET request to /plan/{plan_id}', async () => {
    mock.onGet('/plan/7').reply(200, planResponseFixture);
    const result = await getPlan(7);
    expect(result).toEqual(planResponseFixture);
  });

  it('returns plan assignments from the backend', async () => {
    mock.onGet('/plan/7').reply(200, planResponseFixture);
    const result = await getPlan(7);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].task_id).toBe(1);
  });

  it('returns embedded KPI data from the backend', async () => {
    mock.onGet('/plan/7').reply(200, planResponseFixture);
    const result = await getPlan(7);
    expect(result.kpis).not.toBeNull();
    expect(result.kpis?.asset_availability_percent).toBe(80.0);
  });

  it('propagates 404 ApiError for missing plan', async () => {
    mock.onGet('/plan/9999').reply(404, {
      error: 'not_found',
      message: 'Plan not found',
      details: null,
    });
    await expect(getPlan(9999)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  it('constructs the correct URL for different plan IDs', async () => {
    mock.onGet('/plan/42').reply(200, { ...planResponseFixture, plan_id: 42 });
    const result = await getPlan(42);
    expect(result.plan_id).toBe(42);
  });
});
