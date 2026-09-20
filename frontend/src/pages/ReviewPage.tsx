/**
 * ReviewPage — Planner Review & Override
 *
 * DATA SOURCE:
 *   Reads from `currentPlan` (BlockPlanViewModel) in AppContext.
 *   This is the real backend plan from GET /plan/{plan_id}, adapted by planAdapter.
 *   Falls back to a "no plan" empty state when no plan is loaded.
 *
 * OVERRIDE ACTIONS (POST to real backend via useOverride hook):
 *   unschedule     → removes a task from its block window
 *   reassign       → moves a task to a different window (requires target_window_id)
 *   force_schedule → forces a task into a window (requires target_window_id)
 *
 * LOCAL-ONLY UI ACTIONS (no backend endpoint — clearly noted):
 *   Approve        → local status mark only (no PUT endpoint in backend)
 *   Lock           → local status mark only (no PUT endpoint in backend)
 *
 * POST-OVERRIDE:
 *   After a successful PUT /plan/{plan_id}/override, the hook refetches
 *   GET /plan/{plan_id} and updates `currentPlan` so the UI reflects the
 *   server state without requiring a manual refresh.
 *
 * BACKEND IS FROZEN. Do not modify backend code.
 */

import { useState, useCallback } from 'react';
import {
  CheckCircle2, RotateCcw, Lock, Clock, User, Cpu,
  AlertTriangle, AlertCircle, Loader2, ArrowRightLeft, XCircle,
  Info,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useOverride, validateReason, REASON_MIN_LENGTH } from '../hooks/useOverride';
import CriticalityBadge from '../components/CriticalityBadge';
import DepartmentBadge from '../components/DepartmentBadge';
import type { OverrideAction } from '../api/types/enums';
import type { PlanAssignmentViewModel } from '../adapters/types';

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

/**
 * Local UI-layer review status layered on top of the backend AssignmentStatus.
 * 'approved' and 'locked' are frontend-only states (no backend endpoint).
 * 'overridden' mirrors the backend AssignmentStatus value.
 */
type LocalReviewStatus = 'pending' | 'approved' | 'locked' | 'overridden';

interface LocalTaskMeta {
  localStatus: LocalReviewStatus;
}

// ---------------------------------------------------------------------------
// Static option lists
// ---------------------------------------------------------------------------

const ACTION_OPTIONS: {
  action: OverrideAction;
  label: string;
  desc: string;
  requiresWindow: boolean;
  icon: React.ReactNode;
}[] = [
  {
    action: 'unschedule',
    label: 'Unschedule',
    desc: 'Remove this task from its assigned window',
    requiresWindow: false,
    icon: <XCircle className="w-4 h-4" />,
  },
  {
    action: 'reassign',
    label: 'Reassign',
    desc: 'Move task to a different maintenance window',
    requiresWindow: true,
    icon: <ArrowRightLeft className="w-4 h-4" />,
  },
  {
    action: 'force_schedule',
    label: 'Force Schedule',
    desc: 'Force task into a specific window regardless of optimizer preference',
    requiresWindow: true,
    icon: <RotateCcw className="w-4 h-4" />,
  },
];

const REASON_PRESETS = [
  'Emergency maintenance required',
  'Field team unavailable for this window',
  'Equipment or asset unavailable',
  'Weather or environmental conditions',
  'Field condition changed after plan generation',
  'Safety concern identified post-planning',
  'Timetable conflict resolved — window reassignment needed',
];

// ---------------------------------------------------------------------------
// Task row component
// ---------------------------------------------------------------------------

function TaskRow({
  assignment,
  localStatus,
  onApprove,
  onLock,
  onOpenOverride,
}: {
  assignment: PlanAssignmentViewModel;
  localStatus: LocalReviewStatus;
  onApprove: () => void;
  onLock: () => void;
  onOpenOverride: () => void;
}) {
  const isScheduled = assignment.isScheduled;
  const isBackendOverridden = assignment.status === 'overridden';
  const effectiveStatus: LocalReviewStatus = isBackendOverridden ? 'overridden' : localStatus;

  const rowBg =
    effectiveStatus === 'approved'
      ? 'border-green-200 bg-green-50/30'
      : effectiveStatus === 'overridden'
      ? 'border-orange-200 bg-orange-50/30'
      : effectiveStatus === 'locked'
      ? 'border-blue-200 bg-blue-50/30'
      : !isScheduled
      ? 'border-red-100 bg-red-50/20'
      : 'border-gray-200';

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border ${rowBg}`}
      data-task-id={assignment.taskId}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-1.5 h-8 rounded-full flex-shrink-0"
          style={{ background: assignment.departmentColor }}
        />
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-navy-800">{assignment.formattedTaskId}</span>
            <DepartmentBadge department={assignment.department} />
            <CriticalityBadge score={assignment.criticalityScore} size="sm" />
            {assignment.defectSeverity === 'A' && (
              <span className="badge badge--high text-[9px]">Class A</span>
            )}
            {!isScheduled && (
              <span className="badge badge--high text-[9px]">Unscheduled</span>
            )}
            {isBackendOverridden && (
              <span className="badge badge--high text-[9px]">Overridden</span>
            )}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {assignment.corridorId}
            {assignment.windowId !== null && ` · WIN-${String(assignment.windowId).padStart(4, '0')}`}
            {assignment.day && ` · ${assignment.day}`}
            {` · ${assignment.estimatedDurationFormatted}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Backend-driven status badge */}
        {effectiveStatus === 'approved' && (
          <span className="badge badge--low flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        )}
        {effectiveStatus === 'overridden' && (
          <span className="badge badge--high flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Overridden
          </span>
        )}
        {effectiveStatus === 'locked' && (
          <span className="badge badge--eng flex items-center gap-1">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )}

        {/* Actions — only for pending, non-overridden tasks */}
        {effectiveStatus === 'pending' && (
          <>
            {/* Approve — local UI only, no backend endpoint */}
            <button
              id={`approve-task-${assignment.taskId}`}
              onClick={onApprove}
              className="btn-success py-1.5 px-3 text-xs"
              title="Mark as approved (local UI only — no backend endpoint)"
            >
              <CheckCircle2 className="w-3 h-3" /> Approve
            </button>
            {/* Override — calls PUT /plan/{plan_id}/override */}
            <button
              id={`override-task-${assignment.taskId}`}
              onClick={onOpenOverride}
              className="btn-secondary py-1.5 px-3 text-xs"
              title="Override via backend PUT /plan/{plan_id}/override"
            >
              <RotateCcw className="w-3 h-3" /> Override
            </button>
            {/* Lock — local UI only, no backend endpoint */}
            <button
              id={`lock-task-${assignment.taskId}`}
              onClick={onLock}
              className="btn-secondary py-1.5 px-3 text-xs"
              title="Lock assignment (local UI only — no backend endpoint)"
            >
              <Lock className="w-3 h-3" /> Lock
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override Modal
// ---------------------------------------------------------------------------

function OverrideModal({
  assignment,
  planId,
  onClose,
  onSuccess,
}: {
  assignment: PlanAssignmentViewModel;
  planId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedAction, setSelectedAction] = useState<OverrideAction>('unschedule');
  const [targetWindowId, setTargetWindowId] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const { applyOverride, isSubmitting, error, reset: resetOverride } = useOverride();
  const { setCurrentPlan, addToast } = useAppContext();

  const actionOption = ACTION_OPTIONS.find(o => o.action === selectedAction)!;
  const requiresWindow = actionOption.requiresWindow;

  // Combined reason: preset or custom text
  const effectiveReason = customReason || reason;
  const reasonValidationError = effectiveReason.length > 0
    ? validateReason(effectiveReason)
    : null;
  const canSubmit =
    !isSubmitting &&
    effectiveReason.trim().length >= REASON_MIN_LENGTH &&
    (!requiresWindow || targetWindowId.trim().length > 0);

  const handlePresetClick = (preset: string) => {
    setReason(preset);
    setCustomReason('');
  };

  const handleCustomChange = (value: string) => {
    setCustomReason(value);
    setReason('');
  };

  const handleSubmit = async () => {
    const windowId = requiresWindow ? parseInt(targetWindowId, 10) : null;
    if (requiresWindow && (isNaN(windowId!) || windowId! < 1)) {
      return; // Validation below covers this
    }

    resetOverride();
    const updatedPlan = await applyOverride({
      planId,
      taskId: assignment.taskId,
      action: selectedAction,
      targetWindowId: requiresWindow ? windowId : null,
      reason: effectiveReason,
    });

    if (updatedPlan !== null) {
      // Update currentPlan in context with freshly returned data
      setCurrentPlan(updatedPlan);
      addToast(
        `Task ${assignment.formattedTaskId} ${selectedAction.replace('_', ' ')}d successfully`,
        'success',
      );
      onSuccess();
      onClose();
    }
    // On error: modal stays open, error displayed inside modal
  };

  return (
    <div
      className="modal-overlay"
      id="override-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="modal-content" id="override-modal">
        {/* Header */}
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-lg font-bold text-navy-900" id="override-modal-title">Override Assignment</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {assignment.formattedTaskId} · {assignment.corridorId} · {assignment.departmentDisplay}
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Action selector */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Override Action
            </label>
            <div className="space-y-2 mt-2">
              {ACTION_OPTIONS.map(opt => (
                <label
                  key={opt.action}
                  className={`flex items-start gap-3 cursor-pointer p-3 rounded-lg border transition-colors ${
                    selectedAction === opt.action
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    id={`action-${opt.action}`}
                    name="override-action"
                    value={opt.action}
                    checked={selectedAction === opt.action}
                    onChange={() => {
                      setSelectedAction(opt.action);
                      setTargetWindowId('');
                    }}
                    className="mt-0.5 accent-blue-600"
                    disabled={isSubmitting}
                  />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                      {opt.icon} {opt.label}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{opt.desc}</div>
                    {opt.requiresWindow && (
                      <div className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Requires target window ID
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Target window ID (only for reassign / force_schedule) */}
          {requiresWindow && (
            <div>
              <label
                htmlFor="target-window-id"
                className="text-xs font-bold text-gray-500 uppercase tracking-wider"
              >
                Target Window ID <span className="text-red-500">*</span>
              </label>
              <input
                id="target-window-id"
                type="number"
                min="1"
                step="1"
                value={targetWindowId}
                onChange={e => setTargetWindowId(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. 42"
                className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 disabled:opacity-50"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                Enter the positive integer window_id from the backend plan.
              </p>
            </div>
          )}

          {/* Reason — presets + free text */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Override Reason <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(min {REASON_MIN_LENGTH} chars — SIH audit log)</span>
            </label>
            <div className="space-y-1.5 mt-2">
              {REASON_PRESETS.map(preset => (
                <label
                  key={preset}
                  className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50"
                >
                  <input
                    type="radio"
                    name="override-reason"
                    value={preset}
                    checked={reason === preset && !customReason}
                    onChange={() => handlePresetClick(preset)}
                    disabled={isSubmitting}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-navy-800">{preset}</span>
                </label>
              ))}
            </div>
            <textarea
              id="override-reason-custom"
              value={customReason}
              onChange={e => handleCustomChange(e.target.value)}
              disabled={isSubmitting}
              placeholder="Or type a custom reason (minimum 10 characters)…"
              rows={3}
              className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none disabled:opacity-50"
            />
            {/* Character count */}
            <div className="flex justify-between items-center mt-1">
              <div className="text-[10px] text-gray-400">
                {effectiveReason.trim().length} / {REASON_MIN_LENGTH} min chars
              </div>
              {reasonValidationError && (
                <p className="text-[10px] text-red-500">{reasonValidationError}</p>
              )}
            </div>
          </div>

          {/* SIH audit notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-amber-700">
              This override will be recorded in the SIH audit trail via{' '}
              <span className="font-mono text-[10px]">PUT /plan/{planId}/override</span>.
              The backend will validate the action and reason before applying the change.
            </span>
          </div>

          {/* Backend error display */}
          {error && (
            <div
              id="override-error"
              className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-red-700">Override failed</div>
                {'code' in error && error.code && (
                  <div className="text-[10px] text-red-500 font-mono uppercase mt-0.5">{error.code}</div>
                )}
                <div className="text-xs text-red-600 mt-1">{error.message}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="confirm-override-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Applying Override…
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Confirm Override
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReviewPage() {
  const { currentPlan, auditLog, approveTask, lockTask, addToast } = useAppContext();

  // Local UI-only review state (approve / lock — no backend endpoint for these)
  const [localMeta, setLocalMeta] = useState<Record<number, LocalTaskMeta>>({});
  // Override modal state
  const [overrideTarget, setOverrideTarget] = useState<PlanAssignmentViewModel | null>(null);
  // Override success counter to trigger audit log entries
  const [overrideCount, setOverrideCount] = useState(0);

  const allAssignments = currentPlan?.assignments ?? [];
  const scheduledAssignments = currentPlan?.scheduledAssignments ?? [];
  const unscheduledAssignments = currentPlan?.unscheduledAssignments ?? [];

  // -------------------------------------------------------------------------
  // Local-only action handlers
  // -------------------------------------------------------------------------

  const handleLocalApprove = useCallback(
    (taskId: number, formattedId: string) => {
      setLocalMeta(prev => ({ ...prev, [taskId]: { localStatus: 'approved' } }));
      // Also update the legacy string-keyed planResult via context (for backward compat)
      approveTask(formattedId);
      addToast(`${formattedId} marked as approved`, 'success');
    },
    [approveTask, addToast],
  );

  const handleLocalLock = useCallback(
    (taskId: number, formattedId: string) => {
      setLocalMeta(prev => ({ ...prev, [taskId]: { localStatus: 'locked' } }));
      lockTask(formattedId);
      addToast(`${formattedId} locked`, 'info');
    },
    [lockTask, addToast],
  );

  const handleApproveAll = useCallback(() => {
    const pending = allAssignments.filter(
      a => a.status !== 'overridden' && !localMeta[a.taskId]?.localStatus,
    );
    const meta: Record<number, LocalTaskMeta> = {};
    pending.forEach(a => {
      meta[a.taskId] = { localStatus: 'approved' };
      approveTask(a.formattedTaskId);
    });
    setLocalMeta(prev => ({ ...prev, ...meta }));
    addToast(`All ${pending.length} pending tasks approved`, 'success');
  }, [allAssignments, localMeta, approveTask, addToast]);

  const handleOverrideSuccess = useCallback(() => {
    setOverrideCount(prev => prev + 1);
  }, []);

  // -------------------------------------------------------------------------
  // Empty / not-ready states
  // -------------------------------------------------------------------------

  if (!currentPlan || !currentPlan.isReady) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">
            Planner Review &amp; Approval
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review, override, and approve AI-generated block assignments.
          </p>
        </div>
        <div className="card">
          <div className="card-body py-16 text-center">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-400">No Plan to Review</h3>
            <p className="text-sm text-gray-400 mt-1">
              {currentPlan?.isGenerating
                ? 'Plan is still generating — please wait.'
                : currentPlan?.isFailed
                ? 'Plan generation failed. Generate a new plan from the Auto Planner.'
                : 'Generate a plan from the Auto Planner first.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Derived counts from the real backend plan
  // -------------------------------------------------------------------------

  const pendingCount = allAssignments.filter(
    a => a.status !== 'overridden' && !localMeta[a.taskId]?.localStatus,
  ).length;
  const approvedCount = Object.values(localMeta).filter(m => m.localStatus === 'approved').length;
  const overriddenCount = allAssignments.filter(a => a.status === 'overridden').length + overrideCount;
  const lockedCount = Object.values(localMeta).filter(m => m.localStatus === 'locked').length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const renderAssignmentGroup = (
    assignments: PlanAssignmentViewModel[],
    label: string,
    emptyMsg: string,
  ) => (
    <div>
      <h2 className="text-sm font-bold text-navy-900 mb-2">{label}</h2>
      {assignments.length === 0 ? (
        <div className="text-sm text-gray-400 italic py-3 text-center">{emptyMsg}</div>
      ) : (
        <div className="space-y-2">
          {assignments.map(a => (
            <TaskRow
              key={a.taskId}
              assignment={a}
              localStatus={localMeta[a.taskId]?.localStatus ?? 'pending'}
              onApprove={() => handleLocalApprove(a.taskId, a.formattedTaskId)}
              onLock={() => handleLocalLock(a.taskId, a.formattedTaskId)}
              onOpenOverride={() => setOverrideTarget(a)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">
            Planner Review &amp; Approval
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Human-in-the-loop review. AI recommends — you decide.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {currentPlan.formattedPlanId} · {currentPlan.horizonTypeDisplay} ·{' '}
            {currentPlan.horizonDateRangeFormatted}
          </p>
        </div>
        {pendingCount > 0 && (
          <button onClick={handleApproveAll} className="btn-success self-start sm:self-auto">
            <CheckCircle2 className="w-4 h-4" /> Approve All ({pendingCount})
          </button>
        )}
      </div>

      {/* Backend action note */}
      <div className="flex items-start gap-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Override actions (Unschedule, Reassign, Force Schedule) are sent to{' '}
          <span className="font-mono">PUT /plan/{currentPlan.planId}/override</span> and
          audited by the backend. Approve and Lock are local review marks only.
        </span>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Pending',    value: pendingCount,    color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
          { label: 'Approved',   value: approvedCount,   color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200' },
          { label: 'Overridden', value: overriddenCount, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
          { label: 'Locked',     value: lockedCount,     color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
        ].map(s => (
          <div key={s.label} className={`card ${s.border} ${s.bg}`}>
            <div className="card-body text-center py-4">
              <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
              <div className="text-xs font-semibold text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Scheduled tasks */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-navy-900">
            Scheduled Assignments ({scheduledAssignments.length})
          </h2>
          <span className="text-xs text-gray-400">
            from {currentPlan.formattedPlanId}
          </span>
        </div>
        <div className="card-body space-y-5">
          {renderAssignmentGroup(
            scheduledAssignments,
            '',
            'No scheduled assignments in this plan.',
          )}
        </div>
      </div>

      {/* Unscheduled tasks */}
      {unscheduledAssignments.length > 0 && (
        <div className="card border-red-200">
          <div className="card-header">
            <h2 className="text-sm font-bold text-red-700">
              Unscheduled Tasks ({unscheduledAssignments.length})
            </h2>
            <span className="text-xs text-red-400">Could not be fitted in this plan</span>
          </div>
          <div className="card-body">
            {renderAssignmentGroup(
              unscheduledAssignments,
              '',
              'All tasks were scheduled successfully.',
            )}
          </div>
        </div>
      )}

      {/* Audit Trail */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-navy-900">Audit Trail</h2>
          </div>
        </div>
        <div className="card-body">
          {auditLog.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No actions recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {auditLog.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0"
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      entry.actor === 'AI' ? 'bg-blue-100' : 'bg-green-100'
                    }`}
                  >
                    {entry.actor === 'AI' ? (
                      <Cpu className="w-3 h-3 text-blue-500" />
                    ) : (
                      <User className="w-3 h-3 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-navy-800">{entry.action}</span>
                      {entry.task_id && (
                        <span className="text-[10px] text-gray-400">{entry.task_id}</span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">{entry.timestamp}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{entry.details}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Override Modal */}
      {overrideTarget && (
        <OverrideModal
          assignment={overrideTarget}
          planId={currentPlan.planId}
          onClose={() => setOverrideTarget(null)}
          onSuccess={handleOverrideSuccess}
        />
      )}
    </div>
  );
}
