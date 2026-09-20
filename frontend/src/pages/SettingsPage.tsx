import { useState } from 'react';
import {
  Sliders,
  Bell,
  Shield,
  Database,
  CheckCircle2,
  RotateCcw,
  Save,
  Cpu,
  Zap,
  Info,
  Scale,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface OptimizationSettings {
  criticalityWeight: number;
  blockUtilizationWeight: number;
  delayReductionWeight: number;
  assetAvailabilityWeight: number;
  solver: 'ortools' | 'greedy' | 'hybrid';
  maxSolverTime: number;
  bundlingBonus: number;
}

interface NotificationSettings {
  classATaskReported: boolean;
  planGenerationComplete: boolean;
  safetyViolation: boolean;
  dataSyncFailure: boolean;
  taskOverride: boolean;
  blockUtilizationBelowThreshold: boolean;
}

interface SafetySettings {
  classAMandatoryWindow: string;
  minSafetyBufferMinutes: number;
  maxBlockDurationMinutes: number;
  requireHumanApproval: string;
}

const DEFAULT_OPTIMIZATION: OptimizationSettings = {
  criticalityWeight: 40,
  blockUtilizationWeight: 25,
  delayReductionWeight: 20,
  assetAvailabilityWeight: 15,
  solver: 'ortools',
  maxSolverTime: 30,
  bundlingBonus: 30,
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  classATaskReported: true,
  planGenerationComplete: true,
  safetyViolation: true,
  dataSyncFailure: true,
  taskOverride: true,
  blockUtilizationBelowThreshold: false,
};

const DEFAULT_SAFETY: SafetySettings = {
  classAMandatoryWindow: '24-48 hours',
  minSafetyBufferMinutes: 15,
  maxBlockDurationMinutes: 120,
  requireHumanApproval: 'Always',
};

const SETTINGS_STORAGE_KEY = 'railway_block_plan_settings_v1';

export default function SettingsPage() {
  const { addToast } = useAppContext();

  // Load persisted settings or fallback to defaults
  const [opt, setOpt] = useState<OptimizationSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY + '_opt');
      return saved ? JSON.parse(saved) : DEFAULT_OPTIMIZATION;
    } catch {
      return DEFAULT_OPTIMIZATION;
    }
  });

  const [notifs, setNotifs] = useState<NotificationSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY + '_notifs');
      return saved ? JSON.parse(saved) : DEFAULT_NOTIFICATIONS;
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  });

  const [safety, setSafety] = useState<SafetySettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY + '_safety');
      return saved ? JSON.parse(saved) : DEFAULT_SAFETY;
    } catch {
      return DEFAULT_SAFETY;
    }
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Calculate sum of weights
  const totalWeight =
    opt.criticalityWeight +
    opt.blockUtilizationWeight +
    opt.delayReductionWeight +
    opt.assetAvailabilityWeight;

  const handleSliderChange = (key: keyof OptimizationSettings, val: number) => {
    setOpt(prev => ({ ...prev, [key]: val }));
    setHasUnsavedChanges(true);
    setSavedSuccess(false);
  };

  const handleAutoBalance = () => {
    if (totalWeight === 0) {
      setOpt(prev => ({
        ...prev,
        criticalityWeight: 40,
        blockUtilizationWeight: 25,
        delayReductionWeight: 20,
        assetAvailabilityWeight: 15,
      }));
      return;
    }
    const factor = 100 / totalWeight;
    const c = Math.round(opt.criticalityWeight * factor);
    const b = Math.round(opt.blockUtilizationWeight * factor);
    const d = Math.round(opt.delayReductionWeight * factor);
    const a = 100 - (c + b + d);
    setOpt(prev => ({
      ...prev,
      criticalityWeight: c,
      blockUtilizationWeight: b,
      delayReductionWeight: d,
      assetAvailabilityWeight: Math.max(0, a),
    }));
    setHasUnsavedChanges(true);
  };

  const toggleNotif = (key: keyof NotificationSettings) => {
    setNotifs(prev => ({ ...prev, [key]: !prev[key] }));
    setHasUnsavedChanges(true);
    setSavedSuccess(false);
  };

  const handleSafetyChange = (key: keyof SafetySettings, val: any) => {
    setSafety(prev => ({ ...prev, [key]: val }));
    setHasUnsavedChanges(true);
    setSavedSuccess(false);
  };

  const handleSave = () => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY + '_opt', JSON.stringify(opt));
      localStorage.setItem(SETTINGS_STORAGE_KEY + '_notifs', JSON.stringify(notifs));
      localStorage.setItem(SETTINGS_STORAGE_KEY + '_safety', JSON.stringify(safety));
      setHasUnsavedChanges(false);
      setSavedSuccess(true);
      if (addToast) {
        addToast('Settings saved successfully and applied to scheduling engine.', 'success');
      }
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  const handleResetDefaults = () => {
    setOpt(DEFAULT_OPTIMIZATION);
    setNotifs(DEFAULT_NOTIFICATIONS);
    setSafety(DEFAULT_SAFETY);
    localStorage.removeItem(SETTINGS_STORAGE_KEY + '_opt');
    localStorage.removeItem(SETTINGS_STORAGE_KEY + '_notifs');
    localStorage.removeItem(SETTINGS_STORAGE_KEY + '_safety');
    setHasUnsavedChanges(false);
    setSavedSuccess(true);
    if (addToast) {
      addToast('Settings reset to system defaults.', 'info');
    }
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Global Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 tracking-tight">Settings & Optimizer Controls</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure AI scheduling weights, solver algorithms, safety constraints, and alerting preferences.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="btn-outline flex items-center gap-1.5 text-xs py-2 px-3 hover:bg-gray-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className={`btn-primary flex items-center gap-1.5 text-xs py-2 px-4 shadow-sm transition-all ${
              hasUnsavedChanges ? 'ring-2 ring-blue-400 ring-offset-1 animate-pulse' : ''
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {hasUnsavedChanges ? 'Save Changes *' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Save feedback banner */}
      {savedSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-green-700 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          Settings successfully persisted and active for subsequent optimization cycles.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Optimization Settings */}
        <div className="card shadow-sm border-gray-100">
          <div className="card-header border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-navy-900">Optimization Objective Weights</h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  totalWeight === 100
                    ? 'bg-green-100 text-green-800 border border-green-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                Sum: {totalWeight}%
              </span>
              {totalWeight !== 100 && (
                <button
                  onClick={handleAutoBalance}
                  className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded hover:bg-blue-100 font-semibold flex items-center gap-1"
                  title="Auto normalize weights to equal 100%"
                >
                  <Scale className="w-3 h-3" />
                  Balance
                </button>
              )}
            </div>
          </div>

          <div className="card-body space-y-4">
            {/* Sliders */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-gray-700 flex items-center gap-1.5">
                    Criticality Weight
                    <span className="text-[10px] text-gray-400 font-normal">(Task urgency & defect priority)</span>
                  </span>
                  <span className="font-bold text-blue-600 font-mono text-sm">{opt.criticalityWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opt.criticalityWeight}
                  onChange={e => handleSliderChange('criticalityWeight', Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-all"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-gray-700 flex items-center gap-1.5">
                    Block Utilization Weight
                    <span className="text-[10px] text-gray-400 font-normal">(Fill maintenance window capacity)</span>
                  </span>
                  <span className="font-bold text-indigo-600 font-mono text-sm">{opt.blockUtilizationWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opt.blockUtilizationWeight}
                  onChange={e => handleSliderChange('blockUtilizationWeight', Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 transition-all"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-gray-700 flex items-center gap-1.5">
                    Delay Reduction Weight
                    <span className="text-[10px] text-gray-400 font-normal">(Minimize train path conflicts)</span>
                  </span>
                  <span className="font-bold text-amber-600 font-mono text-sm">{opt.delayReductionWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opt.delayReductionWeight}
                  onChange={e => handleSliderChange('delayReductionWeight', Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600 transition-all"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-gray-700 flex items-center gap-1.5">
                    Asset Availability Weight
                    <span className="text-[10px] text-gray-400 font-normal">(Maximize revenue corridor uptime)</span>
                  </span>
                  <span className="font-bold text-emerald-600 font-mono text-sm">{opt.assetAvailabilityWeight}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opt.assetAvailabilityWeight}
                  onChange={e => handleSliderChange('assetAvailabilityWeight', Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 transition-all"
                />
              </div>
            </div>

            {/* Solver Selector */}
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-navy-800">Optimization Solver Engine</span>
                <span className="text-[10px] text-gray-400 uppercase tracking-wide font-mono">
                  Current: {opt.solver === 'ortools' ? 'Google CP-SAT' : opt.solver === 'greedy' ? 'Greedy Baseline' : 'Hybrid Solver'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpt(prev => ({ ...prev, solver: 'ortools' }));
                    setHasUnsavedChanges(true);
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    opt.solver === 'ortools'
                      ? 'bg-navy-900 text-white shadow-sm ring-2 ring-navy-900 ring-offset-1'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  OR-Tools CP-SAT
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpt(prev => ({ ...prev, solver: 'greedy' }));
                    setHasUnsavedChanges(true);
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    opt.solver === 'greedy'
                      ? 'bg-navy-900 text-white shadow-sm ring-2 ring-navy-900 ring-offset-1'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Greedy Baseline
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpt(prev => ({ ...prev, solver: 'hybrid' }));
                    setHasUnsavedChanges(true);
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    opt.solver === 'hybrid'
                      ? 'bg-navy-900 text-white shadow-sm ring-2 ring-navy-900 ring-offset-1'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5" />
                  Hybrid Bundler
                </button>
              </div>
            </div>

            {/* Extra Solver Tuning */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Max Solver Time</label>
                <select
                  value={opt.maxSolverTime}
                  onChange={e => handleSliderChange('maxSolverTime', Number(e.target.value))}
                  className="w-full text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                >
                  <option value={10}>10 seconds (Fast)</option>
                  <option value={30}>30 seconds (Balanced)</option>
                  <option value={60}>60 seconds (High Optimality)</option>
                  <option value={120}>120 seconds (Deep Search)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Multi-Dept Co-Scheduling Bonus</label>
                <select
                  value={opt.bundlingBonus}
                  onChange={e => handleSliderChange('bundlingBonus', Number(e.target.value))}
                  className="w-full text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
                >
                  <option value={10}>10 pts (Light Bundling)</option>
                  <option value={30}>30 pts (Recommended)</option>
                  <option value={50}>50 pts (Aggressive Co-Scheduling)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="card shadow-sm border-gray-100">
          <div className="card-header border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-navy-900">Alerts & Notifications</h2>
            </div>
          </div>
          <div className="card-body space-y-3">
            {[
              { key: 'classATaskReported' as const, label: 'Class A Critical Defect Reported', desc: 'Instant priority alert when urgent safety defect is ingested.' },
              { key: 'planGenerationComplete' as const, label: 'Plan Generation Ready', desc: 'Notify when CP-SAT background optimizer finishes solving.' },
              { key: 'safetyViolation' as const, label: 'Safety Constraint Violation Alert', desc: 'Warn if corridor matching or capacity is exceeded.' },
              { key: 'dataSyncFailure' as const, label: 'TMS / TDMS / SMMS Data Sync Failure', desc: 'Notify when external data integration loses connection.' },
              { key: 'taskOverride' as const, label: 'Task Manual Override Logged', desc: 'Alert when section controller forces an unscheduled task.' },
              { key: 'blockUtilizationBelowThreshold' as const, label: 'Low Block Utilization Warning (<60%)', desc: 'Warn if scheduled track window is severely underutilized.' },
            ].map(n => (
              <div
                key={n.key}
                onClick={() => toggleNotif(n.key)}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors border border-transparent hover:border-gray-100"
              >
                <div className="pr-4">
                  <div className="text-xs font-semibold text-gray-800">{n.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{n.desc}</div>
                </div>
                <button
                  type="button"
                  className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors focus:outline-none flex-shrink-0 ${
                    notifs[n.key] ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      notifs[n.key] ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Safety Settings */}
        <div className="card shadow-sm border-gray-100">
          <div className="card-header border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-navy-900">Safety & Compliance Rules</h2>
            </div>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Class A Mandatory Scheduling Window
                </label>
                <select
                  value={safety.classAMandatoryWindow}
                  onChange={e => handleSafetyChange('classAMandatoryWindow', e.target.value)}
                  className="w-full text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="12-24 hours">12–24 hours (Urgent Safety)</option>
                  <option value="24-48 hours">24–48 hours (Standard)</option>
                  <option value="48-72 hours">48–72 hours (Extended)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Min Safety Buffer Between Blocks
                </label>
                <select
                  value={safety.minSafetyBufferMinutes}
                  onChange={e => handleSafetyChange('minSafetyBufferMinutes', Number(e.target.value))}
                  className="w-full text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                >
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes (Standard IR Rule)</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes (High-Speed Line)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Maximum Block Window Duration
                </label>
                <select
                  value={safety.maxBlockDurationMinutes}
                  onChange={e => handleSafetyChange('maxBlockDurationMinutes', Number(e.target.value))}
                  className="w-full text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                >
                  <option value={90}>90 minutes (1.5 hrs)</option>
                  <option value={120}>120 minutes (2.0 hrs)</option>
                  <option value={180}>180 minutes (3.0 hrs)</option>
                  <option value={240}>240 minutes (4.0 hrs)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Require Human Review Before BDMS Sync
                </label>
                <select
                  value={safety.requireHumanApproval}
                  onChange={e => handleSafetyChange('requireHumanApproval', e.target.value)}
                  className="w-full text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg p-2.5 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Always">Always (Full Guardrail)</option>
                  <option value="Critical Only">Critical & High Impact Only</option>
                  <option value="Auto-Approve">Auto-Approve Feasible Plans</option>
                </select>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-800">
              <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span>
                Safety constraints are strictly validated by the CP-SAT engine. No block plan violating corridor limits or capacity can be committed.
              </span>
            </div>
          </div>
        </div>

        {/* System Information */}
        <div className="card shadow-sm border-gray-100">
          <div className="card-header border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-600" />
              <h2 className="text-sm font-bold text-navy-900">System Runtime Diagnostics</h2>
            </div>
          </div>
          <div className="card-body space-y-2.5">
            {[
              { label: 'Application Version', value: '1.2.0 — SIH26027 Production' },
              { label: 'ML Criticality Engine', value: 'XGBoost v3.4.1 (Trained on historical work orders)' },
              { label: 'Constraint Solver', value: 'Google OR-Tools CP-SAT 9.15 (with heuristic fallback)' },
              { label: 'Railway Zone', value: 'Northern Railway (NR)' },
              { label: 'Operating Division', value: 'Delhi — Ambala Mainline Corridor' },
              { label: 'Backend API Status', value: 'FastAPI + SQLAlchemy (PostgreSQL Connected)' },
              { label: 'Co-Scheduling Strategy', value: 'Multi-Department Bundling (Engineering + Traction + S&T)' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-500">{s.label}</span>
                <span className="text-xs font-bold text-navy-900 font-mono">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
