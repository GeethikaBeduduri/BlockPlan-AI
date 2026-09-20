/**
 * Tests for usePlanPolling hook.
 *
 * Covers:
 *  - pending → ready (happy path)
 *  - pending → failed
 *  - superseded terminal state
 *  - timeout
 *  - explicit cancellation / stop()
 *  - polling cleanup on unmount
 *  - network failure (transient, keeps polling)
 *  - duplicate start() prevention
 *
 * Uses:
 *  - @testing-library/react renderHook + act
 *  - axios-mock-adapter for mocking GET /plan/{id}
 *  - vi.useFakeTimers() to control setInterval / setTimeout
 */

import { act, renderHook } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../api/client';
import type { BlockPlanResponse } from '../../api/types/models';
import {
  DEFAULT_POLL_INTERVAL_MS,
  isTerminalStatus,
  usePlanPolling,
} from '../../hooks/usePlanPolling';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PLAN: Omit<BlockPlanResponse, 'status'> = {
  plan_id: 99,
  horizon_type: 'weekly',
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  assignments: [],
  kpis: null,
  generated_at: null,
  created_at: '2026-08-25T00:00:00Z',
  updated_at: '2026-08-25T00:00:00Z',
};

const pendingPlan   = (): BlockPlanResponse => ({ ...BASE_PLAN, status: 'pending' });
const generatingPlan = (): BlockPlanResponse => ({ ...BASE_PLAN, status: 'generating' });
const readyPlan     = (): BlockPlanResponse => ({ ...BASE_PLAN, status: 'ready' });
const failedPlan    = (): BlockPlanResponse => ({ ...BASE_PLAN, status: 'failed' });
const supersededPlan = (): BlockPlanResponse => ({ ...BASE_PLAN, status: 'superseded' });

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
  vi.useFakeTimers();
});

afterEach(() => {
  mock.restore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Advance time by N polling ticks and flush pending promises. */
async function advanceTicks(n = 1) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_POLL_INTERVAL_MS);
      await Promise.resolve(); // flush microtasks
    });
  }
}

// ---------------------------------------------------------------------------
// isTerminalStatus unit tests
// ---------------------------------------------------------------------------

describe('isTerminalStatus', () => {
  it('returns true for ready', () => expect(isTerminalStatus('ready')).toBe(true));
  it('returns true for failed', () => expect(isTerminalStatus('failed')).toBe(true));
  it('returns true for superseded', () => expect(isTerminalStatus('superseded')).toBe(true));
  it('returns false for pending', () => expect(isTerminalStatus('pending')).toBe(false));
  it('returns false for generating', () => expect(isTerminalStatus('generating')).toBe(false));
});

// ---------------------------------------------------------------------------
// usePlanPolling — happy path: pending → ready
// ---------------------------------------------------------------------------

describe('usePlanPolling — pending → ready', () => {
  it('returns null plan initially', () => {
    const { result } = renderHook(() => usePlanPolling());
    expect(result.current.plan).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.isPolling).toBe(false);
  });

  it('fetches immediately on start() and shows pending status', async () => {
    mock.onGet('/plan/99').replyOnce(200, pendingPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.isPolling).toBe(true);
    expect(result.current.plan).not.toBeNull();
  });

  it('transitions to ready and stops polling', async () => {
    mock
      .onGet('/plan/99').replyOnce(200, pendingPlan())
      .onGet('/plan/99').replyOnce(200, generatingPlan())
      .onGet('/plan/99').replyOnce(200, readyPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    expect(result.current.status).toBe('pending');

    // Tick 2
    await advanceTicks(1);
    expect(result.current.status).toBe('generating');
    expect(result.current.isPolling).toBe(true);

    // Tick 3 → ready (terminal)
    await advanceTicks(1);
    expect(result.current.status).toBe('ready');
    expect(result.current.isPolling).toBe(false);
    expect(result.current.stopReason).toBe('ready');
    expect(result.current.plan?.planId).toBe(99);
    expect(result.current.error).toBeNull();
  });

  it('isGenerating is true while pending or generating', async () => {
    mock
      .onGet('/plan/99').replyOnce(200, pendingPlan())
      .onGet('/plan/99').replyOnce(200, generatingPlan())
      .onGet('/plan/99').replyOnce(200, readyPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });
    expect(result.current.isGenerating).toBe(true);

    await advanceTicks(1);
    expect(result.current.isGenerating).toBe(true);

    await advanceTicks(1);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.status).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// pending → failed
// ---------------------------------------------------------------------------

describe('usePlanPolling — pending → failed', () => {
  it('stops on failed status and sets error', async () => {
    mock
      .onGet('/plan/99').replyOnce(200, pendingPlan())
      .onGet('/plan/99').replyOnce(200, failedPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    await advanceTicks(1);

    expect(result.current.status).toBe('failed');
    expect(result.current.isPolling).toBe(false);
    expect(result.current.stopReason).toBe('failed');
    expect(result.current.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// superseded terminal state
// ---------------------------------------------------------------------------

describe('usePlanPolling — superseded', () => {
  it('stops and sets stopReason to superseded', async () => {
    mock
      .onGet('/plan/99').replyOnce(200, pendingPlan())
      .onGet('/plan/99').replyOnce(200, supersededPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    await advanceTicks(1);

    expect(result.current.status).toBe('superseded');
    expect(result.current.stopReason).toBe('superseded');
    expect(result.current.isPolling).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('usePlanPolling — timeout', () => {
  it('stops with stopReason timeout when deadline exceeded', async () => {
    // Always return pending — never terminal
    mock.onGet('/plan/99').reply(200, pendingPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99, { intervalMs: DEFAULT_POLL_INTERVAL_MS, timeoutMs: 6_000 });
      await Promise.resolve();
    });

    expect(result.current.isPolling).toBe(true);

    // Advance past the 6 000 ms timeout
    await act(async () => {
      vi.advanceTimersByTime(7_000);
      await Promise.resolve();
    });

    expect(result.current.isPolling).toBe(false);
    expect(result.current.stopReason).toBe('timeout');
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.code).toBe('polling_timeout');
  });
});

// ---------------------------------------------------------------------------
// Explicit cancellation / stop()
// ---------------------------------------------------------------------------

describe('usePlanPolling — cancellation', () => {
  it('stop() immediately marks isPolling false and stopReason = cancelled', async () => {
    mock.onGet('/plan/99').reply(200, pendingPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    expect(result.current.isPolling).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.isPolling).toBe(false);
    expect(result.current.stopReason).toBe('cancelled');
  });

  it('does not make new requests after stop()', async () => {
    let callCount = 0;
    mock.onGet('/plan/99').reply(() => {
      callCount++;
      return [200, pendingPlan()];
    });

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    act(() => {
      result.current.stop();
    });

    const countAtStop = callCount;

    // Advance several ticks — no more requests should be made
    await advanceTicks(3);
    expect(callCount).toBe(countAtStop);
  });
});

// ---------------------------------------------------------------------------
// Polling cleanup on unmount
// ---------------------------------------------------------------------------

describe('usePlanPolling — unmount cleanup', () => {
  it('clears the interval when the component unmounts', async () => {
    mock.onGet('/plan/99').reply(200, pendingPlan());

    const { result, unmount } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    expect(result.current.isPolling).toBe(true);

    // Unmount mid-poll — should not throw and should clear timers
    act(() => {
      unmount();
    });

    // Advancing time after unmount should not cause state update errors
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    // No assertion needed — the test passes if there are no "state update after unmount" errors
  });
});

// ---------------------------------------------------------------------------
// Network failure (transient)
// ---------------------------------------------------------------------------

describe('usePlanPolling — network failure', () => {
  it('sets error on network failure but keeps polling', async () => {
    mock
      .onGet('/plan/99').networkErrorOnce()    // tick 1: network error
      .onGet('/plan/99').replyOnce(200, readyPlan()); // tick 2: recovers

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    // After first (failed) immediate call
    expect(result.current.error).not.toBeNull();
    expect(result.current.isPolling).toBe(true); // still polling

    // Tick 2: recovery → ready
    await advanceTicks(1);
    expect(result.current.status).toBe('ready');
    expect(result.current.stopReason).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Duplicate start() prevention
// ---------------------------------------------------------------------------

describe('usePlanPolling — duplicate start prevention', () => {
  it('ignores a second start() call for the same planId while already polling', async () => {
    let callCount = 0;
    mock.onGet('/plan/99').reply(() => {
      callCount++;
      return [200, pendingPlan()];
    });

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    const afterFirst = callCount;

    // Second start() for the same ID — should be ignored
    act(() => {
      result.current.start(99);
    });

    // No immediate extra call from the second start
    expect(callCount).toBe(afterFirst);
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('usePlanPolling — reset()', () => {
  it('clears all state after reset', async () => {
    mock.onGet('/plan/99').reply(200, readyPlan());

    const { result } = renderHook(() => usePlanPolling());

    await act(async () => {
      result.current.start(99);
      await Promise.resolve();
    });

    // Plan becomes ready immediately
    expect(result.current.status).toBe('ready');

    act(() => {
      result.current.reset();
    });

    expect(result.current.plan).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.isPolling).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.stopReason).toBeNull();
  });
});
