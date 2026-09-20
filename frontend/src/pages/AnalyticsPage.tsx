import { useState } from 'react';
import { BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell } from 'recharts';

const comparisonData = [
  { metric: 'Asset Availability', manual: 74, ai: 93.4 },
  { metric: 'Block Utilization', manual: 61, ai: 89.2 },
  { metric: 'Critical Coverage', manual: 72, ai: 100 },
  { metric: 'Multi-dept Blocks', manual: 15, ai: 58 },
  { metric: 'On-time Scheduling', manual: 65, ai: 94 },
];

const radarData = [
  { metric: 'Availability', manual: 74, ai: 93 },
  { metric: 'Utilization', manual: 61, ai: 89 },
  { metric: 'Coverage', manual: 72, ai: 100 },
  { metric: 'Coordination', manual: 40, ai: 85 },
  { metric: 'Safety', manual: 80, ai: 100 },
  { metric: 'Speed', manual: 30, ai: 95 },
];

const deptDistribution = [
  { name: 'Engineering', value: 10, color: '#2563eb' },
  { name: 'Traction', value: 7, color: '#7c3aed' },
  { name: 'S&T', value: 7, color: '#0891b2' },
];

const scenarioData = [
  { tasks: 50, corridors: 10, runtime: '2.1s', utilization: 87, coverage: 100 },
  { tasks: 100, corridors: 20, runtime: '8.4s', utilization: 89, coverage: 100 },
  { tasks: 200, corridors: 30, runtime: '18.7s', utilization: 91, coverage: 100 },
  { tasks: 500, corridors: 50, runtime: '42.3s', utilization: 88, coverage: 98 },
];

export default function AnalyticsPage() {
  const [selectedScenario, setSelectedScenario] = useState(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Performance comparison and scenario analysis.</p>
      </div>

      {/* Comparison Banner */}
      <div className="card border-blue-200 bg-gradient-to-r from-blue-50/50 to-white">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold text-navy-900">Manual / Greedy Baseline vs AI Optimized</h2>
          </div>
          <p className="text-[10px] text-gray-400 mb-4">Simulated comparison based on prototype data. These are not actual Indian Railways statistics.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {comparisonData.map(d => (
              <div key={d.metric} className="bg-white rounded-lg p-3 border border-gray-100">
                <div className="text-[10px] font-semibold text-gray-500 mb-2">{d.metric}</div>
                <div className="flex items-end gap-2 mb-1">
                  <div>
                    <div className="text-[10px] text-gray-400">Manual</div>
                    <div className="text-lg font-bold text-gray-400">{d.manual}%</div>
                  </div>
                  <div className="text-gray-300 text-xs mb-1">→</div>
                  <div>
                    <div className="text-[10px] text-blue-500 font-semibold">AI</div>
                    <div className="text-lg font-extrabold text-blue-600">{d.ai}%</div>
                  </div>
                </div>
                <div className="text-[10px] font-bold text-green-600">+{(d.ai - d.manual).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart Comparison */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-bold text-navy-900">KPI Comparison</h2>
          </div>
          <div className="card-body">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ left: -10 }}>
                  <XAxis dataKey="metric" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="manual" name="Manual Baseline" fill="#d1d5db" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ai" name="AI Optimized" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Radar Chart */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-bold text-navy-900">Performance Radar</h2>
          </div>
          <div className="card-body">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e8ee" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="Manual" dataKey="manual" stroke="#d1d5db" fill="#d1d5db" fillOpacity={0.2} />
                  <Radar name="AI" dataKey="ai" stroke="#2563eb" fill="#2563eb" fillOpacity={0.2} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Task Distribution */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-bold text-navy-900">Task Distribution by Department</h2>
          </div>
          <div className="card-body">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deptDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {deptDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {deptDistribution.map(d => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: d.color }} />
                    <span className="text-gray-700">{d.name}</span>
                  </div>
                  <span className="font-bold text-navy-800">{d.value} tasks</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scenario Testing */}
        <div className="card col-span-2">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-bold text-navy-900">Scenario Testing — Scalability</h2>
            </div>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-4 gap-2 mb-4">
              {scenarioData.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedScenario(i)}
                  className={`p-3 rounded-lg text-center transition-all ${
                    selectedScenario === i
                      ? 'bg-blue-50 border-2 border-blue-300'
                      : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                  }`}
                >
                  <div className="text-lg font-extrabold text-navy-900">{s.tasks}</div>
                  <div className="text-[10px] text-gray-500">Tasks</div>
                  <div className="text-xs font-semibold text-gray-600 mt-1">{s.corridors} corridors</div>
                </button>
              ))}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold">Runtime</div>
                  <div className="text-2xl font-extrabold text-navy-900">{scenarioData[selectedScenario].runtime}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold">Block Utilization</div>
                  <div className="text-2xl font-extrabold text-green-600">{scenarioData[selectedScenario].utilization}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 uppercase font-bold">Critical Coverage</div>
                  <div className="text-2xl font-extrabold text-green-600">{scenarioData[selectedScenario].coverage}%</div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-gray-400 italic flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Simulated results for demonstration purposes. Actual performance depends on hardware and problem complexity.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
