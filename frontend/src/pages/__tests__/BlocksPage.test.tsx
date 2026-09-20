/**
 * Component Tests for BlocksPage.
 *
 * Verifies:
 * - Loading state is shown while plan is being fetched
 * - Window data is correctly rendered from plan assignments
 * - Error state and retry functionality
 * - Empty state when no plan is selected or plan has no assignments
 * - Corridor filter
 * - Unscheduled assignments panel
 *
 * NOTE: The backend has NO GET /windows endpoint.
 * BlocksPage fetches GET /plan/{plan_id} and derives window data.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '../../api/client';
import type { BlockPlanResponse, PlanAssignmentResponse } from '../../api/types';
import BlocksPage from '../BlocksPage';

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

const scheduledAssignment: PlanAssignmentResponse = {
  task_id: 1,
  window_id: 10,
  corridor_id: 'COR_01',
  department: 'Engineering',
  day: 'Mon',
  estimated_hours: 2.0,
  criticality_score: 88.5,
  defect_severity: 'A',
  status: 'scheduled',
};

const unscheduledAssignment: PlanAssignmentResponse = {
  task_id: 2,
  window_id: null,
  corridor_id: 'COR_02',
  department: 'S&T',
  day: null,
  estimated_hours: 1.5,
  criticality_score: 55.0,
  defect_severity: 'B',
  status: 'unscheduled',
};

const samplePlan: BlockPlanResponse = {
  plan_id: 1,
  status: 'ready',
  horizon_type: 'weekly',
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  assignments: [scheduledAssignment, unscheduledAssignment],
  kpis: null,
  generated_at: '2026-08-29T00:00:00Z',
  created_at: '2026-08-29T00:00:00Z',
  updated_at: '2026-08-29T00:00:00Z',
};

const emptyPlan: BlockPlanResponse = {
  ...samplePlan,
  assignments: [],
};

// ---------------------------------------------------------------------------
// Helper: render page and load plan
// ---------------------------------------------------------------------------

async function renderAndLoadPlan(planId: string = '1') {
  render(<BlocksPage />);
  const input = screen.getByLabelText(/plan id/i);
  fireEvent.change(input, { target: { value: planId } });
  const loadBtn = screen.getByRole('button', { name: /load/i });
  fireEvent.click(loadBtn);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlocksPage', () => {
  it('shows empty state when no plan is selected', () => {
    render(<BlocksPage />);
    expect(screen.getByText(/no plan selected/i)).toBeInTheDocument();
  });

  it('shows loading state while fetching the plan', async () => {
    // Delay the response so we can observe the loading indicator
    mock.onGet('/plan/1').reply(async () => {
      await new Promise(r => setTimeout(r, 100));
      return [200, samplePlan];
    });

    await renderAndLoadPlan('1');
    // Loading spinner should appear
    expect(screen.getByText(/loading block window data/i)).toBeInTheDocument();
  });

  it('renders window cards after successful fetch', async () => {
    mock.onGet('/plan/1').reply(200, samplePlan);

    await renderAndLoadPlan('1');

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/loading block window data/i)).not.toBeInTheDocument();
    });

    // Window WIN-0010 should appear in the table
    expect(screen.getByText('WIN-0010')).toBeInTheDocument();
    // Corridor should appear in at least one place (card, table, or dropdown)
    expect(screen.getAllByText('COR_01').length).toBeGreaterThan(0);

  });

  it('renders unscheduled assignments panel when present', async () => {
    mock.onGet('/plan/1').reply(200, samplePlan);

    await renderAndLoadPlan('1');

    await waitFor(() => {
      expect(screen.queryByText(/loading block window data/i)).not.toBeInTheDocument();
    });

    // Unscheduled panel heading
    expect(screen.getByText(/unscheduled assignments/i)).toBeInTheDocument();
    // TSK-0002 is the unscheduled task
    expect(screen.getByText('TSK-0002')).toBeInTheDocument();
  });

  it('shows empty state for plan with no assignments', async () => {
    mock.onGet('/plan/1').reply(200, emptyPlan);

    await renderAndLoadPlan('1');

    await waitFor(() => {
      expect(screen.queryByText(/loading block window data/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/no block windows found in plan/i)).toBeInTheDocument();
  });

  it('shows error state on API failure and retry triggers new fetch', async () => {
    mock.onGet('/plan/1').replyOnce(503, {
      error: 'service_unavailable',
      message: 'Backend unavailable',
      details: null,
    });

    await renderAndLoadPlan('1');

    await waitFor(() => {
      expect(screen.getByText(/failed to load block windows/i)).toBeInTheDocument();
    });

    // Second attempt succeeds
    mock.onGet('/plan/1').reply(200, samplePlan);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByText(/failed to load block windows/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText('WIN-0010')).toBeInTheDocument();
  });

  it('shows plan ID in summary strip after loading', async () => {
    mock.onGet('/plan/1').reply(200, samplePlan);

    await renderAndLoadPlan('1');

    await waitFor(() => {
      expect(screen.queryByText(/loading block window data/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText('#1')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// windowAdapter unit tests
// ---------------------------------------------------------------------------

describe('windowAdapter — adaptAssignmentsToWindows', () => {
  // Import at top-level would cause side-effects with mock; import dynamically
  it('groups assignments by window_id', async () => {
    const { adaptAssignmentsToWindows } = await import('../../adapters/windowAdapter');

    const result = adaptAssignmentsToWindows([scheduledAssignment, unscheduledAssignment]);

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]!.windowId).toBe(10);
    expect(result.windows[0]!.corridorId).toBe('COR_01');
    expect(result.windows[0]!.day).toBe('Mon');
    expect(result.windows[0]!.taskCount).toBe(1);
    expect(result.windows[0]!.scheduledHours).toBeCloseTo(2.0);
    expect(result.unscheduled).toHaveLength(1);
    expect(result.unscheduled[0]!.taskId).toBe(2);
  });

  it('formats windowId as WIN-XXXX', async () => {
    const { formatWindowId } = await import('../../adapters/windowAdapter');
    expect(formatWindowId(1)).toBe('WIN-0001');
    expect(formatWindowId(100)).toBe('WIN-0100');
    expect(formatWindowId(9999)).toBe('WIN-9999');
  });

  it('returns empty windows and unscheduled for empty input', async () => {
    const { adaptAssignmentsToWindows } = await import('../../adapters/windowAdapter');
    const result = adaptAssignmentsToWindows([]);
    expect(result.windows).toHaveLength(0);
    expect(result.unscheduled).toHaveLength(0);
  });
});

describe('windowAdapter — buildCorridorSummaries', () => {
  it('groups windows by corridorId', async () => {
    const { adaptAssignmentsToWindows, buildCorridorSummaries } =
      await import('../../adapters/windowAdapter');

    const twoCorridorAssignments: PlanAssignmentResponse[] = [
      { ...scheduledAssignment, corridor_id: 'COR_01', window_id: 10 },
      { ...scheduledAssignment, task_id: 99, corridor_id: 'COR_02', window_id: 20 },
    ];

    const { windows } = adaptAssignmentsToWindows(twoCorridorAssignments);
    const summaries = buildCorridorSummaries(windows);

    expect(summaries).toHaveLength(2);
    const cor01 = summaries.find(s => s.corridorId === 'COR_01')!;
    expect(cor01.totalWindows).toBe(1);
  });
});
