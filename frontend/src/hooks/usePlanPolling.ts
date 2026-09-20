/**
 * usePlanPolling — Asynchronous polling hook for GET /plan/{plan_id}.
 *
 * Responsibilities:
 *  - Polls GET /plan/{plan_id} at a configurable interval.
 *  - Maps backend PlanStatus values to UI state.
 *  - Stops automatically on terminal status (ready / failed / superseded).
 *  - Stops on timeout (configurable deadline).
 *  - Cleans up intervals and in-flight requests when:
 *      • the component unmounts
 *      • stop() is called explicitly
 *      • a new planId replaces the previous one
 *  - Prevents multiple concurrent polling loops for the same planId.
 *  - Never fabricates plan data while status is pending/generating.
 *  - Never falls back to local plan-generation logic.
 *
 * BACKEND STATUS VALUES (app/schemas/enums.py – PlanStatus):
 *   pending    – job queued, not yet started
 *   generating – optimizer is running
 *   ready      – plan is fully generated (TERMINAL — stop polling)
 *   failed     – generation failed   (TERMINAL — stop polling)
 *   superseded – replaced by a newer plan (TERMINAL — stop polling)
 *
 * BACKEND IS FROZEN. Do not modify backend code.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlan } from '../api/endpoints/plans';
import { adaptBlockPlan } from '../adapters/planAdapter';
import type { ApiError } from '../api/client';
import type { PlanStatus } from '../api/types/enums';
import type { BlockPlanViewModel } from '../adapters/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to poll GET /plan/{plan_id} in milliseconds. */
export const DEFAULT_POLL_INTERVAL_MS = 3_000;

/** Maximum total duration to poll before declaring a timeout (5 minutes). */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;

/**
 * Backend PlanStatus values that are terminal — polling must stop when any
 * of these is observed.
 */
export const TERMINAL_STATUSES: ReadonlySet<PlanStatus> = new Set([
  'ready',
  'failed',
  'superseded',
]);

/** Returns true when the given status should stop polling. */
export function isTerminalStatus(status: PlanStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PollOptions {
  /** Milliseconds between each GET /plan/{plan_id} call. Default: 3 000 ms. */
  intervalMs?: number;
  /** Maximum milliseconds to poll before timing out. Default: 300 000 ms (5 min). */
  timeoutMs?: number;
}

/** Reason polling stopped. */
export type PollStopReason =
  | 'ready'
  | 'failed'
  | 'superseded'
  | 'timeout'
  | 'cancelled'
  | 'network_error';

export interface UsePlanPollingResult {
  /**
   * The most recently fetched BlockPlanViewModel.
   * Null until the first successful GET /plan/{plan_id} response.
   * NEVER fabricated from local logic.
   */
  plan: BlockPlanViewModel | null;
  /** Live PlanStatus string sourced directly from the backend. Null before first poll. */
  status: PlanStatus | null;
  /** True while polling is actively running. */
  isPolling: boolean;
  /** True iff status === 'generating' || status === 'pending'. */
  isGenerating: boolean;
  /** Last API or timeout error encountered. Null when no error. */
  error: ApiError | { message: string; code: string } | null;
  /** Reason polling stopped. Null while polling is running or not started. */
  stopReason: PollStopReason | null;
  /**
   * Begin polling for the given plan_id.
   * Safe to call multiple times; a running poll for the same planId is a no-op.
   * Starts a fresh poll loop if planId changed.
   */
  start: (planId: number, options?: PollOptions) => void;
  /** Cancel polling immediately. Sets stopReason to 'cancelled'. */
  stop: () => void;
  /** Reset all state to initial values (plan, status, error, stopReason). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function usePlanPolling(): UsePlanPollingResult {
  const [plan, setPlan] = useState<BlockPlanViewModel | null>(null);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<UsePlanPollingResult['error']>(null);
  const [stopReason, setStopReason] = useState<PollStopReason | null>(null);

  // Refs used for lifecycle/cleanup — avoid stale closures in intervals.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePlanIdRef = useRef<number | null>(null);
  const isCancelledRef = useRef(false);
  const isPollingRef = useRef(false);

  // -------------------------------------------------------------------------
  // Cleanup helper — stops all timers and marks polling as inactive.
  // Does NOT alter plan/status/error state.
  // -------------------------------------------------------------------------

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const markStopped = useCallback(
    (reason: PollStopReason) => {
      clearTimers();
      isCancelledRef.current = true;
      isPollingRef.current = false;
      setIsPolling(false);
      setStopReason(reason);
    },
    [clearTimers],
  );

  // -------------------------------------------------------------------------
  // start()
  // -------------------------------------------------------------------------

  const start = useCallback(
    (planId: number, options?: PollOptions) => {
      const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      // If already polling the same plan, do nothing.
      if (isPollingRef.current && activePlanIdRef.current === planId) {
        return;
      }

      // Cancel any prior poll.
      clearTimers();
      isCancelledRef.current = false;
      isPollingRef.current = true;
      activePlanIdRef.current = planId;
      setIsPolling(true);
      setStopReason(null);
      setError(null);

      // -----------------------------------------------------------------------
      // Single-poll function — called on each interval tick.
      // Uses isCancelledRef to detect if the loop was stopped between ticks.
      // -----------------------------------------------------------------------

      const poll = async () => {
        if (isCancelledRef.current) return;

        try {
          const dto = await getPlan(planId);

          // Stale-loop guard: if cancelled while the request was in-flight, discard.
          if (isCancelledRef.current) return;

          const vm = adaptBlockPlan(dto);
          setPlan(vm);
          setStatus(dto.status);

          // Check for terminal state.
          if (isTerminalStatus(dto.status)) {
            const reason: PollStopReason =
              dto.status === 'ready'
                ? 'ready'
                : dto.status === 'superseded'
                ? 'superseded'
                : 'failed';

            if (dto.status === 'failed') {
              setError({ message: 'Plan generation failed on the server.', code: 'plan_generation_failed' });
            }

            markStopped(reason);
          }
        } catch (err) {
          if (isCancelledRef.current) return;

          // Network or 404 error — set error but keep polling unless cancelled.
          // This prevents a transient blip from stopping the loop permanently.
          // However, if the error is persistent, the timeout will eventually fire.
          setError(err as ApiError);
        }
      };

      // Fire immediately for fast feedback, then on each interval.
      void poll();
      intervalRef.current = setInterval(() => {
        void poll();
      }, intervalMs);

      // Global timeout guard.
      timeoutRef.current = setTimeout(() => {
        if (!isCancelledRef.current) {
          setError({ message: `Plan status polling timed out after ${timeoutMs / 1000}s.`, code: 'polling_timeout' });
          markStopped('timeout');
        }
      }, timeoutMs);
    },
    [clearTimers, markStopped],
  );

  // -------------------------------------------------------------------------
  // stop() — explicit cancellation
  // -------------------------------------------------------------------------

  const stop = useCallback(() => {
    if (isPollingRef.current || intervalRef.current || timeoutRef.current) {
      markStopped('cancelled');
    }
  }, [markStopped]);

  // -------------------------------------------------------------------------
  // reset() — clear all state (e.g., to start a new job)
  // -------------------------------------------------------------------------

  const reset = useCallback(() => {
    clearTimers();
    isCancelledRef.current = true;
    isPollingRef.current = false;
    activePlanIdRef.current = null;
    setPlan(null);
    setStatus(null);
    setIsPolling(false);
    setError(null);
    setStopReason(null);
  }, [clearTimers]);

  // -------------------------------------------------------------------------
  // Unmount cleanup — ensures no state updates after component is gone.
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      isCancelledRef.current = true;
      clearTimers();
    };
  }, [clearTimers]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isGenerating = status === 'pending' || status === 'generating';

  return {
    plan,
    status,
    isPolling,
    isGenerating,
    error,
    stopReason,
    start,
    stop,
    reset,
  };
}
