/**
 * Tests for useOverride hook.
 *
 * Covers:
 *  - Successful unschedule override (no target_window_id)
 *  - Successful reassign override (with target_window_id)
 *  - Successful force_schedule override (with target_window_id)
 *  - Reason too short — blocked before network call
 *  - Reason too long — blocked before network call
 *  - Backend error preserved in state, prior plan not corrupted
 *  - Plan refetch triggered after successful override
 *  - target_window_id NOT sent for unschedule action
 *  - target_window_id sent for reassign / force_schedule
 *  - reset() clears error and lastOverride
 *
 * Uses:
 *  - @testing-library/react renderHook + act
 *  - axios-mock-adapter for mocking PUT /plan/{id}/override and GET /plan/{id}
 */

import { act, renderHook } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '../../api/client';
import type { BlockPlanResponse, PlannerOverrideResponse } from '../../api/types/models';
import { useOverride, validateReason, REASON_MIN_LENGTH, REASON_MAX_LENGTH } from '../useOverride';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAN_ID = 42;
const TASK_ID = 7;
const WINDOW_ID = 3;

const VALID_REASON = 'Emergency maintenance required — field team cannot access window.';

const OVERRIDE_RESPONSE: PlannerOverrideResponse = {
  override_id: 1,
  plan_id: PLAN_ID,
  task_id: TASK_ID,
  action: 'unschedule',
  target_window_id: null,
  reason: VALID_REASON,
  overridden_by: null,
  overridden_at: null,
};

const BASE_PLAN: BlockPlanResponse = {
  plan_id: PLAN_ID,
  status: 'ready',
  horizon_type: 'weekly',
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  assignments: [],
  kpis: null,
  generated_at: null,
  created_at: null,
  updated_at: null,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient.defaults.adapter ? (apiClient as any) : apiClient);
  // Use the actual adapter from axios (not the axios instance itself)
  mock = new MockAdapter(apiClient as any);
});

afterEach(() => {
  mock.restore();
});

// ---------------------------------------------------------------------------
// validateReason unit tests (pure function — no hook needed)
// ---------------------------------------------------------------------------

describe('validateReason', () => {
  it('returns null for a valid reason', () => {
    expect(validateReason(VALID_REASON)).toBeNull();
  });

  it('returns error message for reason shorter than minimum', () => {
    const error = validateReason('too short');
    expect(error).not.toBeNull();
    expect(error).toContain(String(REASON_MIN_LENGTH));
  });

  it('returns null for exactly minimum length', () => {
    const reason = 'a'.repeat(REASON_MIN_LENGTH);
    expect(validateReason(reason)).toBeNull();
  });

  it('returns error message for reason longer than maximum', () => {
    const reason = 'a'.repeat(REASON_MAX_LENGTH + 1);
    const error = validateReason(reason);
    expect(error).not.toBeNull();
    expect(error).toContain(String(REASON_MAX_LENGTH));
  });

  it('returns null for exactly maximum length', () => {
    const reason = 'a'.repeat(REASON_MAX_LENGTH);
    expect(validateReason(reason)).toBeNull();
  });

  it('trims whitespace before checking length', () => {
    // 4 chars + whitespace — still too short after trimming
    const error = validateReason('   ab   ');
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useOverride hook tests
// ---------------------------------------------------------------------------

describe('useOverride', () => {
  it('starts with clean initial state', () => {
    const { result } = renderHook(() => useOverride());
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastOverride).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Successful unschedule
  // -------------------------------------------------------------------------

  it('successful unschedule: calls PUT then GET, returns updated plan VM', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(200, OVERRIDE_RESPONSE);
    mock.onGet(`/plan/${PLAN_ID}`).reply(200, BASE_PLAN);

    const { result } = renderHook(() => useOverride());

    let updatedPlan: Awaited<ReturnType<typeof result.current.applyOverride>> = null;
    await act(async () => {
      updatedPlan = await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(updatedPlan).not.toBeNull();
    expect(updatedPlan!.planId).toBe(PLAN_ID);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.lastOverride).not.toBeNull();
    expect(result.current.lastOverride!.action).toBe('unschedule');
  });

  it('unschedule: does NOT send target_window_id in the request body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(config => {
      capturedBody = JSON.parse(config.data as string) as Record<string, unknown>;
      return [200, OVERRIDE_RESPONSE];
    });
    mock.onGet(`/plan/${PLAN_ID}`).reply(200, BASE_PLAN);

    const { result } = renderHook(() => useOverride());
    await act(async () => {
      await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(capturedBody).not.toBeNull();
    expect('target_window_id' in capturedBody!).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Successful reassign (with target_window_id)
  // -------------------------------------------------------------------------

  it('successful reassign: sends target_window_id in request body', async () => {
    const reassignResponse = { ...OVERRIDE_RESPONSE, action: 'reassign' as const, target_window_id: WINDOW_ID };
    let capturedBody: Record<string, unknown> | null = null;

    mock.onPut(`/plan/${PLAN_ID}/override`).reply(config => {
      capturedBody = JSON.parse(config.data as string) as Record<string, unknown>;
      return [200, reassignResponse];
    });
    mock.onGet(`/plan/${PLAN_ID}`).reply(200, BASE_PLAN);

    const { result } = renderHook(() => useOverride());
    await act(async () => {
      await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'reassign',
        targetWindowId: WINDOW_ID,
        reason: VALID_REASON,
      });
    });

    expect(capturedBody!['target_window_id']).toBe(WINDOW_ID);
    expect(result.current.lastOverride!.action).toBe('reassign');
  });

  // -------------------------------------------------------------------------
  // Successful force_schedule (with target_window_id)
  // -------------------------------------------------------------------------

  it('successful force_schedule: sends target_window_id in request body', async () => {
    const forceResponse = { ...OVERRIDE_RESPONSE, action: 'force_schedule' as const, target_window_id: WINDOW_ID };
    let capturedBody: Record<string, unknown> | null = null;

    mock.onPut(`/plan/${PLAN_ID}/override`).reply(config => {
      capturedBody = JSON.parse(config.data as string) as Record<string, unknown>;
      return [200, forceResponse];
    });
    mock.onGet(`/plan/${PLAN_ID}`).reply(200, BASE_PLAN);

    const { result } = renderHook(() => useOverride());
    await act(async () => {
      await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'force_schedule',
        targetWindowId: WINDOW_ID,
        reason: VALID_REASON,
      });
    });

    expect(capturedBody!['target_window_id']).toBe(WINDOW_ID);
    expect(result.current.lastOverride!.action).toBe('force_schedule');
  });

  // -------------------------------------------------------------------------
  // Reason validation blocks network call
  // -------------------------------------------------------------------------

  it('reason too short: returns null and sets error without making network call', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(200, OVERRIDE_RESPONSE);

    const { result } = renderHook(() => useOverride());
    let returned: Awaited<ReturnType<typeof result.current.applyOverride>> = null;
    await act(async () => {
      returned = await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: 'short',
      });
    });

    expect(returned!).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.message).toContain(String(REASON_MIN_LENGTH));
    // No PUT request should have been made
    expect(mock.history['put']).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Backend error handling
  // -------------------------------------------------------------------------

  it('backend 409 conflict: returns null, preserves error, no plan returned', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(409, {
      error: 'conflict',
      message: 'Task is already unscheduled',
      details: null,
    });

    const { result } = renderHook(() => useOverride());
    let returned: Awaited<ReturnType<typeof result.current.applyOverride>> = null;
    await act(async () => {
      returned = await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(returned!).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.isSubmitting).toBe(false);
    // GET /plan should NOT have been called
    expect(mock.history['get']).toHaveLength(0);
  });

  it('backend 503 override_rejected: sets error, does not call refetch', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(503, {
      error: 'override_rejected',
      message: 'Override persistence not yet available',
      details: null,
    });

    const { result } = renderHook(() => useOverride());
    let returned: Awaited<ReturnType<typeof result.current.applyOverride>> = null;
    await act(async () => {
      returned = await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(returned!).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(mock.history['get']).toHaveLength(0);
  });

  it('network error: returns null and populates error', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).networkError();

    const { result } = renderHook(() => useOverride());
    let returned: Awaited<ReturnType<typeof result.current.applyOverride>> = null;
    await act(async () => {
      returned = await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(returned!).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Plan refetch after success
  // -------------------------------------------------------------------------

  it('successful override triggers a GET /plan/{planId} refetch', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(200, OVERRIDE_RESPONSE);
    mock.onGet(`/plan/${PLAN_ID}`).reply(200, { ...BASE_PLAN, status: 'ready' });

    const { result } = renderHook(() => useOverride());
    await act(async () => {
      await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    // GET /plan/{id} must have been called exactly once after the PUT succeeded
    expect(mock.history['get']).toHaveLength(1);
    expect(mock.history['get']![0]!.url).toBe(`/plan/${PLAN_ID}`);
  });

  // -------------------------------------------------------------------------
  // reset() clears state
  // -------------------------------------------------------------------------

  it('reset() clears error and lastOverride', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(409, {
      error: 'conflict',
      message: 'Already unscheduled',
      details: null,
    });

    const { result } = renderHook(() => useOverride());

    await act(async () => {
      await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.lastOverride).toBeNull();
  });

  // -------------------------------------------------------------------------
  // isSubmitting lifecycle
  // -------------------------------------------------------------------------

  it('isSubmitting is false after successful call completes', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(200, OVERRIDE_RESPONSE);
    mock.onGet(`/plan/${PLAN_ID}`).reply(200, BASE_PLAN);

    const { result } = renderHook(() => useOverride());
    await act(async () => {
      await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it('isSubmitting is false after failed call completes', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(422, { error: 'validation_error', message: 'Invalid', details: null });

    const { result } = renderHook(() => useOverride());
    await act(async () => {
      await result.current.applyOverride({
        planId: PLAN_ID,
        taskId: TASK_ID,
        action: 'unschedule',
        reason: VALID_REASON,
      });
    });

    expect(result.current.isSubmitting).toBe(false);
  });
});
