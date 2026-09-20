/**
 * useWindowPlan — React hook for block window availability data.
 *
 * The backend has NO standalone GET /windows endpoint.
 * Window data is derived from plan assignments (GET /plan/{plan_id}).
 *
 * Workflow:
 *   1. Accept an optional planId. If not provided, the hook is idle.
 *   2. Fetch the plan via getPlan(planId).
 *   3. Adapt assignments → windows via adaptAssignmentsToWindows().
 *   4. Build corridor summaries via buildCorridorSummaries().
 *
 * Exposes:
 *   windows            – all window view-models sorted by corridor → day → id
 *   corridorSummaries  – per-corridor aggregates
 *   unscheduled        – assignments with no window (window_id === null)
 *   planId             – resolved plan id
 *   isLoading          – in-flight flag
 *   error              – ApiError | null
 *   retry()            – re-fetch on demand
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPlan } from '../api/endpoints/plans';
import {
  adaptAssignmentsToWindows,
  buildCorridorSummaries,
} from '../adapters/windowAdapter';
import type { ApiError } from '../api/client';
import type {
  BlockWindowViewModel,
  PlanAssignmentViewModel,
  WindowCorridorSummaryViewModel,
} from '../adapters/types';

export interface UseWindowPlanResult {
  windows: BlockWindowViewModel[];
  corridorSummaries: WindowCorridorSummaryViewModel[];
  unscheduled: PlanAssignmentViewModel[];
  planId: number | null;
  isLoading: boolean;
  error: ApiError | null;
  retry: () => void;
}

export function useWindowPlan(planId: number | null | undefined): UseWindowPlanResult {
  const [windows, setWindows] = useState<BlockWindowViewModel[]>([]);
  const [corridorSummaries, setCorridorSummaries] = useState<WindowCorridorSummaryViewModel[]>([]);
  const [unscheduled, setUnscheduled] = useState<PlanAssignmentViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const retry = useCallback(() => setFetchTick(t => t + 1), []);

  useEffect(() => {
    if (!planId) {
      setWindows([]);
      setCorridorSummaries([]);
      setUnscheduled([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Cancel previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;

    const fetch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const planDto = await getPlan(planId);

        if (cancelled) return;

        const { windows: adapted, unscheduled: unscheduledAdapted } =
          adaptAssignmentsToWindows(planDto.assignments);

        const summaries = buildCorridorSummaries(adapted);

        setWindows(adapted);
        setCorridorSummaries(summaries);
        setUnscheduled(unscheduledAdapted);
      } catch (err) {
        if (cancelled) return;
        setError(err as ApiError);
        setWindows([]);
        setCorridorSummaries([]);
        setUnscheduled([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetch();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, fetchTick]);

  return {
    windows,
    corridorSummaries,
    unscheduled,
    planId: planId ?? null,
    isLoading,
    error,
    retry,
  };
}
