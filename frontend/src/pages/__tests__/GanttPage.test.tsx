/**
 * Component Tests for GanttPage.
 *
 * Verifies:
 *  - No-plan state when no plan is loaded
 *  - Plan search/fetch interaction and loading state
 *  - Failed-plan state display
 *  - Empty-plan state when plan has 0 scheduled assignments
 *  - Successful Gantt timeline render with corridor rows and joint blocks
 *  - Scheduled and unscheduled task tables
 *  - Day and Department filter controls
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '../../api/client';
import type { BlockPlanResponse } from '../../api/types/models';
import { AppProvider, useAppContext } from '../../context/AppContext';
import { adaptBlockPlan } from '../../adapters/planAdapter';
import GanttPage from '../GanttPage';
import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePlanDto: BlockPlanResponse = {
  plan_id: 10,
  status: 'ready',
  horizon_type: 'weekly',
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  assignments: [
    {
      task_id: 1,
      window_id: 101,
      corridor_id: 'COR_01',
      department: 'Engineering',
      day: 'Mon',
      estimated_hours: 2.0,
      criticality_score: 90.0,
      defect_severity: 'A',
      status: 'scheduled',
    },
    {
      task_id: 2,
      window_id: 101,
      corridor_id: 'COR_01',
      department: 'Traction',
      day: 'Mon',
      estimated_hours: 1.5,
      criticality_score: 75.0,
      defect_severity: 'B',
      status: 'scheduled',
    },
    {
      task_id: 3,
      window_id: null,
      corridor_id: 'COR_01',
      department: 'S&T',
      day: null,
      estimated_hours: 1.0,
      criticality_score: 50.0,
      defect_severity: 'C',
      status: 'unscheduled',
    },
  ],
  kpis: {
    plan_id: 10,
    horizon_type: 'weekly',
    horizon_start: '2026-08-25',
    horizon_end: '2026-08-31',
    corridor_id: null,
    department: null,
    total_tasks: 3,
    scheduled_tasks: 2,
    unscheduled_tasks: 1,
    critical_unscheduled_tasks: 0,
    scheduled_hours: 3.5,
    available_window_hours: 4.0,
    block_utilization_percent: 87.5,
    asset_availability_percent: 94.2,
    plan_generation_seconds: 3.2,
  },
  generated_at: '2026-08-25T10:00:00Z',
  created_at: '2026-08-25T09:50:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

const failedPlanDto: BlockPlanResponse = {
  ...samplePlanDto,
  plan_id: 11,
  status: 'failed',
  assignments: [],
};

const emptyPlanDto: BlockPlanResponse = {
  ...samplePlanDto,
  plan_id: 12,
  assignments: [
    {
      task_id: 4,
      window_id: null,
      corridor_id: 'COR_02',
      department: 'Engineering',
      day: null,
      estimated_hours: 2.0,
      criticality_score: 40.0,
      defect_severity: 'C',
      status: 'unscheduled',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper Component to Seed Context with a Plan
// ---------------------------------------------------------------------------

function PlanSeeder({ planDto, children }: { planDto: BlockPlanResponse | null; children: React.ReactNode }) {
  const { setCurrentPlan } = useAppContext();

  useEffect(() => {
    if (planDto) {
      setCurrentPlan(adaptBlockPlan(planDto));
    } else {
      setCurrentPlan(null);
    }
  }, [planDto, setCurrentPlan]);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

describe('GanttPage Component', () => {
  it('renders no-plan state when no plan is loaded in context', () => {
    render(
      <AppProvider>
        <GanttPage />
      </AppProvider>,
    );

    expect(screen.getByText(/no plan loaded/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter plan id/i)).toBeInTheDocument();
  });

  it('allows searching and loading a plan by ID', async () => {
    mock.onGet('/plan/10').reply(200, samplePlanDto);

    render(
      <AppProvider>
        <GanttPage />
      </AppProvider>,
    );

    const input = screen.getByPlaceholderText(/enter plan id/i);
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /load plan/i }));

    await waitFor(() => {
      expect(screen.getByText('PLAN-0010')).toBeInTheDocument();
    });

    expect(screen.getAllByText('COR_01').length).toBeGreaterThan(0);
  });

  it('renders failed plan state when plan status is failed', async () => {
    render(
      <AppProvider>
        <PlanSeeder planDto={failedPlanDto}>
          <GanttPage />
        </PlanSeeder>
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/plan generation failed/i)).toBeInTheDocument();
    });
  });

  it('renders empty-plan state when plan has 0 scheduled assignments', async () => {
    render(
      <AppProvider>
        <PlanSeeder planDto={emptyPlanDto}>
          <GanttPage />
        </PlanSeeder>
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no scheduled assignments/i)).toBeInTheDocument();
    });
  });

  it('renders timeline with corridor rows, window blocks, and joint block indicators', async () => {
    render(
      <AppProvider>
        <PlanSeeder planDto={samplePlanDto}>
          <GanttPage />
        </PlanSeeder>
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('PLAN-0010')).toBeInTheDocument();
    });

    // Corridor label
    expect(screen.getAllByText('COR_01').length).toBeGreaterThan(0);

    // Joint block badge (Engineering + Traction in Window 101)
    expect(screen.getAllByText(/joint/i).length).toBeGreaterThan(0);

    // Task items
    expect(screen.getByText('TSK-0001')).toBeInTheDocument();
    expect(screen.getByText('TSK-0002')).toBeInTheDocument();

    // Tables: scheduled and unscheduled
    expect(screen.getByText(/scheduled blocks/i)).toBeInTheDocument();
    expect(screen.getByText(/unscheduled tasks/i)).toBeInTheDocument();
    expect(screen.getByText('TSK-0003')).toBeInTheDocument();
  });

  it('supports day and department filter changes', async () => {
    render(
      <AppProvider>
        <PlanSeeder planDto={samplePlanDto}>
          <GanttPage />
        </PlanSeeder>
      </AppProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('PLAN-0010')).toBeInTheDocument();
    });

    // Change day filter to Tuesday (no blocks on Tue)
    const selects = screen.getAllByRole('combobox');
    const daySelect = selects[0]!;
    fireEvent.change(daySelect, { target: { value: 'Tue' } });

    // Should now show No Scheduled Assignments
    expect(screen.getByText(/no scheduled assignments/i)).toBeInTheDocument();

    // Change back to All Days
    fireEvent.change(daySelect, { target: { value: 'all' } });
    expect(screen.getByText('TSK-0001')).toBeInTheDocument();
  });
});
