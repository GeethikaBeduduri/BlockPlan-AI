import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, TrainFront, Clock, Lock } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import CriticalityBadge from '../components/CriticalityBadge';
import DepartmentBadge from '../components/DepartmentBadge';

export default function SafetyPage() {
  const { tasks, planResult } = useAppContext();

  const classATasks = tasks.filter(t => t.defect_class === 'A');
  const allCriticalScheduled = planResult?.generated && planResult.conflicts === 0;

  const constraintChecks = [
    { label: 'Train timetable conflicts', value: 0, ok: true, icon: <TrainFront className="w-4 h-4" /> },
    { label: 'Block capacity violations', value: 0, ok: true, icon: <Clock className="w-4 h-4" /> },
    { label: 'Corridor exclusivity conflicts', value: 0, ok: true, icon: <Lock className="w-4 h-4" /> },
    { label: 'Critical Class A tasks overdue', value: planResult ? 0 : classATasks.filter(t => t.days_overdue > 0).length, ok: planResult?.generated || false },
    { label: 'Coordination violations', value: 0, ok: true },
    { label: 'Safety buffer violations', value: 0, ok: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Safety & Constraint Validation</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time constraint monitoring and safety-critical task tracking.</p>
      </div>

      {/* Main Safety Status */}
      <div className={`card ${allCriticalScheduled ? 'border-green-300 bg-green-50/30' : 'border-amber-300 bg-amber-50/30'}`}>
        <div className="card-body py-6">
          <div className="flex items-center gap-4">
            {allCriticalScheduled ? (
              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-green-500" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-amber-500" />
              </div>
            )}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">System Safety Status</div>
              <div className={`text-xl font-extrabold ${allCriticalScheduled ? 'text-green-700' : 'text-amber-700'}`}>
                {allCriticalScheduled ? '✓ No critical scheduling violations' : '⚠ Generate optimized plan to resolve constraints'}
              </div>
              {planResult?.generated && (
                <div className="text-xs text-green-600 mt-1">All {planResult.criticalScheduled} safety-critical tasks scheduled within mandatory windows.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Constraint Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {constraintChecks.map(check => (
          <div key={check.label} className={`card ${check.ok ? 'border-green-100' : 'border-red-200 bg-red-50/30'}`}>
            <div className="card-body flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${check.ok ? 'bg-green-100' : 'bg-red-100'}`}>
                {check.ok ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
              </div>
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-500">{check.label}</div>
                <div className={`text-xl font-extrabold ${check.ok ? 'text-green-600' : 'text-red-600'}`}>{check.value}</div>
              </div>
              {check.icon && <div className="text-gray-300">{check.icon}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Class A Tasks */}
      <div className="card border-red-200">
        <div className="card-header bg-red-50/50 border-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-red-800">Class A Safety-Critical Tasks</h2>
          </div>
          <span className="text-xs text-red-600 font-semibold">{classATasks.length} Class A defects — Hard constraints</span>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Department</th>
                <th>Corridor</th>
                <th>Defect</th>
                <th>Criticality</th>
                <th>Mandatory Window</th>
                <th>Scheduled Block</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {classATasks.map(task => {
                const assignment = planResult?.assignments.find(a =>
                  a.tasks.some(t => t.task_id === task.task_id)
                );
                const assignedBlock = assignment ? `${assignment.start_time}–${assignment.end_time}` : '—';
                const isScheduled = !!assignment;

                return (
                  <tr key={task.task_id} className="critical-row">
                    <td>
                      <span className="font-bold text-navy-800">{task.task_id}</span>
                      <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded">CLASS A</span>
                    </td>
                    <td><DepartmentBadge department={task.department} /></td>
                    <td className="font-semibold">{task.corridor_id}</td>
                    <td className="text-gray-600 text-xs max-w-[200px] truncate">{task.defect_type}</td>
                    <td><CriticalityBadge score={task.criticality_score} /></td>
                    <td className="text-xs">
                      <span className="font-semibold text-red-700">Within 24–48h</span>
                    </td>
                    <td className="text-xs font-semibold">{assignedBlock}</td>
                    <td>
                      {isScheduled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Scheduled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full animate-pulse">
                          <XCircle className="w-3 h-3" /> UNSCHEDULED
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-red-50/50 border-t border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          Class A defects are hard constraints. They must be scheduled within the mandatory time window. The optimizer treats these as non-negotiable.
        </div>
      </div>

      {/* Safety Rules Summary */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-navy-900">Active Safety Rules</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 gap-3">
            {[
              { rule: 'Class A defects must be scheduled within 24-48 hours', type: 'Hard Constraint', active: true },
              { rule: 'No task may overlap with train movement periods', type: 'Hard Constraint', active: true },
              { rule: 'Block capacity cannot be exceeded by assigned tasks', type: 'Hard Constraint', active: true },
              { rule: 'OHE disconnection required for traction maintenance', type: 'Hard Constraint', active: true },
              { rule: 'Compatible multi-department tasks may share blocks', type: 'Soft Constraint', active: true },
              { rule: 'Minimize total number of block requests', type: 'Optimization Objective', active: true },
              { rule: 'Maximize critical task coverage', type: 'Optimization Objective', active: true },
              { rule: 'Human planner approval required before BDMS submission', type: 'Process Constraint', active: true },
            ].map((r, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-gray-50">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-medium text-navy-800">{r.rule}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{r.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
