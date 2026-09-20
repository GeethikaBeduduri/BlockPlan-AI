import { useState } from 'react';
import {
  ShieldCheck, Activity, AlertTriangle, Clock, Gauge, Cpu,
  CheckCircle2, Sparkles, ArrowRight, ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import KPICard from '../components/KPICard';
import CriticalityBadge from '../components/CriticalityBadge';
import DepartmentBadge from '../components/DepartmentBadge';
import { useAppContext } from '../context/AppContext';

type Horizon = 'today' | 'week' | 'month';

export default function OverviewPage() {
  const [horizon, setHorizon] = useState<Horizon>('week');
  const { tasks, corridors, blocks, planResult } = useAppContext();
  const navigate = useNavigate();

  const criticalTasks = tasks.filter(t => t.criticality_score >= 90).sort((a, b) => b.criticality_score - a.criticality_score).slice(0, 5);
  const classATasks = tasks.filter(t => t.defect_class === 'A' && t.status === 'Unscheduled');
  const availableBlocks = blocks.filter(b => b.availability_status === 'Available');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Maintenance Block Control Center</h1>
          <p className="text-sm text-gray-500 mt-1">AI-assisted planning across Engineering, Traction Distribution and Signal & Telecom.</p>
        </div>
        <div className="flex items-center bg-white rounded-lg border border-gray-200 p-0.5 self-start sm:self-auto">
          {(['today', 'week', 'month'] as Horizon[]).map(h => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                horizon === h ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {h === 'today' ? 'Today' : h === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          title="Asset Availability"
          value="93.4"
          suffix="%"
          variant="success"
          trend={{ value: '+2.1% vs baseline', direction: 'up' }}
          icon={<ShieldCheck className="w-5 h-5" />}
          tooltip="Percentage of time assets are available for safe train operations"
        />
        <KPICard
          title="Block Utilization"
          value={planResult ? '89.2' : '61.3'}
          suffix="%"
          variant="info"
          trend={planResult ? { value: '+27.9% vs manual', direction: 'up' } : { value: 'Below target', direction: 'down' }}
          icon={<Gauge className="w-5 h-5" />}
          tooltip="Effective usage of allotted maintenance block windows"
        />
        <KPICard
          title="Critical Tasks"
          value={tasks.filter(t => t.criticality_score >= 90).length}
          variant="critical"
          trend={{ value: `${classATasks.length} Class A unscheduled`, direction: classATasks.length > 0 ? 'down' : 'flat' }}
          icon={<AlertTriangle className="w-5 h-5" />}
          tooltip="Tasks with criticality score ≥ 90 requiring immediate attention"
        />
        <KPICard
          title="Unscheduled Class A"
          value={planResult ? 0 : classATasks.length}
          variant={planResult ? 'success' : 'critical'}
          trend={planResult ? { value: 'All scheduled', direction: 'up' } : { value: 'Requires immediate planning', direction: 'down' }}
          icon={<AlertTriangle className="w-5 h-5" />}
          tooltip="Safety-critical defects that must be scheduled within mandatory window"
        />
        <KPICard
          title="Active Block Windows"
          value={availableBlocks.length}
          variant="info"
          trend={{ value: 'From COA', direction: 'flat' }}
          icon={<Clock className="w-5 h-5" />}
          tooltip="Available maintenance windows provided by COA based on train timetable"
        />
        <KPICard
          title="Plan Gen. Time"
          value={planResult ? '8.4' : '—'}
          suffix={planResult ? 'sec' : ''}
          variant="info"
          trend={planResult ? { value: 'OR-Tools CP-SAT', direction: 'flat' } : undefined}
          icon={<Cpu className="w-5 h-5" />}
          tooltip="Time taken by OR-Tools optimizer to generate feasible plan"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Planning Status */}
        <div className="card col-span-1 lg:col-span-1">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h2 className="text-sm font-bold text-navy-900">AI Planning Status</h2>
            </div>
          </div>
          <div className="card-body space-y-4">
            {/* Data Sources */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Data Synchronized</div>
              <div className="space-y-2">
                {[
                  { name: 'TMS', label: 'Track Management', ok: true },
                  { name: 'TDMS', label: 'Traction Distribution', ok: true },
                  { name: 'SMMS', label: 'Signalling Maintenance', ok: true },
                  { name: 'COA', label: 'Block Availability', ok: true },
                ].map(src => (
                  <div key={src.name} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-xs font-bold text-navy-800">{src.name}</span>
                      <span className="text-[10px] text-gray-400">{src.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Timing */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Last Synchronization</span>
                <span className="font-bold text-navy-800">08:45 AM</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Model</span>
                <span className="font-bold text-navy-800">XGBoost Criticality</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Optimizer</span>
                <span className="font-bold text-navy-800">OR-Tools CP-SAT</span>
              </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Plan Status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Plan Status</span>
              {planResult ? (
                <span className="badge badge--medium">
                  <span className="status-dot status-dot--warning" />
                  Human Review Required
                </span>
              ) : (
                <span className="text-xs font-semibold text-gray-400">Not Generated</span>
              )}
            </div>
          </div>
        </div>

        {/* Critical Tasks Panel */}
        <div className="card col-span-1 lg:col-span-2">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-bold text-navy-900">Highest Priority Tasks</h2>
            </div>
            <button onClick={() => navigate('/tasks')} className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Task ID</th>
                  <th>Department</th>
                  <th>Asset</th>
                  <th>Corridor</th>
                  <th>Defect</th>
                  <th>Criticality</th>
                  <th>Overdue</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {criticalTasks.map((task, i) => (
                  <tr key={task.task_id} className={task.defect_class === 'A' ? 'critical-row' : ''}>
                    <td className="font-bold text-gray-400">{i + 1}</td>
                    <td>
                      <span className="font-bold text-navy-800">{task.task_id}</span>
                      {task.defect_class === 'A' && (
                        <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded">CLASS A</span>
                      )}
                    </td>
                    <td><DepartmentBadge department={task.department} /></td>
                    <td className="text-gray-600">{task.asset_id}</td>
                    <td className="font-semibold">{task.corridor_id}</td>
                    <td className="text-gray-600 max-w-[200px] truncate">{task.defect_type}</td>
                    <td><CriticalityBadge score={task.criticality_score} /></td>
                    <td>
                      {task.days_overdue > 0 ? (
                        <span className="text-red-600 font-bold">{task.days_overdue}d</span>
                      ) : (
                        <span className="text-green-600 font-medium">On time</span>
                      )}
                    </td>
                    <td className="text-gray-600">{task.estimated_duration_min}m</td>
                    <td>
                      {planResult ? (
                        <span className="badge badge--low">Scheduled</span>
                      ) : (
                        <span className="badge badge--critical">Unscheduled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Corridor Status */}
        <div className="card col-span-1 lg:col-span-1">
          <div className="card-header">
            <h2 className="text-sm font-bold text-navy-900">Corridor Status</h2>
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <div className="card-body space-y-2">
            {corridors.map(c => {
              const corBlocks = blocks.filter(b => b.corridor_id === c.corridor_id && b.availability_status === 'Available');
              const nextBlock = corBlocks[0];
              const statusColors: Record<string, string> = {
                Available: 'bg-green-500',
                Maintenance: 'bg-blue-500',
                Restricted: 'bg-red-500',
                Critical: 'bg-red-600',
              };
              return (
                <div key={c.corridor_id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusColors[c.status]}`} />
                    <div>
                      <div className="text-xs font-bold text-navy-800">{c.corridor_id} — {c.name}</div>
                      <div className="text-[10px] text-gray-400">{c.status}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {nextBlock ? (
                      <div className="text-[10px] text-gray-500">
                        Next: <span className="font-semibold text-navy-700">{nextBlock.start_time}–{nextBlock.end_time}</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-400">No blocks</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="card col-span-1 lg:col-span-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
          <div className="card-header border-blue-100 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-navy-900">AI Recommendation</h2>
                <p className="text-[10px] text-gray-400">Optimizer-generated suggestion</p>
              </div>
            </div>
            <span className="badge badge--eng">Multi-department opportunity</span>
          </div>
          <div className="card-body">
            <div className="bg-white rounded-lg border border-blue-100 p-4 mb-4">
              <p className="text-sm font-semibold text-navy-800 leading-relaxed">
                "Bundle <span className="text-blue-600 font-bold">ENG-102</span> and <span className="text-cyan-600 font-bold">SIG-078</span> on Corridor C05 during the <span className="font-bold">10:00–11:00</span> block. Assign <span className="text-purple-600 font-bold">TRC-044</span> to the 14:00–15:00 block."
              </p>
            </div>

            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Why this allocation?</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {[
                'Same corridor — reduces block requests',
                'Compatible work types — no interference',
                'Combined duration 55 min ≤ 60 min block',
                'All 3 tasks cannot fit (80 min > 60 min)',
                'Highest-value pair selected first',
                'No train conflict in either window',
                'All Class A tasks scheduled within window',
                'Block utilization maximized at 91.7%',
              ].map((reason, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => navigate('/planner')} className="btn-primary justify-center">
                <ArrowRight className="w-4 h-4" />
                Review Recommendation
              </button>
              <button onClick={() => navigate('/gantt')} className="btn-secondary justify-center">
                View in Gantt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
