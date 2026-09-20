/**
 * GanttPage — Interactive Gantt chart visualization of the backend-generated block plan.
 *
 * REQUIREMENTS & ARCHITECTURE:
 *  - Consumes real backend BlockPlanResponse data via adaptBlockPlanToGantt().
 *  - Displays plan status, corridor rows, window blocks, task timing, department badges,
 *    and joint/shared block indicators.
 *  - Clearly distinguishes scheduled assignments (on timeline) from unscheduled assignments (in summary panel).
 *  - Supports Weekly and Monthly planning horizon views.
 *  - Handles:
 *      • Loading state (while fetching a specific plan_id)
 *      • No-plan state (when no plan is generated/selected yet)
 *      • Failed-plan state (when backend optimization failed)
 *      • Empty-plan state (when plan has zero scheduled assignments)
 *  - Zero synthetic assignments, zero local re-optimization.
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  GanttChart as GanttIcon,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { adaptBlockPlanToGantt } from '../adapters/ganttAdapter';
import type { GanttBlockViewModel } from '../adapters/types';
import type { Weekday } from '../api/types/enums';
import { getPlan } from '../api/endpoints/plans';
import { adaptBlockPlan } from '../adapters/planAdapter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMELINE_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function GanttPage() {
  const { currentPlan, setCurrentPlan } = useAppContext();

  // Local state for plan ID search / fetch
  const [inputPlanId, setInputPlanId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // View / filter controls
  const [selectedDay, setSelectedDay] = useState<Weekday | 'all'>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [horizonView, setHorizonView] = useState<'weekly' | 'monthly'>('weekly');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoveredTask, setHoveredTask] = useState<number | null>(null);

  // Manual fetch for a plan ID
  const handleFetchPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(inputPlanId.trim(), 10);
    if (isNaN(id) || id <= 0) return;

    setIsLoading(true);
    setFetchError(null);
    try {
      const dto = await getPlan(id);
      const vm = adaptBlockPlan(dto);
      setCurrentPlan(vm);
    } catch (err: any) {
      setFetchError(err?.message || `Plan #${id} not found.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Adapt current backend plan to Gantt model
  const ganttPlan = useMemo(() => {
    if (!currentPlan) return null;
    return adaptBlockPlanToGantt(currentPlan.raw);
  }, [currentPlan]);

  // Filter blocks by day and department
  const filteredBlocks = useMemo(() => {
    if (!ganttPlan) return [];
    return ganttPlan.blocks.filter((block) => {
      const dayMatches = selectedDay === 'all' || block.day === selectedDay;
      const deptMatches =
        selectedDepartment === 'all' ||
        block.departments.some((d) => d === selectedDepartment);
      return dayMatches && deptMatches;
    });
  }, [ganttPlan, selectedDay, selectedDepartment]);

  // Group filtered blocks by corridor
  const filteredCorridorRows = useMemo(() => {
    const map = new Map<string, GanttBlockViewModel[]>();
    for (const b of filteredBlocks) {
      const list = map.get(b.corridorId) ?? [];
      list.push(b);
      map.set(b.corridorId, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([corridorId, blocks]) => ({ corridorId, blocks }));
  }, [filteredBlocks]);

  // -------------------------------------------------------------------------
  // Render: Loading State
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Gantt Plan</h1>
          <p className="text-sm text-gray-500 mt-1">
            Loading backend-generated block schedule…
          </p>
        </div>
        <div className="card">
          <div className="card-body py-20 text-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
            <h3 className="text-base font-bold text-navy-800">Fetching Plan from Server…</h3>
            <p className="text-xs text-gray-400 mt-1">Retrieving block windows and task assignments.</p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Failed-Plan State
  // -------------------------------------------------------------------------
  if (currentPlan && currentPlan.isFailed) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Gantt Plan</h1>
          <p className="text-sm text-gray-500 mt-1">Schedule visualization.</p>
        </div>
        <div className="card border-red-200 bg-red-50/30">
          <div className="card-body py-12 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-red-700">Plan Generation Failed</h3>
            <p className="text-xs text-red-600 mt-1 max-w-md mx-auto">
              Plan #{currentPlan.planId} encountered an optimization error on the backend.
            </p>
            <button
              onClick={() => setCurrentPlan(null)}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Select another plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: No-Plan State
  // -------------------------------------------------------------------------
  if (!currentPlan || !ganttPlan) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Gantt Plan</h1>
            <p className="text-sm text-gray-500 mt-1">
              Interactive Gantt chart visualization of the backend-generated plan.
            </p>
          </div>
          <form onSubmit={handleFetchPlan} className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Enter Plan ID (e.g. 1)"
              value={inputPlanId}
              onChange={(e) => setInputPlanId(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-44 focus:outline-none focus:border-blue-400"
            />
            <button type="submit" className="btn-primary py-1.5 px-3 text-xs">
              <Search className="w-3.5 h-3.5" /> Load Plan
            </button>
          </form>
        </div>

        {fetchError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        <div className="card">
          <div className="card-body py-16 text-center">
            <GanttIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-400">No Plan Loaded</h3>
            <p className="text-sm text-gray-400 mt-1">
              Generate a plan in the Auto Planner or enter an existing Plan ID above.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Empty-Plan State (Plan exists but has 0 scheduled assignments)
  // -------------------------------------------------------------------------
  const hasScheduledBlocks = filteredBlocks.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Gantt Plan</h1>
            <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
              {ganttPlan.formattedPlanId}
            </span>
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full border border-green-200 uppercase">
              {ganttPlan.statusDisplay}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {ganttPlan.horizonTypeDisplay} Schedule ({ganttPlan.horizonDateRangeFormatted})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Horizon View Selector */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
            <button
              onClick={() => setHorizonView('weekly')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                horizonView === 'weekly' ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setHorizonView('monthly')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                horizonView === 'monthly' ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Monthly
            </button>
          </div>

          {/* Zoom controls */}
          <button
            onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
            className="btn-secondary py-1.5 px-2.5 text-xs"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.8, z - 0.1))}
            className="btn-secondary py-1.5 px-2.5 text-xs"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="card">
        <div className="card-body py-2.5 flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 text-gray-500 font-semibold">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>

          {/* Day Filter */}
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Day:</span>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value as Weekday | 'all')}
              className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-navy-800 focus:outline-none"
            >
              <option value="all">All Days</option>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Department:</span>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-navy-800 focus:outline-none"
            >
              <option value="all">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Traction">Traction</option>
              <option value="S&T">Signal & Telecom</option>
            </select>
          </div>

          {/* Legend */}
          <div className="sm:ml-auto flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ background: '#2563eb' }} />
              Engineering
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ background: '#7c3aed' }} />
              Traction
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ background: '#0891b2' }} />
              S&T
            </div>
            <div className="flex items-center gap-1 text-purple-700 font-semibold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
              <Users className="w-3 h-3" /> Joint Block
            </div>
          </div>
        </div>
      </div>

      {/* Gantt Timeline Container */}
      {!hasScheduledBlocks ? (
        <div className="card">
          <div className="card-body py-16 text-center">
            <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-400">No Scheduled Assignments</h3>
            <p className="text-xs text-gray-400 mt-1">
              All tasks in this plan are currently unscheduled or no block windows were allocated.
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div
            className="min-w-[1000px] transition-transform origin-top-left"
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: '0 0' }}
          >
            {/* Header: Timeline Hours */}
            <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="w-[140px] flex-shrink-0 px-4 py-2 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase border-r border-gray-100">
                Corridor / Window
              </div>
              <div className="flex-1 relative flex">
                {TIMELINE_HOURS.map((h) => (
                  <div
                    key={h}
                    className="flex-1 px-2 py-2 text-center text-[10px] font-bold text-gray-500 border-l border-gray-100 bg-gray-50"
                  >
                    {h}
                  </div>
                ))}
              </div>
            </div>

            {/* Corridor Rows */}
            {filteredCorridorRows.map((row) => (
              <div key={row.corridorId} className="flex border-b border-gray-100 min-h-[90px]">
                {/* Corridor Label */}
                <div className="w-[140px] flex-shrink-0 px-4 py-3 border-r border-gray-100 flex flex-col justify-center bg-gray-50/40">
                  <div className="text-xs font-bold text-navy-900">{row.corridorId}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{row.blocks.length} block(s)</div>
                </div>

                {/* Timeline Grid & Blocks */}
                <div className="flex-1 relative py-2 px-1">
                  {/* Grid Lines */}
                  {TIMELINE_HOURS.map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-gray-100 pointer-events-none"
                      style={{ left: `${(i / TIMELINE_HOURS.length) * 100}%` }}
                    />
                  ))}

                  {/* Window Blocks */}
                  <div className="relative flex flex-wrap gap-2 h-full items-center">
                    {row.blocks.map((block) => (
                      <GanttBlockCard
                        key={block.windowId}
                        block={block}
                        hoveredTask={hoveredTask}
                        onHoverTask={setHoveredTask}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Safety Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800">
          <strong>AI Optimization Notice:</strong> Block possession schedules are generated via CP-SAT
          constraint programming. Human review and sign-off are required prior to live dispatching.
        </div>
      </div>

      {/* Summary Tables: Scheduled and Unscheduled */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scheduled Blocks Table */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Scheduled Blocks ({ganttPlan.blocks.length})
            </h2>
            <span className="text-xs text-gray-400">
              {ganttPlan.totalScheduledTasks} tasks assigned
            </span>
          </div>
          <div className="table-container max-h-[300px] overflow-y-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Window</th>
                  <th>Corridor</th>
                  <th>Day</th>
                  <th>Tasks</th>
                  <th>Type</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {ganttPlan.blocks.map((b) => (
                  <tr key={b.windowId}>
                    <td className="font-mono text-xs font-bold text-navy-900">{b.formattedWindowId}</td>
                    <td className="font-semibold text-xs">{b.corridorId}</td>
                    <td className="text-xs">{b.dayDisplay}</td>
                    <td className="text-xs">
                      <span className="font-bold text-navy-800">{b.tasks.length}</span> task(s) (
                      {b.totalDurationMinutes}m)
                    </td>
                    <td>
                      {b.isShared ? (
                        <span className="badge badge--eng text-[9px]">Joint</span>
                      ) : (
                        <span className="text-[10px] text-gray-500">Single</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`text-xs font-bold ${
                          b.utilizationPercent >= 80
                            ? 'text-green-600'
                            : b.utilizationPercent >= 50
                            ? 'text-amber-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {b.utilizationFormatted}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Unscheduled Tasks Table */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              Unscheduled Tasks ({ganttPlan.totalUnscheduledTasks})
            </h2>
            <span className="text-xs text-amber-600 font-semibold">
              {ganttPlan.totalUnscheduledTasks > 0 ? 'Requires attention' : 'All scheduled'}
            </span>
          </div>
          <div className="table-container max-h-[300px] overflow-y-auto">
            {ganttPlan.unscheduledAssignments.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-2" />
                All tasks successfully scheduled in maintenance windows.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Corridor</th>
                    <th>Dept</th>
                    <th>Duration</th>
                    <th>Criticality</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {ganttPlan.unscheduledAssignments.map((u) => (
                    <tr key={u.taskId}>
                      <td className="font-mono text-xs font-bold text-navy-900">{u.formattedTaskId}</td>
                      <td className="text-xs font-semibold">{u.corridorId}</td>
                      <td>
                        <span
                          className="text-[10px] font-semibold"
                          style={{ color: u.departmentColor }}
                        >
                          {u.departmentShort}
                        </span>
                      </td>
                      <td className="text-xs">{u.estimatedDurationFormatted}</td>
                      <td>
                        <span className={`badge ${u.criticalityBadge.bg} text-[9px]`}>
                          {u.criticalityScoreFormatted}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs font-bold text-red-600">{u.defectSeverity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GanttBlockCard Sub-component
// ---------------------------------------------------------------------------

function GanttBlockCard({
  block,
  hoveredTask,
  onHoverTask,
}: {
  block: GanttBlockViewModel;
  hoveredTask: number | null;
  onHoverTask: (id: number | null) => void;
}) {
  return (
    <div
      className={`border rounded-lg p-2.5 bg-white shadow-sm flex flex-col justify-between ${
        block.isShared ? 'border-purple-300 ring-1 ring-purple-100' : 'border-gray-200'
      }`}
      style={{ minWidth: '240px', maxWidth: '340px' }}
    >
      {/* Block Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-navy-900">{block.formattedWindowId}</span>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-semibold">
            {block.day}
          </span>
        </div>
        {block.isShared && (
          <span className="badge badge--eng text-[9px] flex items-center gap-0.5">
            <Users className="w-2.5 h-2.5" /> Joint ({block.departments.length})
          </span>
        )}
      </div>

      {/* Task Bars Stacked */}
      <div className="space-y-1 my-1">
        {block.tasks.map((task) => (
          <div
            key={task.taskId}
            onMouseEnter={() => onHoverTask(task.taskId)}
            onMouseLeave={() => onHoverTask(null)}
            className="relative rounded px-2 py-1 text-white text-[10px] font-bold flex items-center justify-between cursor-pointer transition-transform hover:scale-[1.02]"
            style={{ background: task.departmentColor }}
          >
            <div className="flex items-center gap-1">
              <span>{task.formattedTaskId}</span>
              <span className="opacity-75 font-normal">({task.departmentShort})</span>
            </div>
            <span className="text-[9px] opacity-90">{task.durationFormatted}</span>

            {/* Hover Tooltip */}
            {hoveredTask === task.taskId && (
              <div className="absolute bottom-full left-0 mb-1.5 bg-navy-900 text-white rounded-lg p-2.5 z-30 shadow-xl min-w-[190px]">
                <div className="text-xs font-bold mb-1">{task.formattedTaskId}</div>
                <div className="text-[10px] space-y-0.5 font-normal text-gray-200">
                  <div>Department: {task.departmentDisplay}</div>
                  <div>Duration: {task.durationFormatted}</div>
                  <div>Criticality: {task.criticalityScoreFormatted} ({task.criticalityLevel})</div>
                  <div>Severity: Class {task.defectSeverity}</div>
                  <div>Status: {task.statusDisplay}</div>
                </div>
                <div className="absolute top-full left-4 border-4 border-transparent border-t-navy-900" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Block Footer: Usage Bar */}
      <div className="mt-1.5 pt-1 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
        <span>{block.totalDurationMinutes}m / {block.availableDurationMinutes}m</span>
        <span className="font-semibold text-navy-800">{block.utilizationFormatted}</span>
      </div>
    </div>
  );
}
