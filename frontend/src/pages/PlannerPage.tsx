/**
 * PlannerPage — AI Automatic Block Planner
 *
 * INTEGRATION:
 *  Phase 1 — Calls POST /generate-plan via useGeneratePlan hook (HTTP 202).
 *  Phase 2 — Immediately polls GET /plan/{plan_id} via usePlanPolling hook.
 *
 * WHAT CHANGED FROM MOCK:
 *  - "Generate" button calls the real FastAPI backend (POST /generate-plan).
 *  - No local schedule calculation or criticality scoring.
 *  - No fabricated BlockAssignment data.
 *  - No local progress simulation.
 *  - HTTP 202 Accepted triggers automatic status polling.
 *  - Polling stops on terminal status: ready / failed / superseded / timeout.
 *  - Planning horizon controls drive the actual request payload.
 *  - Department selection maps to backend Department enum values.
 *
 * WHAT IS PRESERVED:
 *  - Pipeline stepper visualization (now polling-status driven)
 *  - Planning configuration panel layout
 *  - Constraint checklist display
 *  - Visual card styling and color tokens
 *  - Empty state card
 */

import { useEffect, useState } from 'react';
import {
  BrainCircuit, Calendar, Cpu, Play, CheckCircle2,
  Loader2, AlertTriangle, Database, Clock, RefreshCw,
  AlertCircle, Send, Info, Zap,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  useGeneratePlan,
  todayIso,
  deriveHorizonEnd,
  type PlanFormValues,
} from '../hooks/useGeneratePlan';
import { usePlanPolling } from '../hooks/usePlanPolling';
import type { PlanningHorizonType, Department } from '../api/types/enums';
import type { BlockPlanViewModel } from '../adapters/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HORIZONS: { value: PlanningHorizonType; label: string; desc: string }[] = [
  { value: 'daily',   label: 'Daily',   desc: 'Single-day plan' },
  { value: 'weekly',  label: 'Weekly',  desc: '7-day plan' },
  { value: 'monthly', label: 'Monthly', desc: '28-day plan' },
];

/**
 * Department options.
 * Maps UI labels to backend Department enum values.
 * When ALL three are selected (or none), the request sends no department filter.
 */
const DEPT_OPTIONS: { key: string; label: string; backendValue: Department; color: string }[] = [
  { key: 'eng', label: 'Engineering',        backendValue: 'Engineering', color: '#2563eb' },
  { key: 'trc', label: 'Traction (OHE)',     backendValue: 'Traction',    color: '#7c3aed' },
  { key: 'snt', label: 'Signal & Telecom',   backendValue: 'S&T',         color: '#0891b2' },
];

const CONSTRAINTS = [
  'Train timetable',
  'Block capacity',
  'Corridor exclusivity',
  'Department coordination',
  'Safety requirements',
  'Class A mandatory window',
];

// ---------------------------------------------------------------------------
// Pipeline step data (purely decorative — reflects known backend workflow)
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  { icon: <Database className="w-5 h-5" />, title: 'TMS + TDMS + SMMS', subtitle: 'Data Ingestion',    desc: 'Collecting Tasks',           color: '#4a6a9e', step: 1 },
  { icon: <BrainCircuit className="w-5 h-5" />, title: 'XGBoost ML',    subtitle: 'Task Urgency',      desc: 'Prioritizing Defects',       color: '#2563eb', step: 2 },
  { icon: <Calendar className="w-5 h-5" />,     title: 'COA Sync',      subtitle: 'Track Windows',     desc: 'Available Blocks',           color: '#16a34a', step: 3 },
  { icon: <Cpu className="w-5 h-5" />,          title: 'CP-SAT Solver', subtitle: 'Feasible Schedule', desc: 'Task-to-Block Assignment',   color: '#7c3aed', step: 4 },
  { icon: <CheckCircle2 className="w-5 h-5" />, title: 'Safety Check',  subtitle: 'Zero Conflicts',    desc: 'Plan Validated',             color: '#0891b2', step: 5 },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PipelineStepper({
  isSubmitting,
  isPolling,
  planReady,
  planFailed,
}: {
  isSubmitting: boolean;
  isPolling: boolean;
  planReady: boolean;
  planFailed: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {PIPELINE_STEPS.map((step, i) => {
        const isActive   = isSubmitting || isPolling;
        const isComplete = planReady;
        const isFailed   = planFailed;
        return (
          <div key={i} className="relative">
            <div
              className={`pipeline-step py-4 px-3 ${
                isFailed ? 'border-red-300' :
                isActive ? 'active border-blue-500 shadow-md shadow-blue-100' : ''
              } ${isComplete ? 'completed border-green-400' : ''}`}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
                style={{ background: `${step.color}15`, color: step.color }}
              >
                {isFailed
                  ? <AlertCircle className="w-5 h-5 text-red-400" />
                  : isActive
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : isComplete
                  ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                  : step.icon}
              </div>
              <div className="text-xs font-extrabold text-navy-900 leading-tight">{step.title}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: step.color }}>{step.subtitle}</div>
              <div className="text-[11px] text-gray-500 mt-1">{step.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job Status Card — shown after HTTP 202 Accepted
// ---------------------------------------------------------------------------

function JobStatusCard({
  planId,
  jobId,
  status,
  horizonType,
  onReset,
}: {
  planId: number | null;
  jobId: string;
  status: string;
  horizonType: string | null;
  onReset: () => void;
}) {
  return (
    <div className="card border-green-200 bg-green-50/30" id="job-status-card">
      <div className="card-body">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="text-sm font-bold text-green-700">Plan Generation Job Accepted</span>
          <span className="ml-auto text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full border border-green-200 uppercase tracking-wide">
            HTTP 202
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg p-3 border border-green-100">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Plan ID</div>
            <div className="text-sm font-bold text-navy-900 font-mono">
              {planId !== null ? `#${planId}` : '—'}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-green-100">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Job ID</div>
            <div className="text-xs font-mono text-navy-900 truncate" title={jobId}>{jobId}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-green-100">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Horizon</div>
            <div className="text-sm font-bold text-navy-900 capitalize">{horizonType ?? '—'}</div>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex-1">
            <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
            <div>
              <div className="text-xs font-bold text-amber-700">Job Status: {status.toUpperCase()}</div>
              <div className="text-[10px] text-amber-600 mt-0.5">
                The backend optimizer is running. Use <span className="font-mono">GET /plan/{planId ?? '<id>'}</span> to poll for completion.
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 text-[11px] text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <span>
            The plan is queued for async processing via Celery. Polling (GET /plan/{'{plan_id}'}) will be
            wired in the next integration phase. Use the Blocks page with Plan ID{' '}
            <strong>{planId !== null ? `#${planId}` : 'shown above'}</strong> once the job completes.
          </span>
        </div>

        <div className="mt-2 text-[10px] text-amber-600 font-medium flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          AI-generated plan — Human approval required before submission to BDMS.
        </div>

        <button
          id="generate-another-btn"
          onClick={onReset}
          className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Generate another plan
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error Banner
// ---------------------------------------------------------------------------

function ErrorBanner({ message, code, onDismiss }: { message: string; code?: string; onDismiss: () => void }) {
  return (
    <div id="generate-error-banner" className="card border-red-200 bg-red-50/30">
      <div className="card-body">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-red-700">Plan generation failed</div>
            {code && (
              <div className="text-[10px] text-red-500 font-mono mt-0.5 uppercase">{code}</div>
            )}
            <div className="text-xs text-red-600 mt-1">{message}</div>
          </div>
          <button onClick={onDismiss} className="text-red-400 hover:text-red-600 transition-colors text-xs font-medium">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PlannerPage() {
  const { setCurrentPlan } = useAppContext();
  const { isSubmitting, jobResult, error: submitError, formErrors, submit, reset: resetSubmit } = useGeneratePlan();
  const {
    plan: polledPlan,
    status: pollStatus,
    isPolling,
    error: pollError,
    stopReason,
    start: startPolling,
    reset: resetPolling,
  } = usePlanPolling();

  useEffect(() => {
    if (polledPlan) {
      setCurrentPlan(polledPlan);
    }
  }, [polledPlan, setCurrentPlan]);

  // Form state
  const [horizonType, setHorizonType] = useState<PlanningHorizonType>('weekly');
  const [horizonStart, setHorizonStart] = useState<string>(todayIso());
  const [corridorId, setCorridorId] = useState<string>('');
  const [selectedDepts, setSelectedDepts] = useState<Record<string, boolean>>({
    eng: true, trc: true, snt: true,
  });

  // Derived horizon end (preview only, backend enforces)
  const horizonEnd = deriveHorizonEnd(horizonStart, horizonType);

  /**
   * Resolve the department filter to send.
   * If all or none selected → send no filter (backend will include all).
   * If exactly one selected → send that department.
   * If two selected → send no filter (API only accepts one).
   */
  const resolvedDepartment = (): Department | null => {
    const selected = DEPT_OPTIONS.filter(d => selectedDepts[d.key]);
    if (selected.length === 1) return selected[0]!.backendValue;
    return null; // all or ambiguous → no filter
  };

  const handleGenerate = async () => {
    const values: PlanFormValues = {
      horizonType,
      horizonStart,
      corridorId: corridorId || null,
      department: resolvedDepartment(),
    };
    const jobVm = await submit(values);
    // On HTTP 202 success: immediately begin polling for plan status.
    if (jobVm?.planId !== null && jobVm?.planId !== undefined) {
      startPolling(jobVm.planId);
    }
  };

  const handleReset = () => {
    resetSubmit();
    resetPolling();
    setCurrentPlan(null);
  };

  // Active error — submission error takes priority over polling error.
  const activeError = submitError ?? pollError;

  const jobAccepted   = jobResult !== null;
  const planReady     = pollStatus === 'ready';
  const planFailed    = pollStatus === 'failed' || pollStatus === 'superseded' || stopReason === 'timeout';
  // Disable generate button if submitting, polling, or a terminal plan is loaded.
  const generateDisabled = isSubmitting || isPolling || planReady;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">AI Automatic Block Planner</h1>
        <p className="text-sm text-gray-500 mt-1">
          Intelligent multi-department maintenance scheduling powered by ML and constraint optimization.
        </p>
      </div>

      {/* Pipeline Stepper */}
      <PipelineStepper
        isSubmitting={isSubmitting}
        isPolling={isPolling}
        planReady={planReady}
        planFailed={planFailed}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---------------------------------------------------------------- */}
        {/* Control Panel                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="col-span-1 lg:col-span-1 space-y-4">
          <div className="card">
            <div className="card-header">
              <h3 className="text-sm font-bold text-navy-900">Planning Configuration</h3>
            </div>
            <div className="card-body space-y-5">
              {/* Horizon Type */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Planning Horizon
                </label>
                <div className="flex gap-2 mt-2">
                  {HORIZONS.map(h => (
                    <button
                      key={h.value}
                      id={`horizon-${h.value}`}
                      onClick={() => setHorizonType(h.value)}
                      disabled={isSubmitting}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                        horizonType === h.value
                          ? 'bg-navy-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={h.desc}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horizon Start Date */}
              <div>
                <label
                  htmlFor="horizon-start-date"
                  className="text-[10px] font-bold text-gray-400 uppercase tracking-wider"
                >
                  Start Date
                </label>
                <input
                  id="horizon-start-date"
                  type="date"
                  value={horizonStart}
                  onChange={e => setHorizonStart(e.target.value)}
                  disabled={isSubmitting}
                  className={`mt-2 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-400 disabled:opacity-50 ${
                    formErrors.horizonStart ? 'border-red-300' : 'border-gray-200'
                  }`}
                />
                {formErrors.horizonStart && (
                  <p className="text-[10px] text-red-500 mt-1">{formErrors.horizonStart}</p>
                )}

                {/* Horizon End preview */}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>
                    End date: <strong className="text-gray-600">{horizonEnd}</strong>
                    {' '}({horizonType})
                  </span>
                </div>
              </div>

              {/* Corridor filter (optional) */}
              <div>
                <label
                  htmlFor="corridor-id-input"
                  className="text-[10px] font-bold text-gray-400 uppercase tracking-wider"
                >
                  Corridor Filter <span className="text-gray-300">(optional)</span>
                </label>
                <input
                  id="corridor-id-input"
                  type="text"
                  value={corridorId}
                  onChange={e => setCorridorId(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="e.g. COR_01"
                  className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 disabled:opacity-50"
                />
                <p className="text-[10px] text-gray-400 mt-1">Leave blank to plan all corridors.</p>
              </div>

              {/* Departments */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Departments
                </label>
                <p className="text-[10px] text-gray-400 mt-1 mb-2">
                  Select one to filter; all or none = no filter.
                </p>
                <div className="space-y-2">
                  {DEPT_OPTIONS.map(d => (
                    <label key={d.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        id={`dept-${d.key}`}
                        checked={selectedDepts[d.key] ?? false}
                        onChange={e => setSelectedDepts(prev => ({ ...prev, [d.key]: e.target.checked }))}
                        disabled={isSubmitting}
                        className="rounded disabled:opacity-50"
                        style={{ accentColor: d.color }}
                      />
                      <span className="text-xs font-medium text-navy-800">{d.label}</span>
                    </label>
                  ))}
                </div>
                {/* Show resolved department */}
                <div className="mt-2 text-[10px] text-gray-400">
                  Sending:{' '}
                  <strong className="text-gray-600">
                    {resolvedDepartment() ?? 'All departments'}
                  </strong>
                </div>
              </div>

              {/* Constraints */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Constraints
                </label>
                <div className="space-y-1.5 mt-2">
                  {CONSTRAINTS.map(c => (
                    <div key={c} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-gray-700">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            id="generate-plan-btn"
            onClick={handleGenerate}
            disabled={generateDisabled}
            className="w-full btn-primary justify-center py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting to Backend…
              </>
            ) : isPolling ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Polling Status… ({pollStatus ?? 'pending'})
              </>
            ) : planReady ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Plan Ready
              </>
            ) : planFailed ? (
              <>
                <AlertCircle className="w-5 h-5" />
                Plan Failed
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                GENERATE OPTIMIZED PLAN
              </>
            )}
          </button>

          {/* Request preview */}
          {!jobAccepted && !isSubmitting && (
            <div className="card bg-gray-50 border-dashed">
              <div className="card-body py-3">
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Send className="w-3 h-3" />
                  POST /generate-plan — Preview
                </div>
                <pre className="text-[10px] text-gray-600 font-mono leading-relaxed whitespace-pre-wrap">
{JSON.stringify({
  horizon_type: horizonType,
  horizon_start: horizonStart,
  horizon_end: horizonEnd,
  ...(corridorId ? { corridor_id: corridorId } : {}),
  ...(resolvedDepartment() ? { department: resolvedDepartment() } : {}),
}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Results Panel                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="col-span-1 lg:col-span-2 space-y-4">

          {/* Phase 1: Submitting state */}
          {isSubmitting && (
            <div className="card border-blue-200">
              <div className="card-body">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  <span className="text-sm font-semibold text-navy-800">
                    Submitting plan generation request to backend…
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-bar-fill bg-blue-500 animate-pulse" style={{ width: '60%' }} />
                </div>
                <div className="text-[10px] text-gray-400 mt-2">
                  POST /generate-plan → HTTP 202 Accepted (Celery async)
                </div>
              </div>
            </div>
          )}

          {/* Phase 2: Polling status card (shown while polling, plan not yet terminal) */}
          {jobAccepted && isPolling && !isSubmitting && (
            <div id="polling-status-card" className="card border-blue-200">
              <div className="card-body">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  <span className="text-sm font-semibold text-navy-800">
                    Optimizer running — polling plan status…
                  </span>
                  <span className="ml-auto text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full border border-blue-200 uppercase tracking-wide">
                    {pollStatus ?? 'pending'}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill bg-blue-500"
                    style={{ width: pollStatus === 'generating' ? '60%' : '30%', transition: 'width 1s ease' }}
                  />
                </div>
                <div className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  GET /plan/{jobResult?.planId ?? '…'} — polling every 3s
                </div>
              </div>
            </div>
          )}

          {/* Phase 3a: Plan ready — show real KPIs from backend */}
          {planReady && polledPlan && !isSubmitting && (
            <PlanReadyCard plan={polledPlan} onReset={handleReset} />
          )}

          {/* Phase 3b: Plan failed or timed out */}
          {planFailed && !isSubmitting && (
            <div id="plan-failed-card" className="card border-red-200 bg-red-50/30">
              <div className="card-body">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-bold text-red-700">
                    {stopReason === 'timeout' ? 'Polling timed out' : 'Plan generation failed'}
                  </span>
                </div>
                <div className="text-xs text-red-600 mb-3">
                  {stopReason === 'timeout'
                    ? 'The optimizer did not complete within the expected timeframe. Please try again.'
                    : pollStatus === 'superseded'
                    ? 'This plan was superseded by a newer generation request.'
                    : 'The backend optimizer encountered an error while generating this plan.'}
                </div>
                <button
                  id="plan-failed-reset-btn"
                  onClick={handleReset}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Submission error (distinct from polling error) */}
          {activeError && !isSubmitting && !isPolling && !planReady && !planFailed && (
            <ErrorBanner
              message={activeError.message ?? 'An unexpected error occurred.'}
              code={'code' in activeError ? activeError.code : undefined}
              onDismiss={handleReset}
            />
          )}

          {/* Job accepted: waiting for poll to begin or show interim job card */}
          {jobAccepted && !isSubmitting && !isPolling && !planReady && !planFailed && !activeError && (
            <JobStatusCard
              planId={jobResult!.planId}
              jobId={jobResult!.jobId}
              status={pollStatus ?? jobResult!.status}
              horizonType={jobResult!.horizonType}
              onReset={handleReset}
            />
          )}

          {/* Empty state */}
          {!jobAccepted && !isSubmitting && !activeError && (
            <div className="card">
              <div className="card-body py-16 text-center">
                <Cpu className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-400">No Plan Generated</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Configure the planning horizon and click "Generate Optimized Plan" to start.
                </p>
                <p className="text-xs text-gray-300 mt-3 max-w-sm mx-auto">
                  The backend optimizer collects data from TMS, TDMS, SMMS, and COA to produce
                  the best feasible maintenance schedule via CP-SAT constraint programming.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlanReadyCard — shown when plan status === 'ready'
// ---------------------------------------------------------------------------

function PlanReadyCard({ plan, onReset }: { plan: BlockPlanViewModel; onReset: () => void }) {
  const kpis = plan.kpis;
  return (
    <div id="plan-ready-card" className="card border-green-200 bg-green-50/30">
      <div className="card-body">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <span className="text-sm font-bold text-green-700">Plan Ready — {plan.formattedPlanId}</span>
          <span className="ml-auto text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full border border-green-200 uppercase tracking-wide">
            {plan.horizonTypeDisplay}
          </span>
        </div>

        <div className="text-xs text-gray-500 mb-4">
          {plan.horizonDateRangeFormatted}
          {plan.generatedAtFormatted ? ` · Generated ${plan.generatedAtFormatted}` : ''}
        </div>

        {kpis ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Tasks Scheduled',    value: `${kpis.scheduledTasks} / ${kpis.totalTasks}` },
              { label: 'Unscheduled',        value: `${kpis.unscheduledTasks}`, color: kpis.unscheduledTasks > 0 ? 'text-red-600' : 'text-green-600' },
              { label: 'Critical Unscheduled', value: `${kpis.criticalUnscheduledTasks}`, color: kpis.criticalUnscheduledTasks > 0 ? 'text-red-600' : 'text-green-600' },
              { label: 'Block Utilization',  value: kpis.blockUtilizationFormatted },
              { label: 'Asset Availability', value: kpis.assetAvailabilityFormatted },
              { label: 'Generation Time',    value: kpis.planGenerationFormatted },
            ].map(m => (
              <div key={m.label} className="bg-white rounded-lg p-3 text-center border border-green-100">
                <div className={`text-lg font-extrabold ${m.color ?? 'text-navy-900'}`}>{m.value}</div>
                <div className="text-[10px] text-gray-500 font-semibold mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-gray-400 mb-4 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            KPI data not available for this plan.
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <div className="text-xs text-gray-600">
            <Zap className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
            <strong>{plan.scheduledTasksCount}</strong> assignments scheduled ·{' '}
            <strong>{plan.unscheduledTasksCount}</strong> unscheduled
          </div>
        </div>

        <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1 mb-3">
          <AlertTriangle className="w-3 h-3" />
          AI-generated plan — Human approval required before submission to BDMS.
        </div>

        <button
          id="plan-ready-reset-btn"
          onClick={onReset}
          className="flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Generate another plan
        </button>
      </div>
    </div>
  );
}
