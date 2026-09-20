/**
 * Tests for the Generate Plan integration.
 *
 * Coverage:
 *  - useGeneratePlan hook helpers (validatePlanForm, buildGenerateRequest, deriveHorizonEnd)
 *  - PlannerPage integration: valid request → 202, invalid form, network failure, duplicate-click prevention
 *  - POST /generate-plan request shape
 *
 * NOTE: No backend files are modified.
 *       Tests mock the axios apiClient via axios-mock-adapter.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../api/client';
import type { PlanJobResponse } from '../../api/types/models';
import { AppProvider } from '../../context/AppContext';
import PlannerPage from '../PlannerPage';
import {
  buildGenerateRequest,
  deriveHorizonEnd,
  validatePlanForm,
} from '../../hooks/useGeneratePlan';

function renderPage() {
  return render(
    <AppProvider>
      <PlannerPage />
    </AppProvider>,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCEPTED_JOB: PlanJobResponse = {
  accepted: true,
  job_id: 'job-abc-123',
  plan_id: 42,
  horizon_type: 'weekly',
  status: 'pending',
};

// ---------------------------------------------------------------------------
// Hook helper unit tests
// ---------------------------------------------------------------------------

describe('deriveHorizonEnd', () => {
  it('returns same day for daily', () => {
    expect(deriveHorizonEnd('2026-08-29', 'daily')).toBe('2026-08-29');
  });

  it('returns start + 6 days for weekly', () => {
    expect(deriveHorizonEnd('2026-08-25', 'weekly')).toBe('2026-08-31');
  });

  it('returns start + 27 days for monthly', () => {
    expect(deriveHorizonEnd('2026-08-01', 'monthly')).toBe('2026-08-28');
  });
});

describe('validatePlanForm', () => {
  it('returns no errors for a valid form', () => {
    const errors = validatePlanForm({
      horizonType: 'weekly',
      horizonStart: '2026-08-25',
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('returns error when horizonStart is empty', () => {
    const errors = validatePlanForm({
      horizonType: 'weekly',
      horizonStart: '',
    });
    expect(errors.horizonStart).toBeTruthy();
  });

  it('returns error when horizonStart has wrong format', () => {
    const errors = validatePlanForm({
      horizonType: 'weekly',
      horizonStart: '29-08-2026', // wrong format
    });
    expect(errors.horizonStart).toBeTruthy();
  });
});

describe('buildGenerateRequest', () => {
  it('builds a weekly request correctly', () => {
    const req = buildGenerateRequest({
      horizonType: 'weekly',
      horizonStart: '2026-08-25',
    });
    expect(req.horizon_type).toBe('weekly');
    expect(req.horizon_start).toBe('2026-08-25');
    expect(req.horizon_end).toBe('2026-08-31');
    expect(req.corridor_id).toBeNull();
    expect(req.department).toBeNull();
  });

  it('includes corridor_id and department when provided', () => {
    const req = buildGenerateRequest({
      horizonType: 'daily',
      horizonStart: '2026-08-29',
      corridorId: 'COR_01',
      department: 'Engineering',
    });
    expect(req.corridor_id).toBe('COR_01');
    expect(req.department).toBe('Engineering');
    expect(req.horizon_end).toBe('2026-08-29'); // same day for daily
  });

  it('sends null for corridor_id when not provided', () => {
    const req = buildGenerateRequest({
      horizonType: 'monthly',
      horizonStart: '2026-08-01',
    });
    expect(req.corridor_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PlannerPage integration tests (axios-mock-adapter)
// ---------------------------------------------------------------------------

let mock: MockAdapter;

// Plan fixtures for GET /plan/42 responses
const BASE_PLAN_RESPONSE = {
  plan_id: 42,
  horizon_type: 'weekly' as const,
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  assignments: [],
  kpis: null,
  generated_at: null,
  created_at: '2026-08-25T00:00:00Z',
  updated_at: '2026-08-25T00:00:00Z',
};
const PENDING_PLAN = { ...BASE_PLAN_RESPONSE, status: 'pending' as const };
const READY_PLAN   = { ...BASE_PLAN_RESPONSE, status: 'ready' as const };

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
  vi.clearAllMocks();
});

describe('PlannerPage — Generate Plan Integration', () => {

  it('renders the generate button and empty state initially', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /generate optimized plan/i })).toBeInTheDocument();
    expect(screen.getByText(/no plan generated/i)).toBeInTheDocument();
  });

  it('sends a valid POST /generate-plan request and transitions to polling state', async () => {
    // 202 from POST, then GET returns pending (polling started)
    mock.onPost('/generate-plan').reply(202, ACCEPTED_JOB);
    mock.onGet('/plan/42').reply(200, PENDING_PLAN);

    renderPage();

    const dateInput = screen.getByLabelText(/start date/i);
    fireEvent.change(dateInput, { target: { value: '2026-08-25' } });

    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    // Button disables while submitting
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });

    // After 202, polling begins: button shows polling status
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /polling status/i })).toBeDisabled();
    });

    // Polling status card is visible
    expect(screen.getByText(/optimizer running/i)).toBeInTheDocument();
  });

  it('POSTs the correct fields to /generate-plan', async () => {
    let capturedBody: unknown = null;

    mock.onPost('/generate-plan').reply(config => {
      capturedBody = JSON.parse(config.data as string);
      return [202, ACCEPTED_JOB];
    });
    mock.onGet('/plan/42').reply(200, PENDING_PLAN);

    renderPage();

    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-25' } });
    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /polling status/i })).toBeDisabled();
    });

    expect(capturedBody).toMatchObject({
      horizon_type: 'weekly',
      horizon_start: '2026-08-25',
      horizon_end: '2026-08-31',
    });
  });

  it('shows error banner on API failure (503)', async () => {
    mock.onPost('/generate-plan').reply(503, {
      error: 'dependency_not_ready',
      message: 'Optimizer is not available.',
      details: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-29' } });
    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    await waitFor(() => {
      expect(screen.getByText(/plan generation failed/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/optimizer is not available/i)).toBeInTheDocument();
  });

  it('shows error banner on network failure', async () => {
    mock.onPost('/generate-plan').networkError();

    renderPage();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-29' } });
    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    await waitFor(() => {
      expect(screen.getByText(/plan generation failed/i)).toBeInTheDocument();
    });
  });

  it('prevents duplicate clicks while submitting', async () => {
    let callCount = 0;
    mock.onPost('/generate-plan').reply(async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 100));
      return [202, ACCEPTED_JOB];
    });
    mock.onGet('/plan/42').reply(200, PENDING_PLAN);

    renderPage();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-25' } });

    const btn = screen.getByRole('button', { name: /generate optimized plan/i });
    fireEvent.click(btn);

    // Button becomes disabled immediately
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    });

    // Try clicking again while disabled
    fireEvent.click(screen.getByRole('button', { name: /submitting/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /polling status/i })).toBeDisabled();
    });

    // Only one request should have been made
    expect(callCount).toBe(1);
  });

  it('disables the generate button while polling after 202', async () => {
    mock.onPost('/generate-plan').reply(202, ACCEPTED_JOB);
    mock.onGet('/plan/42').reply(200, PENDING_PLAN);

    renderPage();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-25' } });
    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /polling status/i })).toBeDisabled();
    });
  });

  it('can dismiss error and return to empty state', async () => {
    mock.onPost('/generate-plan').reply(503, {
      error: 'dependency_not_ready',
      message: 'Service unavailable',
      details: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-29' } });
    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    await waitFor(() => {
      expect(screen.getByText(/plan generation failed/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/dismiss/i));

    await waitFor(() => {
      expect(screen.queryByText(/plan generation failed/i)).not.toBeInTheDocument();
    });
  });

  it('shows plan ready card when polling resolves to ready', async () => {
    mock.onPost('/generate-plan').reply(202, ACCEPTED_JOB);
    mock.onGet('/plan/42').reply(200, READY_PLAN);

    renderPage();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-25' } });
    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/plan ready/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('button', { name: /plan ready/i })).toBeDisabled();
  });

  it('shows "generate another plan" which resets the form after ready', async () => {
    mock.onPost('/generate-plan').reply(202, ACCEPTED_JOB);
    mock.onGet('/plan/42').reply(200, READY_PLAN);

    renderPage();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2026-08-25' } });
    fireEvent.click(screen.getByRole('button', { name: /generate optimized plan/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/plan ready/i).length).toBeGreaterThan(0);
    });

    // Reset / generate another
    fireEvent.click(screen.getByRole('button', { name: /generate another plan/i }));

    await waitFor(() => {
      expect(screen.queryAllByText(/plan ready/i).length).toBe(0);
      expect(screen.getByRole('button', { name: /generate optimized plan/i })).toBeInTheDocument();
    });
  });
});

