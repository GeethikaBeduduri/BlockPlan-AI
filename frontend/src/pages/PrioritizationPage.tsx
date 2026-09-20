import { useState } from 'react';
import { BrainCircuit, AlertTriangle, Clock, BarChart3, TrendingUp, Info, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import CriticalityBadge from '../components/CriticalityBadge';
import DepartmentBadge from '../components/DepartmentBadge';
import { useAppContext } from '../context/AppContext';
import { getCriticalityLevel } from '../data/mockTasks';

export default function PrioritizationPage() {
  const { tasks } = useAppContext();
  const [selectedTaskId, setSelectedTaskId] = useState('ENG-102');

  const sortedTasks = [...tasks].sort((a, b) => b.criticality_score - a.criticality_score);
  const selectedTask = tasks.find(t => t.task_id === selectedTaskId) || sortedTasks[0];
  const level = getCriticalityLevel(selectedTask.criticality_score);

  const chartData = sortedTasks.slice(0, 12).map(t => ({
    id: t.task_id,
    score: t.criticality_score,
  }));

  const factors = [
    { key: 'Defect Severity', desc: 'How dangerous is the defect?', value: selectedTask.scoring_factors?.defect_severity || 0, icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
    { key: 'Days Overdue', desc: 'How long past the due date?', value: selectedTask.scoring_factors?.overdue_impact || 0, icon: <Clock className="w-4 h-4 text-amber-500" /> },
    { key: 'Failure History', desc: 'Previous failures at this location', value: selectedTask.scoring_factors?.failure_history_impact || 0, icon: <Activity className="w-4 h-4 text-purple-500" /> },
    { key: 'Traffic Density', desc: 'Volume of train movements', value: selectedTask.scoring_factors?.traffic_density_impact || 0, icon: <TrendingUp className="w-4 h-4 text-blue-500" /> },
    { key: 'Department Priority', desc: 'Department-assigned urgency', value: selectedTask.scoring_factors?.department_priority_impact || 0, icon: <BarChart3 className="w-4 h-4 text-cyan-500" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">AI Maintenance Criticality</h1>
          <p className="text-sm text-gray-500 mt-1">XGBoost evaluates maintenance tasks using operational and maintenance factors.</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2 max-w-full sm:max-w-sm">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <span className="text-[11px] text-blue-700">ML determines <strong>priority</strong> (how urgent). The optimizer determines the <strong>schedule</strong> (where and when).</span>
        </div>
      </div>

      {/* Factor Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Defect Severity', desc: 'Physical danger level of the defect', icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: 'border-t-red-500' },
          { label: 'Days Overdue', desc: 'Time past the recommended repair date', icon: <Clock className="w-5 h-5 text-amber-500" />, color: 'border-t-amber-500' },
          { label: 'Failure History', desc: 'Number of prior failures at this asset', icon: <Activity className="w-5 h-5 text-purple-500" />, color: 'border-t-purple-500' },
          { label: 'Traffic Density', desc: 'Train movements on the corridor', icon: <TrendingUp className="w-5 h-5 text-blue-500" />, color: 'border-t-blue-500' },
          { label: 'Dept. Priority', desc: 'Department-assigned urgency level', icon: <BarChart3 className="w-5 h-5 text-cyan-500" />, color: 'border-t-cyan-500' },
        ].map(f => (
          <div key={f.label} className={`card border-t-3 ${f.color}`}>
            <div className="card-body text-center py-4">
              <div className="flex justify-center mb-2">{f.icon}</div>
              <div className="text-xs font-bold text-navy-800">{f.label}</div>
              <div className="text-[10px] text-gray-400 mt-1">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Interactive Score Breakdown */}
        <div className="col-span-1 lg:col-span-2 card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-bold text-navy-900">Score Breakdown</h2>
            </div>
            <select
              value={selectedTaskId}
              onChange={e => setSelectedTaskId(e.target.value)}
              className="px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none"
            >
              {sortedTasks.map(t => (
                <option key={t.task_id} value={t.task_id}>{t.task_id} — {t.criticality_score}</option>
              ))}
            </select>
          </div>
          <div className="card-body space-y-4">
            {/* Task header */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-extrabold text-navy-900">{selectedTask.task_id}</span>
                    <DepartmentBadge department={selectedTask.department} />
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{selectedTask.defect_type}</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black" style={{ color: level.color }}>{selectedTask.criticality_score}</div>
                  <div className="text-xs font-bold" style={{ color: level.color }}>{level.label}</div>
                </div>
              </div>
              <div className="w-full h-3 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${selectedTask.criticality_score}%`, background: level.color }} />
              </div>
            </div>

            {/* Factor bars */}
            <div className="space-y-3">
              {factors.map(f => (
                <div key={f.key}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-xs">
                      {f.icon}
                      <div>
                        <span className="font-semibold text-navy-800">{f.key}</span>
                        <span className="text-gray-400 ml-1">— {f.desc}</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-navy-800">{(f.value * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${f.value * 100 * 2.5}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[10px] text-gray-400 italic border-t border-gray-100 pt-3">
              The XGBoost model produces a criticality score (0–100) that determines scheduling priority. The final schedule is created by the OR-Tools CP-SAT optimizer.
            </div>
          </div>
        </div>

        {/* Priority Chart */}
        <div className="col-span-1 lg:col-span-3 card">
          <div className="card-header">
            <h2 className="text-sm font-bold text-navy-900">Task Criticality Ranking</h2>
            <span className="text-xs text-gray-400">{sortedTasks.length} tasks evaluated</span>
          </div>
          <div className="card-body">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="id"
                    width={70}
                    tick={{ fontSize: 11, fontWeight: 600 }}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${value}`, 'Criticality Score']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={getCriticalityLevel(entry.score).color}
                        opacity={entry.id === selectedTaskId ? 1 : 0.6}
                        cursor="pointer"
                        onClick={() => setSelectedTaskId(entry.id)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Full ranked list */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">All Tasks — Ranked by Criticality</div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {sortedTasks.map((task, i) => (
                  <div
                    key={task.task_id}
                    onClick={() => setSelectedTaskId(task.task_id)}
                    className={`flex items-center justify-between py-1.5 px-3 rounded-lg cursor-pointer transition-colors ${
                      task.task_id === selectedTaskId ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                      <span className="text-xs font-bold text-navy-800">{task.task_id}</span>
                      <DepartmentBadge department={task.department} />
                      <span className="text-xs text-gray-500">{task.corridor_id}</span>
                    </div>
                    <CriticalityBadge score={task.criticality_score} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
