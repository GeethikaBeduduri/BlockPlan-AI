import { CheckCircle2, Database, ArrowDown, Cpu, BrainCircuit, Users, FileOutput, AlertTriangle } from 'lucide-react';

const dataSources = [
  {
    id: 'tms',
    name: 'TMS',
    fullName: 'Track Management System',
    department: 'Engineering',
    description: 'Track and structural maintenance records, inspections, and defects.',
    status: 'Connected',
    lastSync: '08:45 AM',
    records: '1,247',
    color: '#2563eb',
  },
  {
    id: 'tdms',
    name: 'TDMS',
    fullName: 'Traction Distribution Management System',
    department: 'Traction Distribution',
    description: 'OHE, substation, and power supply defect data.',
    status: 'Connected',
    lastSync: '08:42 AM',
    records: '892',
    color: '#7c3aed',
  },
  {
    id: 'smms',
    name: 'SMMS',
    fullName: 'Signalling Maintenance & Management System',
    department: 'Signal & Telecom',
    description: 'Signalling and telecom asset maintenance records.',
    status: 'Connected',
    lastSync: '08:40 AM',
    records: '1,063',
    color: '#0891b2',
  },
  {
    id: 'coa',
    name: 'COA',
    fullName: 'Control Office Application',
    department: 'Operations',
    description: 'Train timetable and block availability data.',
    status: 'Connected',
    lastSync: '08:45 AM',
    records: '3,456',
    color: '#16a34a',
  },
  {
    id: 'bdms',
    name: 'BDMS',
    fullName: 'Block & Disconnection Management System',
    department: 'Output',
    description: 'Final block/disconnection demand submission.',
    status: 'Ready',
    lastSync: '—',
    records: '—',
    color: '#d97706',
  },
];

const flowSteps = [
  { label: 'TMS / TDMS / SMMS', icon: <Database className="w-5 h-5" />, desc: 'Maintenance task data', color: '#6783b7' },
  { label: 'Unified Maintenance Data', icon: <Database className="w-5 h-5" />, desc: 'Merged & normalized', color: '#4a6a9e' },
  { label: 'XGBoost Criticality', icon: <BrainCircuit className="w-5 h-5" />, desc: 'ML prioritization', color: '#2563eb' },
  { label: 'COA Block Windows', icon: <Database className="w-5 h-5" />, desc: 'Available maintenance windows', color: '#16a34a' },
  { label: 'OR-Tools CP-SAT', icon: <Cpu className="w-5 h-5" />, desc: 'Constraint optimization', color: '#7c3aed' },
  { label: 'Optimized Plan', icon: <FileOutput className="w-5 h-5" />, desc: 'Best feasible schedule', color: '#0891b2' },
  { label: 'Planner Review', icon: <Users className="w-5 h-5" />, desc: 'Human approval', color: '#d97706' },
  { label: 'BDMS Submission', icon: <FileOutput className="w-5 h-5" />, desc: 'Final block demand', color: '#dc2626' },
];

export default function DataSourcesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Data Sources</h1>
        <p className="text-sm text-gray-500 mt-1">System integration status and data flow visualization.</p>
      </div>

      {/* Source Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {dataSources.map(src => (
          <div key={src.id} className="card hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${src.color}` }}>
            <div className="card-body text-center py-5">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: `${src.color}15` }}>
                <Database className="w-6 h-6" style={{ color: src.color }} />
              </div>
              <div className="text-lg font-extrabold text-navy-900">{src.name}</div>
              <div className="text-[10px] text-gray-400 font-medium mt-0.5">{src.fullName}</div>
              <div className="text-[10px] text-gray-500 mt-1">{src.department}</div>

              <div className="my-3 h-px bg-gray-100" />

              <div className="flex items-center justify-center gap-1 mb-2">
                {src.status === 'Connected' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
                <span className={`text-xs font-bold ${src.status === 'Connected' ? 'text-green-600' : 'text-amber-600'}`}>
                  {src.status}
                </span>
              </div>
              <div className="text-[10px] text-gray-400">Sync: {src.lastSync} • {src.records} rec</div>
            </div>
          </div>
        ))}
      </div>

      {/* Data Flow Architecture */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-navy-900">End-to-End Data Pipeline Architecture</h2>
          </div>
        </div>
        <div className="card-body">
          <div className="flex flex-col items-center gap-1 py-4">
            {flowSteps.map((step, i) => (
              <div key={i} className="flex flex-col items-center w-full sm:w-auto">
                <div
                  className="data-flow-node w-full sm:w-[320px] max-w-[320px] flex items-center gap-3 hover:shadow-md transition-all"
                  style={{ borderLeft: `4px solid ${step.color}` }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${step.color}15`, color: step.color }}>
                    {step.icon}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-navy-900">{step.label}</div>
                    <div className="text-[10px] text-gray-400">{step.desc}</div>
                  </div>
                </div>
                {i < flowSteps.length - 1 && (
                  <ArrowDown className="w-4 h-4 text-gray-300 my-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="card">
        <div className="card-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 text-xs">
            {dataSources.map(src => (
              <div key={src.id}>
                <div className="font-bold text-navy-800 mb-1">{src.name}</div>
                <p className="text-gray-500 leading-relaxed">{src.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
