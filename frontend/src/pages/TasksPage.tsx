/**
 * Tasks Page — Real Backend Integration.
 *
 * Consumes `GET /tasks` via `useTasks` hook and `adaptTaskList`.
 * Displays real backend fields, server-driven pagination, and filtering controls.
 * Zero client-side criticality fabrication.
 */

import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  X,
  Clock,
  AlertTriangle,
  BarChart3,
  FileText,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Layers,
  Activity,
} from 'lucide-react';
import CriticalityBadge from '../components/CriticalityBadge';
import DepartmentBadge from '../components/DepartmentBadge';
import { useTasks } from '../hooks/useTasks';
import type { TaskViewModel } from '../adapters/types';
import type { Department, DefectSeverity, TaskStatus } from '../api/types';

type SortKey =
  | 'criticalityScore'
  | 'daysOverdue'
  | 'id'
  | 'department'
  | 'corridorId'
  | 'estimatedHours'
  | 'status';

export default function TasksPage() {
  const {
    tasks,
    total,
    page,
    totalPages,
    limit,
    loading,
    error,
    corridorFilter,
    departmentFilter,
    statusFilter,
    setCorridorFilter,
    setDepartmentFilter,
    setStatusFilter,
    clearFilters,
    setPage,
    setLimit,
    refetch,
  } = useTasks({ initialLimit: 50 });

  const [selectedTask, setSelectedTask] = useState<TaskViewModel | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<DefectSeverity | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('criticalityScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Client-side search and severity refinement on top of server paginated results
  const filteredAndSorted = useMemo(() => {
    let result = [...tasks];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.formattedId.toLowerCase().includes(q) ||
          String(t.id).includes(q) ||
          t.corridorId.toLowerCase().includes(q) ||
          t.departmentDisplay.toLowerCase().includes(q) ||
          t.statusDisplay.toLowerCase().includes(q),
      );
    }

    if (severityFilter) {
      result = result.filter((t) => t.defectSeverity === severityFilter);
    }

    result.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];

      if (va === null || va === undefined) return sortDir === 'desc' ? 1 : -1;
      if (vb === null || vb === undefined) return sortDir === 'desc' ? -1 : 1;

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'desc' ? vb - va : va - vb;
      }
      return sortDir === 'desc'
        ? String(vb).localeCompare(String(va))
        : String(va).localeCompare(String(vb));
    });

    return result;
  }, [tasks, search, severityFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';

  const hasActiveFilters = Boolean(
    search || corridorFilter || departmentFilter || statusFilter || severityFilter,
  );

  const handleClearAll = () => {
    setSearch('');
    setSeverityFilter('');
    clearFilters();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">
            Maintenance Tasks
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time maintenance work orders sourced from TMS, TDMS, and SMMS across all railway corridors.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="btn-secondary text-xs self-start sm:self-auto"
          title="Refresh tasks from backend"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Fetching...' : 'Refresh'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-red-900">
                Failed to load tasks from backend
              </h3>
              <p className="text-xs text-red-700 mt-0.5">
                {error.message || 'Network error occurred while contacting the FastAPI service.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="btn-danger text-xs self-start sm:self-auto"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card">
        <div className="card-body">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search task ID, corridor, status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Department Filter (Server-Driven) */}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value as Department | '')}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 w-full sm:w-auto bg-white font-medium text-navy-800"
            >
              <option value="">All Departments</option>
              <option value="Engineering">Engineering (Track)</option>
              <option value="Traction">Traction (OHE)</option>
              <option value="S&T">Signal & Telecom (S&T)</option>
            </select>

            {/* Defect Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as DefectSeverity | '')}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 w-full sm:w-auto bg-white font-medium text-navy-800"
            >
              <option value="">All Severities</option>
              <option value="A">Severity A (Critical)</option>
              <option value="B">Severity B (Major)</option>
              <option value="C">Severity C (Minor)</option>
            </select>

            {/* Task Status Filter (Server-Driven) */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | '')}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 w-full sm:w-auto bg-white font-medium text-navy-800"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="scheduled">Scheduled</option>
              <option value="unscheduled">Unscheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Corridor Filter (Server-Driven) */}
            <div className="relative w-full sm:w-36">
              <input
                type="text"
                placeholder="Corridor (e.g. COR_01)"
                value={corridorFilter}
                onChange={(e) => setCorridorFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={handleClearAll}
                className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}

            {/* Count & Pagination Meta */}
            <div className="text-xs text-gray-500 w-full sm:w-auto sm:ml-auto flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-blue-600 inline" />
              <span>
                {error ? (
                  <span className="text-red-600 font-medium">Connection error</span>
                ) : (
                  <>
                    Showing <strong className="text-navy-900">{filteredAndSorted.length}</strong> of{' '}
                    <strong className="text-navy-900">{total}</strong> total tasks
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table & States */}
      <div className="card">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-navy-800">
              Loading maintenance tasks...
            </p>
            <p className="text-xs text-gray-400">Fetching live database records</p>
          </div>
        ) : error ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-red-900">Failed to load tasks from backend</h3>
            <p className="text-xs text-red-700 max-w-sm mx-auto">
              {error.message || 'Network error occurred while contacting the FastAPI service.'}
            </p>
            <button onClick={() => refetch()} className="btn-danger text-xs mx-auto mt-2">
              Retry Connection
            </button>
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto text-gray-400">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-navy-900">No maintenance tasks found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No tasks match the selected filters. Try clearing your filters or changing corridor criteria.'
                : 'No maintenance records exist in the database yet.'}
            </p>
            {hasActiveFilters && (
              <button onClick={handleClearAll} className="btn-secondary text-xs mx-auto mt-2">
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('id')} className="cursor-pointer">
                    Task ID{sortArrow('id')}
                  </th>
                  <th onClick={() => handleSort('department')} className="cursor-pointer">
                    Department{sortArrow('department')}
                  </th>
                  <th onClick={() => handleSort('corridorId')} className="cursor-pointer">
                    Corridor{sortArrow('corridorId')}
                  </th>
                  <th>Severity</th>
                  <th onClick={() => handleSort('daysOverdue')} className="cursor-pointer">
                    Overdue{sortArrow('daysOverdue')}
                  </th>
                  <th onClick={() => handleSort('estimatedHours')} className="cursor-pointer">
                    Duration{sortArrow('estimatedHours')}
                  </th>
                  <th>Asset Age</th>
                  <th onClick={() => handleSort('criticalityScore')} className="cursor-pointer">
                    Criticality (ML){sortArrow('criticalityScore')}
                  </th>
                  <th onClick={() => handleSort('status')} className="cursor-pointer">
                    Status{sortArrow('status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((task) => (
                  <tr
                    key={task.id}
                    className={`cursor-pointer hover:bg-blue-50/40 transition-colors ${
                      task.defectSeverity === 'A' ? 'critical-row' : ''
                    }`}
                    onClick={() => setSelectedTask(task)}
                  >
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-navy-900">{task.formattedId}</span>
                        <span className="text-[10px] text-gray-400 font-mono">#{task.id}</span>
                      </div>
                    </td>
                    <td>
                      <DepartmentBadge department={task.department} />
                    </td>
                    <td>
                      <span className="font-semibold text-navy-800">{task.corridorId}</span>
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-bold rounded-full ${
                          task.defectSeverity === 'A'
                            ? 'bg-red-100 text-red-700'
                            : task.defectSeverity === 'B'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        Class {task.defectSeverity}
                      </span>
                    </td>
                    <td>
                      {task.daysOverdue > 0 ? (
                        <span className="text-red-600 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 inline" />
                          {task.daysOverdue}d
                        </span>
                      ) : (
                        <span className="text-green-600 font-medium text-xs">On Schedule</span>
                      )}
                    </td>
                    <td>
                      <span className="text-gray-700 font-medium">{task.estimatedDurationFormatted}</span>
                      <span className="text-[10px] text-gray-400 ml-1">({task.estimatedHours}h)</span>
                    </td>
                    <td>
                      <span className="text-gray-600 text-xs">{task.assetAgeYears} yrs</span>
                    </td>
                    <td>
                      <CriticalityBadge score={task.criticalityScore} />
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          task.status === 'unscheduled'
                            ? 'badge--critical'
                            : task.status === 'scheduled'
                            ? 'badge--eng'
                            : task.status === 'completed'
                            ? 'badge--low'
                            : 'badge--medium'
                        }`}
                      >
                        {task.statusDisplay}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && total > 0 && (
          <div className="p-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-blue-400"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-gray-400">|</span>
              <span>
                Page <strong className="text-navy-900">{page}</strong> of{' '}
                <strong className="text-navy-900">{totalPages}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}

function TaskDrawer({ task, onClose }: { task: TaskViewModel; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="drawer z-50">
        {/* Drawer Header */}
        <div className="p-5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900">{task.formattedId}</h2>
              <span className="text-xs text-gray-400 font-mono">ID: {task.id}</span>
              <CriticalityBadge score={task.criticalityScore} />
              {task.defectSeverity === 'A' && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">
                  CLASS A — SAFETY CRITICAL
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {task.departmentDisplay} • Corridor {task.corridorId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="p-5 space-y-5">
          {/* Status & Lifecycle Banner */}
          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-navy-900">Task Planning Status</span>
            </div>
            <span
              className={`badge ${
                task.status === 'unscheduled'
                  ? 'badge--critical'
                  : task.status === 'scheduled'
                  ? 'badge--eng'
                  : 'badge--low'
              }`}
            >
              {task.statusDisplay}
            </span>
          </div>

          {/* Core Properties Grid */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Maintenance Specification
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                ['Database Record ID', `#${task.id}`],
                ['Corridor Code', task.corridorId],
                ['Department', task.departmentShort],
                ['Defect Class', `Class ${task.defectSeverity}`],
                ['Estimated Duration', `${task.estimatedHours} hrs (${task.estimatedMinutes} min)`],
                ['Asset Age', `${task.assetAgeYears} years`],
                ['Days Overdue', `${task.daysOverdue} days`],
                ['System Status', task.statusDisplay],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                  <div className="text-[10px] text-gray-400 font-semibold uppercase">{label}</div>
                  <div className="text-sm font-semibold text-navy-800 mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Overdue Warning */}
          {task.daysOverdue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-bold text-red-700">
                  {task.daysOverdue} Days Overdue
                </div>
                <div className="text-xs text-red-600 mt-0.5">
                  This work order exceeds safety threshold limits. The optimizer prioritizes this task in the next available block window.
                </div>
              </div>
            </div>
          )}

          {/* ML Criticality Section */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> XGBoost ML Criticality Score
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-extrabold" style={{ color: task.criticalityBadge.color }}>
                  {task.criticalityScoreFormatted}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: task.criticalityBadge.bg,
                    color: task.criticalityBadge.color,
                  }}
                >
                  {task.criticalityLevel} Priority
                </span>
              </div>

              {task.criticalityScore !== null ? (
                <div className="w-full h-2.5 rounded-full bg-gray-200 overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, task.criticalityScore))}%`,
                      backgroundColor: task.criticalityBadge.color,
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic mb-2">
                  Not yet scored by ML pipeline. Criticality is computed during batch scoring or plan generation.
                </p>
              )}

              <div className="text-[11px] text-gray-500 leading-relaxed bg-white rounded-lg p-2.5 border border-gray-100">
                The AI criticality score is evaluated backend-side by the XGBoost ML model based on defect severity, overdue days, asset age, and corridor parameters.
              </div>
            </div>
          </div>

          {/* Audit Timestamps */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Audit Metadata
            </h3>
            <div className="space-y-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-400">Created Timestamp:</span>
                <span className="font-mono">{task.createdAtFormatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Backend ID:</span>
                <span className="font-mono">{task.id}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
