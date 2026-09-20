/**
 * useOverride — React hook for applying planner overrides via the real backend.
 *
 * Endpoint: PUT /plan/{plan_id}/override  (HTTP 200)
 * Backend source: app/routers/overrides.py
 *
 * Supported actions (from app/schemas/enums.py – OverrideAction):
 *   reassign       → target_window_id is REQUIRED
 *   force_schedule → target_window_id is REQUIRED
 *   unschedule     → target_window_id must be absent / null
 *
 * Contract rules (enforced server-side — do NOT duplicate here):
 *   - reason is mandatory: min 10 chars, max 2000 chars (SIH audit logging)
 *   - plan_id in the URL must match plan_id in the request body
 *   - The frontend performs lightweight reason-length validation only to give
 *     immediate user feedback; the server remains the authority on all rules.
 *
 * Post-override:
 *   After a successful override (HTTP 200) this hook fetches GET /plan/{plan_id}
 *   to retrieve the updated plan and returns it, so callers can update context.
 *
 * BACKEND IS FROZEN. Do not modify backend code.
 */

import { useCallback, useState } from 'react';
import { updatePlanOverride } from '../api/endpoints/overrides';
import { getPlan } from '../api/endpoints/plans';
import { adaptPlannerOverride } from '../adapters/overrideAdapter';
import { adaptBlockPlan } from '../adapters/planAdapter';
import type { ApiError } from '../api/client';
import type { OverrideAction } from '../api/types/enums';
import type { BlockPlanViewModel, PlannerOverrideViewModel } from '../adapters/types';

// ---------------------------------------------------------------------------
// Reason validation (UI-only guard, server enforces the real constraint)
// ---------------------------------------------------------------------------

export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 2000;

export function validateReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN_LENGTH) {
    return `Override reason must be at least ${REASON_MIN_LENGTH} characters (SIH audit requirement).`;
  }
  if (trimmed.length > REASON_MAX_LENGTH) {
    return `Override reason must not exceed ${REASON_MAX_LENGTH} characters.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverrideParams {
  planId: number;
  taskId: number;
  action: OverrideAction;
  /** Required for 'reassign' and 'force_schedule'. Must be absent for 'unschedule'. */
  targetWindowId?: number | null;
  reason: string;
}

export interface UseOverrideResult {
  /**
   * Submit the override to PUT /plan/{plan_id}/override.
   * On success, re-fetches GET /plan/{plan_id} and returns the updated plan VM.
   * On failure, returns null and populates `error`.
   */
  applyOverride: (params: OverrideParams) => Promise<BlockPlanViewModel | null>;
  /** True while the override PUT or the subsequent refetch GET is in flight. */
  isSubmitting: boolean;
  /**
   * The last API error encountered.
   * Preserved from the previous call until cleared by a new applyOverride call.
   */
  error: ApiError | { message: string; code?: string } | null;
  /** The last successfully applied override as a view model. Null before first success. */
  lastOverride: PlannerOverrideViewModel | null;
  /** Clear error and lastOverride state. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOverride(): UseOverrideResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<UseOverrideResult['error']>(null);
  const [lastOverride, setLastOverride] = useState<PlannerOverrideViewModel | null>(null);

  const applyOverride = useCallback(
    async (params: OverrideParams): Promise<BlockPlanViewModel | null> => {
      const { planId, taskId, action, targetWindowId, reason } = params;

      // UI-layer reason validation — gives immediate feedback before network call.
      const reasonError = validateReason(reason);
      if (reasonError) {
        setError({ message: reasonError, code: 'validation_error' });
        return null;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        // Build the exact request body the backend expects.
        // Backend enforces: reassign/force_schedule require target_window_id;
        //                   unschedule must NOT include target_window_id.
        const payload = {
          plan_id: planId,
          task_id: taskId,
          action,
          // Only include target_window_id when the action requires it.
          ...(action === 'reassign' || action === 'force_schedule'
            ? { target_window_id: targetWindowId ?? null }
            : {}),
          reason: reason.trim(),
        };

        // PUT /plan/{plan_id}/override  → PlannerOverrideResponse (HTTP 200)
        const overrideDto = await updatePlanOverride(planId, payload);
        const overrideVm = adaptPlannerOverride(overrideDto);
        setLastOverride(overrideVm);

        // Refetch the plan so the frontend reflects the server's updated state.
        // GET /plan/{plan_id}  → BlockPlanResponse
        const updatedPlanDto = await getPlan(planId);
        const updatedPlanVm = adaptBlockPlan(updatedPlanDto);

        return updatedPlanVm;
      } catch (err) {
        // Preserve prior valid plan state — caller must NOT mutate plan on error.
        setError(err as ApiError);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setLastOverride(null);
  }, []);

  return {
    applyOverride,
    isSubmitting,
    error,
    lastOverride,
    reset,
  };
}
