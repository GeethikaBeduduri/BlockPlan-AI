/**
 * BlocksPage — Corridor Block Window Availability View
 *
 * Shows block maintenance windows derived from the latest AI-generated plan.
 *
 * DATA SOURCE: GET /plan/{plan_id} (backend)
 *
 * WHY NOT GET /windows?
 * The backend exposes NO standalone GET /windows endpoint.
 * Windows are internal to the optimizer; the only public API surface
 * is the plan result (assignments grouped by window_id).
 * This page groups those assignments to present window-level availability.
 *
 * WHAT WAS REMOVED:
 *   - mockBlocks, mockTrains, mockCorridors  (mock data)
 *   - train schedule timeline (no backend train endpoint)
 *   - allowed_departments (not in BlockWindowResponse)
 *   - train_conflict flag (no backend train data)
 *
 * WHAT IS SHOWN:
 *   - window_id formatted as WIN-XXXX
 *   - corridor_id, day, scheduled hours, task count
 *   - per-corridor summary cards
 *   - day breakdown matrix (corridor × weekday)
 *   - unscheduled assignment list
 */

import { useState } from 'react';
import {
  CalendarDays,
  Clock,
  Info,
  Loader2,
  AlertCircle,
  RefreshCw,
  Building2,
  CheckCircle2,
  CircleDot,
  BarChart3,
  ClipboardList,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useWindowPlan } from '../hooks/useWindowPlan';
import type {
  BlockWindowViewModel,
  WindowCorridorSummaryViewModel,
} from '../adapters/types';
import type { Weekday } from '../api/types/enums';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_SHORT: Record<Weekday, string> = {
  Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu',
  Fri: 'Fri', Sat: 'Sat', Sun: 'Sun',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WindowStatusBadge({ status }: { status: BlockWindowViewModel['windowStatus'] }) {
  const map = {
    available:      { label: 'Available',   cls: 'bg-green-100 text-green-700 border-green-200' },
    partially_used: { label: 'Partial',     cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    full:           { label: 'Full',        cls: 'bg-red-100 text-red-700 border-red-200' },
    unassigned:     { label: 'Unassigned',  cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

function UtilizationBar({ pct }: { pct: number }) {
  const clamp = Math.min(Math.max(pct, 0), 100);
  const color = clamp >= 90 ? 'bg-red-500' : clamp >= 60 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${clamp}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Corridor Day Matrix
// ---------------------------------------------------------------------------

function DayMatrixCell({
  windows,
}: {
  windows: BlockWindowViewModel[];
}) {
  if (windows.length === 0) {
    return (
      <div className="flex items-center justify-center h-12 bg-gray-50 rounded border border-gray-100 text-xs text-gray-300 select-none">
        —
      </div>
    );
  }

  const total = windows.reduce((s, w) => s + w.taskCount, 0);
  const maxPct = Math.max(...windows.map(w => w.utilizationPercent));
  const bg =
    maxPct >= 90 ? 'bg-red-50 border-red-200' :
    maxPct >= 50 ? 'bg-amber-50 border-amber-200' :
                   'bg-green-50 border-green-200';
  const text =
    maxPct >= 90 ? 'text-red-700' :
    maxPct >= 50 ? 'text-amber-700' :
                   'text-green-700';

  return (
    <div className={`flex flex-col items-center justify-center h-12 rounded border ${bg} gap-0.5`}>
      <span className={`text-xs font-bold ${text}`}>{windows.length}W</span>
      <span className={`text-[10px] ${text}`}>{total} task{total !== 1 ? 's' : ''}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Corridor Summary Card
// ---------------------------------------------------------------------------

function CorridorCard({
  summary,
  expanded,
  onToggle,
}: {
  summary: WindowCorridorSummaryViewModel;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pct = summary.avgUtilizationPercent;
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-400' : 'bg-green-500';

  return (
    <div className="card border border-gray-200 hover:border-blue-300 transition-colors">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-extrabold text-navy-900">{summary.corridorId}</div>
              <div className="text-[10px] text-gray-400">{summary.totalWindows} window{summary.totalWindows !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-blue-600 transition-colors p-1 rounded"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Scheduled</div>
            <div className="text-sm font-bold text-navy-900">{summary.totalScheduledHours.toFixed(1)} h</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Avg Util.</div>
            <div className="text-sm font-bold text-navy-900">{summary.avgUtilizationFormatted}</div>
          </div>
        </div>

        {/* Utilization bar */}
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Utilization</span>
            <span>{summary.avgUtilizationFormatted}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all duration-500`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>

        {/* Day breakdown */}
        <div className="grid grid-cols-7 gap-1 mb-3">
          {WEEKDAYS.map(day => (
            <div key={day} className="text-center">
              <div className="text-[9px] text-gray-400 mb-1">{WEEKDAY_SHORT[day]}</div>
              <DayMatrixCell windows={summary.dayBreakdown[day] ?? []} />
            </div>
          ))}
        </div>

        {/* Expanded window list */}
        {expanded && (
          <div className="mt-2 space-y-2 border-t border-gray-100 pt-3">
            {summary.windows.map(w => (
              <WindowRow key={w.windowId} window={w} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Window Row (inside expanded card)
// ---------------------------------------------------------------------------

function WindowRow({ window: w }: { window: BlockWindowViewModel }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-navy-900 font-mono">{w.formattedWindowId}</span>
          <span className="text-[10px] text-gray-400">{w.dayDisplay}</span>
        </div>
        <WindowStatusBadge status={w.windowStatus} />
      </div>

      <UtilizationBar pct={w.utilizationPercent} />

      <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {w.scheduledHours.toFixed(1)} h scheduled
        </span>
        <span className="flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          {w.taskCount} task{w.taskCount !== 1 ? 's' : ''}
        </span>
        {w.departmentDisplays.length > 0 && (
          <span>{w.departmentDisplays.join(' · ')}</span>
        )}
      </div>

      {w.assignments.length > 0 && (
        <div className="mt-2 space-y-1">
          {w.assignments.map(a => (
            <div key={a.taskId} className="flex items-center justify-between text-[10px] bg-white rounded p-1.5 border border-gray-100">
              <span className="font-mono font-bold text-navy-800">{a.formattedTaskId}</span>
              <span className="text-gray-500">{a.departmentShort}</span>
              <span className="text-gray-500">{a.estimatedDurationFormatted}</span>
              <span className={`font-bold ${a.criticalityScore > 80 ? 'text-red-600' : a.criticalityScore > 50 ? 'text-amber-600' : 'text-green-600'}`}>
                {a.criticalityScoreFormatted}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading, Error, Empty States
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      <p className="text-sm">Loading block window data from plan…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card border-red-200">
      <div className="card-body flex flex-col items-center justify-center py-16 gap-4">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <div className="text-center">
          <p className="text-sm font-semibold text-red-700">Failed to load block windows</p>
          <p className="text-xs text-red-500 mt-1 max-w-sm">{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  );
}

function EmptyState({ planId }: { planId: number | null }) {
  return (
    <div className="card">
      <div className="card-body flex flex-col items-center justify-center py-20 gap-3 text-center">
        <CalendarDays className="w-10 h-10 text-gray-300" />
        {planId ? (
          <>
            <p className="text-sm font-semibold text-gray-600">No block windows found in plan #{planId}</p>
            <p className="text-xs text-gray-400 max-w-sm">
              The selected plan contains no scheduled assignments. Generate a plan to see block window data.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-600">No plan selected</p>
            <p className="text-xs text-gray-400 max-w-sm">
              Enter a plan ID to view block window availability derived from AI-generated plan assignments.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BlocksPage() {
  const [planIdInput, setPlanIdInput] = useState('');
  const [activePlanId, setActivePlanId] = useState<number | null>(null);
  const [corridorFilter, setCorridorFilter] = useState('');
  const [expandedCorridors, setExpandedCorridors] = useState<Set<string>>(new Set());

  const { windows, corridorSummaries, unscheduled, isLoading, error, retry } =
    useWindowPlan(activePlanId);

  const handleLoad = () => {
    const parsed = parseInt(planIdInput, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      setActivePlanId(parsed);
    }
  };

  const toggleCorridorExpanded = (corridorId: string) => {
    setExpandedCorridors(prev => {
      const next = new Set(prev);
      if (next.has(corridorId)) next.delete(corridorId);
      else next.add(corridorId);
      return next;
    });
  };

  const expandAll = () => setExpandedCorridors(new Set(corridorSummaries.map(s => s.corridorId)));
  const collapseAll = () => setExpandedCorridors(new Set());

  const filteredSummaries = corridorFilter
    ? corridorSummaries.filter(s => s.corridorId === corridorFilter)
    : corridorSummaries;

  const uniqueCorridors = [...new Set(windows.map(w => w.corridorId))].sort();

  const totalWindowCount = windows.length;
  const totalScheduledHrs = windows.reduce((s, w) => s + w.scheduledHours, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">
            Corridor Block Availability
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Block maintenance windows derived from AI-generated plan assignments (COA data).
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2 max-w-full sm:max-w-xs">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <span className="text-[11px] text-blue-700">
            Window data is sourced from&nbsp;<code className="font-mono">GET /plan/&#123;id&#125;</code>&nbsp;
            assignments. No standalone windows endpoint exists in the current backend.
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="card-body flex flex-wrap items-end gap-3">
          {/* Plan ID Input */}
          <div className="flex flex-col gap-1">
            <label htmlFor="plan-id-input" className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Plan ID
            </label>
            <div className="flex items-center gap-2">
              <input
                id="plan-id-input"
                type="number"
                min="1"
                value={planIdInput}
                onChange={e => setPlanIdInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLoad()}
                placeholder="e.g. 1"
                className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
              <button
                id="load-plan-btn"
                onClick={handleLoad}
                disabled={!planIdInput || isLoading}
                className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
                Load
              </button>
              {activePlanId && (
                <button
                  onClick={retry}
                  disabled={isLoading}
                  title="Refresh"
                  className="p-2 text-gray-400 hover:text-blue-600 transition-colors rounded-lg border border-gray-200 hover:border-blue-300"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Corridor filter */}
          {uniqueCorridors.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="corridor-filter" className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Corridor
              </label>
              <select
                id="corridor-filter"
                value={corridorFilter}
                onChange={e => setCorridorFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              >
                <option value="">All Corridors</option>
                {uniqueCorridors.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-3 flex-wrap text-xs ml-auto">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-green-500" />Available
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-400" />Partial
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-500" />Full
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-gray-300" />Unassigned
            </div>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {activePlanId && !isLoading && !error && windows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card">
            <div className="card-body py-3">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Plan</div>
              <div className="text-lg font-extrabold text-navy-900">#{activePlanId}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body py-3">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Windows</div>
              <div className="text-lg font-extrabold text-navy-900">{totalWindowCount}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body py-3">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Scheduled Hours</div>
              <div className="text-lg font-extrabold text-navy-900">{totalScheduledHrs.toFixed(1)} h</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body py-3">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Corridors</div>
              <div className="text-lg font-extrabold text-navy-900">{filteredSummaries.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      {isLoading && <LoadingState />}

      {!isLoading && error && (
        <ErrorState
          message={error.message ?? 'An unexpected error occurred.'}
          onRetry={retry}
        />
      )}

      {!isLoading && !error && windows.length === 0 && (
        <EmptyState planId={activePlanId} />
      )}

      {!isLoading && !error && filteredSummaries.length > 0 && (
        <>
          {/* Expand / Collapse controls */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy-900">
              Corridor Breakdown
              {corridorFilter && (
                <span className="ml-2 text-gray-400 font-normal">— {corridorFilter}</span>
              )}
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <button onClick={expandAll} className="text-blue-600 hover:underline">Expand all</button>
              <span className="text-gray-300">|</span>
              <button onClick={collapseAll} className="text-blue-600 hover:underline">Collapse all</button>
            </div>
          </div>

          {/* Corridor cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSummaries.map(summary => (
              <CorridorCard
                key={summary.corridorId}
                summary={summary}
                expanded={expandedCorridors.has(summary.corridorId)}
                onToggle={() => toggleCorridorExpanded(summary.corridorId)}
              />
            ))}
          </div>
        </>
      )}

      {/* Unscheduled assignments panel */}
      {!isLoading && !error && unscheduled.length > 0 && (
        <div className="card border-amber-200">
          <div className="card-header flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-navy-900">
              Unscheduled Assignments ({unscheduled.length})
            </h2>
          </div>
          <div className="card-body">
            <p className="text-xs text-gray-500 mb-3">
              These tasks could not be assigned to a block window by the optimizer.
            </p>
            <div className="space-y-1.5">
              {unscheduled.map(a => (
                <div
                  key={a.taskId}
                  className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs"
                >
                  <span className="font-mono font-bold text-navy-800 w-20">{a.formattedTaskId}</span>
                  <span className="text-gray-600">{a.corridorId}</span>
                  <span className="text-gray-600">{a.departmentDisplay}</span>
                  <span className="text-gray-500">{a.estimatedDurationFormatted}</span>
                  <span className={`font-bold ml-auto ${a.criticalityScore > 80 ? 'text-red-600' : 'text-amber-600'}`}>
                    Score: {a.criticalityScoreFormatted}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Plan summary (scheduled) */}
      {!isLoading && !error && windows.length > 0 && (
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <h2 className="text-sm font-bold text-navy-900">All Scheduled Windows</h2>
            <span className="ml-auto text-xs text-gray-400">{windows.length} windows</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wide">Window</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wide">Corridor</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wide">Day</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-500 uppercase tracking-wide">Tasks</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-500 uppercase tracking-wide">Hrs</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {(corridorFilter
                  ? windows.filter(w => w.corridorId === corridorFilter)
                  : windows
                ).map(w => (
                  <tr key={w.windowId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 font-mono font-bold text-navy-800">{w.formattedWindowId}</td>
                    <td className="px-4 py-2 text-gray-600">{w.corridorId}</td>
                    <td className="px-4 py-2 text-gray-600">{w.dayDisplay}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{w.taskCount}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{w.scheduledHours.toFixed(1)}</td>
                    <td className="px-4 py-2">
                      <WindowStatusBadge status={w.windowStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info footer about missing GET /windows */}
      <div className="flex items-start gap-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg p-3 border border-gray-100">
        <CircleDot className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Block window capacity (available hours) is not independently exposed by the backend.
          The backend's <code className="font-mono">BlockWindowResponse</code> fields are only
          used internally by the optimizer. This view derives window availability from plan
          assignment data only. To display raw window capacities, a <code className="font-mono">GET /windows</code> endpoint
          would need to be added to the backend (currently frozen for this integration phase).
        </span>
      </div>
    </div>
  );
}
