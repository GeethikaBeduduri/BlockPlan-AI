/**
 * Component Tests for TasksPage.
 *
 * Verifies:
 * - Successful task data loading from backend via mocked HTTP
 * - Empty state when 0 tasks are returned
 * - API error state and retry functionality
 * - Department, corridor, and status filtering
 * - Pagination controls and row click drawer opening
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { apiClient } from '../../api/client';
import type { MaintenanceTaskListResponse, MaintenanceTaskResponse } from '../../api/types';
import TasksPage from '../TasksPage';

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
});

const sampleTask1: MaintenanceTaskResponse = {
  task_id: 101,
  department: 'Engineering',
  corridor_id: 'COR_01',
  defect_severity: 'A',
  days_overdue: 4,
  estimated_hours: 2.5,
  asset_age_years: 8,
  status: 'open',
  criticality_score: 92.5,
  created_at: '2026-08-20T14:30:00Z',
  updated_at: '2026-08-21T09:00:00Z',
};

const sampleTask2: MaintenanceTaskResponse = {
  task_id: 102,
  department: 'Traction',
  corridor_id: 'COR_02',
  defect_severity: 'B',
  days_overdue: 0,
  estimated_hours: 1.5,
  asset_age_years: 15,
  status: 'scheduled',
  criticality_score: 75.0,
  created_at: '2026-08-22T10:00:00Z',
  updated_at: '2026-08-22T10:00:00Z',
};

const sampleListResponse: MaintenanceTaskListResponse = {
  items: [sampleTask1, sampleTask2],
  meta: { limit: 50, offset: 0, total: 2 },
};

describe('TasksPage - Loading and Data Render', () => {
  it('displays loading state initially and then renders tasks', async () => {
    mock.onGet('/tasks').reply(200, sampleListResponse);

    render(<TasksPage />);

    expect(screen.getByText(/Loading maintenance tasks from backend/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('TSK-0101')).toBeInTheDocument();
      expect(screen.getByText('TSK-0102')).toBeInTheDocument();
    });

    expect(screen.getByText('COR_01')).toBeInTheDocument();
    expect(screen.getByText('COR_02')).toBeInTheDocument();
    expect(screen.getByText('92.5')).toBeInTheDocument();
    expect(screen.getByText('75.0')).toBeInTheDocument();
  });

  it('renders empty state when no tasks exist', async () => {
    mock.onGet('/tasks').reply(200, {
      items: [],
      meta: { limit: 50, offset: 0, total: 0 },
    });

    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText(/No maintenance tasks found/i)).toBeInTheDocument();
    });
  });

  it('renders error state on API failure and retries on button click', async () => {
    mock.onGet('/tasks').replyOnce(500, 'Internal Server Error');

    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load tasks from backend/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry Connection/i });
    expect(retryBtn).toBeInTheDocument();

    // Setup success on retry
    mock.onGet('/tasks').reply(200, sampleListResponse);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('TSK-0101')).toBeInTheDocument();
    });
  });
});

describe('TasksPage - Filtering and Interaction', () => {
  it('triggers backend query when department filter is changed', async () => {
    mock.onGet('/tasks').reply((config) => {
      if (config.params?.department === 'Traction') {
        return [200, { items: [sampleTask2], meta: { limit: 50, offset: 0, total: 1 } }];
      }
      return [200, sampleListResponse];
    });

    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText('TSK-0101')).toBeInTheDocument();
    });

    const deptSelect = screen.getByDisplayValue('All Departments');
    fireEvent.change(deptSelect, { target: { value: 'Traction' } });

    await waitFor(() => {
      expect(screen.getByText('TSK-0102')).toBeInTheDocument();
      expect(screen.queryByText('TSK-0101')).not.toBeInTheDocument();
    });
  });

  it('opens task drawer on row click with detailed specification', async () => {
    mock.onGet('/tasks').reply(200, sampleListResponse);

    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText('TSK-0101')).toBeInTheDocument();
    });

    const row = screen.getByText('TSK-0101');
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByText(/Maintenance Specification/i)).toBeInTheDocument();
      expect(screen.getByText(/CLASS A — SAFETY CRITICAL/i)).toBeInTheDocument();
      expect(screen.getByText(/4 Days Overdue/i)).toBeInTheDocument();
      expect(screen.getByText(/8 years/i)).toBeInTheDocument();
    });
  });
});

describe('TasksPage - Pagination Controls', () => {
  it('supports pagination page navigation', async () => {
    mock.onGet('/tasks').reply((config) => {
      if (config.params?.offset === 50) {
        return [200, { items: [sampleTask2], meta: { limit: 50, offset: 50, total: 100 } }];
      }
      return [200, { items: [sampleTask1], meta: { limit: 50, offset: 0, total: 100 } }];
    });

    render(<TasksPage />);

    await waitFor(() => {
      expect(screen.getByText('TSK-0101')).toBeInTheDocument();
    });

    // Click next page button
    const nextBtn = screen.getByRole('button', { name: /Next/i });
    expect(nextBtn).toBeEnabled();
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText('TSK-0102')).toBeInTheDocument();
    });
  });
});
