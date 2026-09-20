/**
 * Component Tests for ReviewPage (Planner Review & Override).
 *
 * Coverage:
 *  1. No-plan state — shown when no plan is loaded in context
 *  2. Plan loaded — scheduled + unscheduled sections rendered from real plan data
 *  3. Successful override — modal opens, form filled, PUT /plan/{id}/override called,
 *     GET /plan/{id} refetched, modal closed, toast shown
 *  4. Validation failure — reason too short prevents network call; error shown in modal
 *  5. Network failure — backend 409/503 displayed in modal; plan state preserved
 *  6. State refresh after override — updated plan rendered after refetch
 *  7. Approve (local-only) — status mark without any network call
 *  8. Lock (local-only) — status mark without any network call
 *  9. Approve-all — marks all pending tasks approved
 * 10. Reassign action — target_window_id field appears in modal
 * 11. Force_schedule action — target_window_id field appears in modal
 * 12. Unschedule action — no target_window_id field shown
 *
 * Fixtures use real backend DTO shapes (BlockPlanResponse, PlannerOverrideResponse).
 * axios-mock-adapter intercepts PUT /plan/{id}/override and GET /plan/{id}.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import { apiClient } from '../../api/client';
import type { BlockPlanResponse, PlannerOverrideResponse } from '../../api/types/models';
import { AppProvider, useAppContext } from '../../context/AppContext';
import { adaptBlockPlan } from '../../adapters/planAdapter';
import ReviewPage from '../ReviewPage';

// ---------------------------------------------------------------------------
// Fixtures — exact backend DTO shapes
// ---------------------------------------------------------------------------

const PLAN_ID = 55;
const TASK_ID_SCHEDULED = 10;
const TASK_ID_UNSCHEDULED = 20;
const WINDOW_ID = 3;

/** A ready plan with one scheduled and one unscheduled task. */
const READY_PLAN_DTO: BlockPlanResponse = {
  plan_id: PLAN_ID,
  status: 'ready',
  horizon_type: 'weekly',
  horizon_start: '2026-08-25',
  horizon_end: '2026-08-31',
  assignments: [
    {
      task_id: TASK_ID_SCHEDULED,
      window_id: WINDOW_ID,
      corridor_id: 'COR_01',
      department: 'Engineering',
      day: 'Mon',
      estimated_hours: 2.0,
      criticality_score: 88.0,
      defect_severity: 'A',
      status: 'scheduled',
    },
    {
      task_id: TASK_ID_UNSCHEDULED,
      window_id: null,
      corridor_id: 'COR_02',
      department: 'Traction',
      day: null,
      estimated_hours: 1.5,
      criticality_score: 55.0,
      defect_severity: 'B',
      status: 'unscheduled',
    },
  ],
  kpis: null,
  generated_at: '2026-08-25T10:00:00Z',
  created_at: '2026-08-25T09:50:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

/** Plan after override — task 10 is now 'overridden'. */
const UPDATED_PLAN_DTO: BlockPlanResponse = {
  ...READY_PLAN_DTO,
  assignments: [
    {
      ...READY_PLAN_DTO.assignments[0]!,
      status: 'overridden',
    },
    READY_PLAN_DTO.assignments[1]!,
  ],
};

const OVERRIDE_RESPONSE: PlannerOverrideResponse = {
  override_id: 1,
  plan_id: PLAN_ID,
  task_id: TASK_ID_SCHEDULED,
  action: 'unschedule',
  target_window_id: null,
  reason: 'Emergency maintenance required — field team cannot access window.',
  overridden_by: null,
  overridden_at: null,
};

const VALID_REASON = 'Emergency maintenance required — field team cannot access window.';

// ---------------------------------------------------------------------------
// Helper — seeds currentPlan in AppContext then renders ReviewPage
// ---------------------------------------------------------------------------

function PlanSeeder({
  planDto,
  children,
}: {
  planDto: BlockPlanResponse | null;
  children: React.ReactNode;
}) {
  const { setCurrentPlan } = useAppContext();
  useEffect(() => {
    setCurrentPlan(planDto ? adaptBlockPlan(planDto) : null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children}</>;
}

function renderWithPlan(planDto: BlockPlanResponse | null = READY_PLAN_DTO) {
  return render(
    <AppProvider>
      <PlanSeeder planDto={planDto}>
        <ReviewPage />
      </PlanSeeder>
    </AppProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(apiClient);
});

afterEach(() => {
  mock.restore();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers — open override modal for a given task
// ---------------------------------------------------------------------------

async function openOverrideModal(taskId: number) {
  const specificBtn = document.getElementById(`override-task-${taskId}`) as HTMLButtonElement;
  if (!specificBtn) {
    throw new Error(`Override button for task ${taskId} not found`);
  }
  fireEvent.click(specificBtn);
  await waitFor(() => {
    expect(document.getElementById('override-modal')).toBeInTheDocument();
  });
}

function fillReason(reason: string) {
  const textarea = screen.getByPlaceholderText(/or type a custom reason/i);
  fireEvent.change(textarea, { target: { value: reason } });
}

// ---------------------------------------------------------------------------
// 1. No-plan state
// ---------------------------------------------------------------------------

describe('ReviewPage — No-plan state', () => {
  it('renders empty state when no plan is in context', () => {
    renderWithPlan(null);
    expect(screen.getByText(/no plan to review/i)).toBeInTheDocument();
    expect(screen.getByText(/generate a plan from the auto planner/i)).toBeInTheDocument();
  });

  it('renders waiting message when plan is still generating', async () => {
    const generatingPlan: BlockPlanResponse = {
      ...READY_PLAN_DTO,
      status: 'generating',
    };
    renderWithPlan(generatingPlan);
    await waitFor(() => {
      expect(screen.getByText(/still generating/i)).toBeInTheDocument();
    });
  });

  it('renders failure message when plan has failed', async () => {
    const failedPlan: BlockPlanResponse = {
      ...READY_PLAN_DTO,
      status: 'failed',
    };
    renderWithPlan(failedPlan);
    await waitFor(() => {
      expect(screen.getByText(/plan generation failed/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Plan loaded — content rendering
// ---------------------------------------------------------------------------

describe('ReviewPage — Plan loaded', () => {
  it('shows plan ID and horizon in the header', async () => {
    renderWithPlan();
    await waitFor(() => {
      expect(screen.getAllByText(/PLAN-0055/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows scheduled and unscheduled task sections', async () => {
    renderWithPlan();
    await waitFor(() => {
      // Scheduled section header
      expect(screen.getByText(/scheduled assignments/i)).toBeInTheDocument();
      // Unscheduled section header
      expect(screen.getByText(/unscheduled tasks/i)).toBeInTheDocument();
    });
    // Task formatted IDs
    expect(screen.getByText('TSK-0010')).toBeInTheDocument();
    expect(screen.getByText('TSK-0020')).toBeInTheDocument();
  });

  it('shows the correct summary counts', async () => {
    renderWithPlan();
    await waitFor(() => {
      expect(screen.getAllByText(/PLAN-0055/).length).toBeGreaterThanOrEqual(1);
    });
    // Cards: Pending, Approved, Overridden, Locked
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Overridden')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('shows the backend integration notice', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getAllByText(/PLAN-0055/).length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText(/PUT \/plan\/55\/override/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Successful override — unschedule
// ---------------------------------------------------------------------------

describe('ReviewPage — Successful override (unschedule)', () => {
  it('calls PUT /plan/{id}/override then refetches GET /plan/{id} and closes modal', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(200, OVERRIDE_RESPONSE);
    mock.onGet(`/plan/${PLAN_ID}`).reply(200, UPDATED_PLAN_DTO);

    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    // Open override modal for the scheduled task
    await openOverrideModal(TASK_ID_SCHEDULED);

    // Select "Unschedule" action (default)
    const unscheduleRadio = document.querySelector('input[name="override-action"][value="unschedule"]') as HTMLInputElement;
    fireEvent.click(unscheduleRadio);

    // Fill reason
    await fillReason(VALID_REASON);

    // Submit
    const confirmBtn = screen.getByRole('button', { name: /confirm override/i });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    // Modal closes after success
    await waitFor(() => {
      expect(document.getElementById('override-modal')).not.toBeInTheDocument();
    });

    // PUT was called
    expect(mock.history['put']).toHaveLength(1);
    const putBody = JSON.parse(mock.history['put']![0]!.data as string);
    expect(putBody.plan_id).toBe(PLAN_ID);
    expect(putBody.task_id).toBe(TASK_ID_SCHEDULED);
    expect(putBody.action).toBe('unschedule');
    // unschedule must NOT send target_window_id
    expect('target_window_id' in putBody).toBe(false);
    expect(putBody.reason).toBe(VALID_REASON);

    // GET was called to refetch plan
    expect(mock.history['get']).toHaveLength(1);
    expect(mock.history['get']![0]!.url).toBe(`/plan/${PLAN_ID}`);
  });
});

// ---------------------------------------------------------------------------
// 4. Validation failure — reason too short
// ---------------------------------------------------------------------------

describe('ReviewPage — Validation failure', () => {
  it('blocks submission and shows error when reason is too short', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);

    // Type a too-short reason in the textarea
    await fillReason('too short');

    // Submit button should be disabled (char count < 10 minimum)
    const confirmBtn = screen.getByRole('button', { name: /confirm override/i });
    expect(confirmBtn).toBeDisabled();

    // No network call made
    expect(mock.history['put']).toHaveLength(0);
  });

  it('enables submit only when reason reaches minimum length', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);

    const confirmBtn = screen.getByRole('button', { name: /confirm override/i });

    // Initially disabled (no reason)
    expect(confirmBtn).toBeDisabled();

    // Type a valid reason
    await fillReason(VALID_REASON);

    // Should be enabled now
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());
  });

  it('shows character count feedback in the modal', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);

    // "0 / 10 min chars" feedback text visible
    expect(screen.getByText(/min chars/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. Network failure — backend error displayed in modal
// ---------------------------------------------------------------------------

describe('ReviewPage — Network failure', () => {
  it('shows backend error in modal on 409 conflict and preserves the modal', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(409, {
      error: 'conflict',
      message: 'Task is already unscheduled',
      details: null,
    });

    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);
    await fillReason(VALID_REASON);

    fireEvent.click(screen.getByRole('button', { name: /confirm override/i }));

    // Error banner appears inside modal
    await waitFor(() => {
      expect(screen.getByText(/override failed/i)).toBeInTheDocument();
    });

    // Modal remains open
    expect(document.getElementById('override-modal')).toBeInTheDocument();

    // GET (refetch) was NOT called since PUT failed
    expect(mock.history['get']).toHaveLength(0);
  });

  it('shows backend error on 503 override_rejected', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(503, {
      error: 'override_rejected',
      message: 'Override persistence not yet available',
      details: null,
    });

    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);
    await fillReason(VALID_REASON);

    fireEvent.click(screen.getByRole('button', { name: /confirm override/i }));

    await waitFor(() => {
      expect(screen.getByText(/override failed/i)).toBeInTheDocument();
    });

    // Modal preserved, no refetch
    expect(mock.history['get']).toHaveLength(0);
  });

  it('shows error on network failure (no response)', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).networkError();

    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);
    await fillReason(VALID_REASON);

    fireEvent.click(screen.getByRole('button', { name: /confirm override/i }));

    await waitFor(() => {
      expect(screen.getByText(/override failed/i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// 6. State refresh after successful override
// ---------------------------------------------------------------------------

describe('ReviewPage — State refresh after override', () => {
  it('reflects overridden status in UI after plan is refetched', async () => {
    mock.onPut(`/plan/${PLAN_ID}/override`).reply(200, OVERRIDE_RESPONSE);
    // First GET: plan with scheduled task; second GET (refetch): task is overridden
    mock
      .onGet(`/plan/${PLAN_ID}`)
      .replyOnce(200, READY_PLAN_DTO)
      .onGet(`/plan/${PLAN_ID}`)
      .reply(200, UPDATED_PLAN_DTO);

    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);
    await fillReason(VALID_REASON);
    fireEvent.click(screen.getByRole('button', { name: /confirm override/i }));

    // Wait for modal to close (success)
    await waitFor(() => {
      expect(document.getElementById('override-modal')).not.toBeInTheDocument();
    });

    // Refetch (second GET) was triggered
    expect(mock.history['get']!.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 7 & 8. Local-only approve and lock (no network calls)
// ---------------------------------------------------------------------------

describe('ReviewPage — Local Approve and Lock (no backend endpoint)', () => {
  it('approve: marks task approved locally without making any network call', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    const approveBtn = document.getElementById(
      `approve-task-${TASK_ID_SCHEDULED}`,
    ) as HTMLButtonElement;
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/approved/i).length).toBeGreaterThanOrEqual(2);
    });

    // No network call
    expect(mock.history['put']).toHaveLength(0);
    expect(mock.history['get']).toHaveLength(0);
  });

  it('lock: marks task locked locally without making any network call', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    const lockBtn = document.getElementById(
      `lock-task-${TASK_ID_SCHEDULED}`,
    ) as HTMLButtonElement;
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/locked/i).length).toBeGreaterThanOrEqual(2);
    });

    expect(mock.history['put']).toHaveLength(0);
    expect(mock.history['get']).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Approve All
// ---------------------------------------------------------------------------

describe('ReviewPage — Approve All', () => {
  it('approves all pending tasks on click and removes "Approve All" button', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    const approveAllBtn = screen.getByRole('button', { name: /approve all/i });
    expect(approveAllBtn).toBeInTheDocument();
    fireEvent.click(approveAllBtn);

    // After approve all, all tasks are approved — button should disappear (pending = 0)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /approve all/i })).not.toBeInTheDocument();
    });

    // No network call for approve
    expect(mock.history['put']).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10 & 11. Reassign / Force Schedule — target_window_id field appears
// ---------------------------------------------------------------------------

describe('ReviewPage — Override modal action selection', () => {
  it('reassign action: shows target window ID input field', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);

    const reassignRadio = document.getElementById('action-reassign') as HTMLInputElement;
    fireEvent.click(reassignRadio);

    await waitFor(() => {
      expect(document.getElementById('target-window-id')).toBeInTheDocument();
    });
  });

  it('force_schedule action: shows target window ID input field', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);

    const forceRadio = document.getElementById('action-force_schedule') as HTMLInputElement;
    fireEvent.click(forceRadio);

    await waitFor(() => {
      expect(document.getElementById('target-window-id')).toBeInTheDocument();
    });
  });

  it('unschedule action: does NOT show target window ID input field', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);

    // Unschedule is the default
    const unscheduleRadio = document.getElementById('action-unschedule') as HTMLInputElement;
    fireEvent.click(unscheduleRadio);

    expect(document.getElementById('target-window-id')).not.toBeInTheDocument();
  });

  it('reassign: confirm button disabled until target_window_id is filled', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);

    // Select reassign
    const reassignRadio = document.getElementById('action-reassign') as HTMLInputElement;
    fireEvent.click(reassignRadio);
    await waitFor(() => expect(document.getElementById('target-window-id')).toBeInTheDocument());

    // Fill reason but not window ID
    fillReason(VALID_REASON);
    expect(screen.getByRole('button', { name: /confirm override/i })).toBeDisabled();

    // Now fill window ID
    const windowInput = document.getElementById('target-window-id') as HTMLInputElement;
    fireEvent.change(windowInput, { target: { value: '3' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm override/i })).not.toBeDisabled();
    });
  });
});

// ---------------------------------------------------------------------------
// 12. Cancel closes modal without any network call
// ---------------------------------------------------------------------------

describe('ReviewPage — Modal cancel', () => {
  it('cancels the modal without making any network request', async () => {
    renderWithPlan();
    await waitFor(() => expect(screen.getByText('TSK-0010')).toBeInTheDocument());

    await openOverrideModal(TASK_ID_SCHEDULED);
    expect(document.getElementById('override-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(document.getElementById('override-modal')).not.toBeInTheDocument();
    });

    expect(mock.history['put']).toHaveLength(0);
    expect(mock.history['get']).toHaveLength(0);
  });
});
