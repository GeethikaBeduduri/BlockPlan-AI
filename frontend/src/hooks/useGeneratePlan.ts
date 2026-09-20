/**
 * useGeneratePlan — React hook for POST /generate-plan.
 *
 * Responsibilities:
 *  - Build and validate the PlanGenerateRequest before sending.
 *  - Call POST /generate-plan (returns HTTP 202 Accepted).
 *  - Track isSubmitting, jobResult (PlanJobViewModel), and error state.
 *  - Prevent duplicate submissions while one is in-flight.
 *
 * ARCHITECTURAL RULES (Backend is frozen):
 *  - Sends ONLY the fields accepted by PlanGenerateRequest schema:
 *      horizon_type  (required)
 *      horizon_start (required, YYYY-MM-DD)
 *      horizon_end   (required, YYYY-MM-DD)
 *      corridor_id   (optional)
 *      department    (optional)
 *  - Does NOT calculate schedules, criticality scores, or assignments locally.
 *  - Does NOT treat the 202 job response as a completed plan.
 *  - Does NOT auto-poll. Polling is a separate concern for a future hook.
 *
 * Backend validation rules (enforced server-side — replicated here for
 * early client-side feedback only, never used to generate plan data):
 *   daily   → horizon_end === horizon_start
 *   weekly  → horizon_end === horizon_start + 6 days
 *   monthly → span 27–30 days inclusive (28–31 calendar days)
 */

import { useState, useCallback, useRef } from 'react';
import { generatePlan } from '../api/endpoints/plans';
import { adaptPlanJob } from '../adapters/planAdapter';
import type { ApiError } from '../api/client';
import type { Department, PlanningHorizonType } from '../api/types/enums';
import type { PlanGenerateRequest } from '../api/types/models';
import type { PlanJobViewModel } from '../adapters/types';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Return a date string N days after a base YYYY-MM-DD string. */
function addDays(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Return today's date as YYYY-MM-DD (local calendar date). */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Derive horizon_end from horizon_start and horizon_type,
 * matching backend validation rules exactly.
 *
 * daily   → horizon_end = horizon_start
 * weekly  → horizon_end = horizon_start + 6 days
 * monthly → horizon_end = horizon_start + 27 days (minimum valid monthly span)
 */
export function deriveHorizonEnd(
  horizonStart: string,
  horizonType: PlanningHorizonType,
): string {
  switch (horizonType) {
    case 'daily':   return horizonStart;
    case 'weekly':  return addDays(horizonStart, 6);
    case 'monthly': return addDays(horizonStart, 27);
  }
}

// ---------------------------------------------------------------------------
// Client-side validation (mirrors backend PlanningHorizonSpec rules)
// ---------------------------------------------------------------------------

export interface PlanFormValues {
  horizonType: PlanningHorizonType;
  horizonStart: string;       // YYYY-MM-DD
  corridorId?: string | null;
  department?: Department | null;
}

export interface PlanFormErrors {
  horizonStart?: string;
  general?: string;
}

/**
 * Validate form values and return any field-level errors.
 * Returns an empty object when the form is valid.
 */
export function validatePlanForm(values: PlanFormValues): PlanFormErrors {
  const errors: PlanFormErrors = {};

  if (!values.horizonStart) {
    errors.horizonStart = 'Start date is required.';
    return errors;
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(values.horizonStart)) {
    errors.horizonStart = 'Start date must be in YYYY-MM-DD format.';
    return errors;
  }

  return errors;
}

/**
 * Build a PlanGenerateRequest from validated form values.
 * horizon_end is derived automatically from horizon_type + horizon_start.
 */
export function buildGenerateRequest(values: PlanFormValues): PlanGenerateRequest {
  const horizonEnd = deriveHorizonEnd(values.horizonStart, values.horizonType);
  return {
    horizon_type: values.horizonType,
    horizon_start: values.horizonStart,
    horizon_end: horizonEnd,
    corridor_id: values.corridorId ?? null,
    department: values.department ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseGeneratePlanResult {
  /** True while waiting for the HTTP 202 response. */
  isSubmitting: boolean;
  /** The accepted job descriptor returned by the backend on HTTP 202. Null until first successful call. */
  jobResult: PlanJobViewModel | null;
  /** API error from the most recent failed call. Null when no error or after reset. */
  error: ApiError | null;
  /** Field-level validation errors. */
  formErrors: PlanFormErrors;
  /**
   * Submit the generate-plan request.
   * Validates form values first; returns early if validation fails.
   * Prevents duplicate submission if already in-flight.
   *
   * @returns PlanJobViewModel on success, null on validation failure or error.
   */
  submit: (values: PlanFormValues) => Promise<PlanJobViewModel | null>;
  /** Clear jobResult, error, and formErrors (e.g., on form reset). */
  reset: () => void;
}

export function useGeneratePlan(): UseGeneratePlanResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobResult, setJobResult] = useState<PlanJobViewModel | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [formErrors, setFormErrors] = useState<PlanFormErrors>({});

  // Guard against duplicate in-flight submissions
  const inFlightRef = useRef(false);

  const submit = useCallback(
    async (values: PlanFormValues): Promise<PlanJobViewModel | null> => {
      // Prevent duplicate submissions
      if (inFlightRef.current) return null;

      // Client-side validation
      const validationErrors = validatePlanForm(values);
      if (Object.keys(validationErrors).length > 0) {
        setFormErrors(validationErrors);
        return null;
      }

      setFormErrors({});
      setError(null);

      const request = buildGenerateRequest(values);

      inFlightRef.current = true;
      setIsSubmitting(true);

      try {
        const dto = await generatePlan(request);

        // HTTP 202 — job accepted. The dto contains a job_id and possibly a plan_id.
        // Do NOT treat this as a completed plan.
        const vm = adaptPlanJob(dto);
        setJobResult(vm);
        return vm;
      } catch (err) {
        setError(err as ApiError);
        return null;
      } finally {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setJobResult(null);
    setError(null);
    setFormErrors({});
  }, []);

  return { isSubmitting, jobResult, error, formErrors, submit, reset };
}
