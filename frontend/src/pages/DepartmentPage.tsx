import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, CheckCircle2, XCircle, HelpCircle, Clock, Zap, Cpu, Check, Layers
} from 'lucide-react';
import KPICard from '../components/KPICard';
import CriticalityBadge from '../components/CriticalityBadge';
import ComplaintWorkflowTimeline from '../components/ComplaintWorkflowTimeline';
import { useComplaints } from '../context/ComplaintContext';
import { useAuth } from '../context/AuthContext';
import type { DepartmentType, Complaint } from '../data/mockComplaints';

export default function DepartmentPage() {
  const { complaints, maintenanceTasks, acceptComplaint, rejectComplaint, requestClarification, updateTaskStatus } = useComplaints();
  const { activeDepartment, setActiveDepartment } = useAuth();

  // Selected complaint for review drawer/modal
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [actionMode, setActionMode] = useState<'review' | 'reject' | 'clarify' | null>(null);

  // Technical Assessment Form State
  const [techDefectType, setTechDefectType] = useState('Rail Defect');
  const [assetId, setAssetId] = useState('TRK-114');
  const [confirmedSeverity, setConfirmedSeverity] = useState<'Class A' | 'Class B' | 'Class C'>('Class A');
  const [durationMin, setDurationMin] = useState(30);
  const [requiredTeam, setRequiredTeam] = useState('Track Maintenance Team');
  const [requiredEquipment, setRequiredEquipment] = useState('Track Inspection Equipment');
  const [techRemarks, setTechRemarks] = useState('Immediate rail section replacement required under traffic block.');

  // Reject / Clarify inputs
  const [rejectionReason, setRejectionReason] = useState('');
  const [clarificationMsg, setClarificationMsg] = useState('');

  const { user } = useAuth();
  const targetDept = (user?.role === 'DEPARTMENT' && user.department) ? user.department : activeDepartment;

  // Filter complaints strictly for logged-in department
  const deptComplaints = complaints.filter(c => c.concernedDepartment === targetDept);

  const incoming = deptComplaints.filter(c => c.status === 'PENDING DEPARTMENT ACCEPTANCE' || c.status === 'SUBMITTED' || c.status === 'STATION MASTER UPDATED');
  const accepted = deptComplaints.filter(c => c.status === 'ACCEPTED' || c.status === 'ASSIGNED' || c.status === 'WORK IN PROGRESS');
  const rejected = deptComplaints.filter(c => c.status === 'REJECTED');
  const clarificationReq = deptComplaints.filter(c => c.status === 'CLARIFICATION REQUIRED');
  const activeTasks = deptComplaints.filter(c => c.status === 'WORK IN PROGRESS');
  const completed = deptComplaints.filter(c => c.status === 'RESOLVED' || c.status === 'CLOSED');

  const handleOpenReview = (cmp: Complaint) => {
    setSelectedComplaint(cmp);
    setActionMode('review');
    // Pre-fill assessment based on category
    if (cmp.category === 'Track Defect') {
      setTechDefectType('Rail Defect');
      setAssetId('TRK-114');
      setConfirmedSeverity('Class A');
      setDurationMin(30);
      setRequiredTeam('Track Maintenance Team');
      setRequiredEquipment('Track Inspection Equipment');
    } else if (cmp.category === 'OHE Defect') {
      setTechDefectType('OHE Contact Wire Tension Drop');
      setAssetId('OHE-BZA-Y4-142');
      setConfirmedSeverity('Class A');
      setDurationMin(45);
      setRequiredTeam('Traction OHE Tower Car Team');
      setRequiredEquipment('Tower Wagon TW-04');
    } else {
      setTechDefectType('Signal Point Interlocking Defect');
      setAssetId('SIG-TEL-PT102A');
      setConfirmedSeverity('Class B');
      setDurationMin(25);
      setRequiredTeam('S&T Signal Maintenance Gang');
      setRequiredEquipment('Point Machine Test Kit');
    }
  };

  const handleAcceptSubmit = () => {
    if (!selectedComplaint) return;
    acceptComplaint(selectedComplaint.id, {
      technicalDefectType: techDefectType,
      assetId,
      confirmedSeverity,
      estimatedDurationMin: Number(durationMin),
      requiredTeam,
      requiredEquipment,
      maintenanceRequired: true,
      remarks: techRemarks,
    });
    setSelectedComplaint(null);
    setActionMode(null);
  };

  const handleRejectSubmit = () => {
    if (!selectedComplaint || !rejectionReason.trim()) return;
    rejectComplaint(selectedComplaint.id, rejectionReason);
    setSelectedComplaint(null);
    setActionMode(null);
    setRejectionReason('');
  };

  const handleClarifySubmit = () => {
    if (!selectedComplaint || !clarificationMsg.trim()) return;
    requestClarification(selectedComplaint.id, clarificationMsg);
    setSelectedComplaint(null);
    setActionMode(null);
    setClarificationMsg('');
  };

  return (
    <div className="space-y-6">
      {/* Top Department Selector Banner */}
      <div className="bg-navy-900 rounded-xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border border-navy-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs font-bold border border-blue-500/30 uppercase">
              Department Portal
            </span>
            <span className="text-navy-300 text-xs">• Active Wing: <strong>{targetDept}</strong></span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold mt-1">Technical Assessment & Maintenance Execution</h1>
          <p className="text-navy-300 text-xs sm:text-sm mt-0.5">
            Evaluate Station Master complaints, issue technical assessments, trigger AI criticality scoring, and execute maintenance blocks.
          </p>
        </div>

        {/* Department Switcher */}
        {user?.role !== 'DEPARTMENT' && (
          <div className="flex flex-wrap items-center gap-1.5 bg-navy-950 p-1.5 rounded-lg border border-white/10">
            {(['Engineering', 'Traction', 'Signal & Telecom', 'Electrical'] as DepartmentType[]).map(dept => (
              <button
                key={dept}
                onClick={() => setActiveDepartment(dept)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  targetDept === dept ? 'bg-rail-blue text-white shadow-md' : 'text-navy-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard title="Incoming" value={incoming.length} variant="warning" icon={<Clock className="w-4 h-4" />} />
        <KPICard title="Pending Acceptance" value={incoming.length} variant="info" icon={<HelpCircle className="w-4 h-4" />} />
        <KPICard title="Accepted" value={accepted.length} variant="info" icon={<CheckCircle2 className="w-4 h-4" />} />
        <KPICard title="Rejected" value={rejected.length} variant="critical" icon={<XCircle className="w-4 h-4" />} />
        <KPICard title="Clarification Req." value={clarificationReq.length} variant="warning" icon={<HelpCircle className="w-4 h-4" />} />
        <KPICard title="Active Work" value={activeTasks.length} variant="info" icon={<Zap className="w-4 h-4" />} />
        <KPICard title="Completed" value={completed.length} variant="success" icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      {/* Main Grid: Incoming Complaints + Active Maintenance Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incoming Complaints Panel */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-rail-blue" />
              <h2 className="text-sm font-bold text-navy-900">
                Incoming Complaints — {activeDepartment} Department
              </h2>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              {deptComplaints.length} Total Registered
            </span>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Complaint ID</th>
                  <th>Station & Location</th>
                  <th>Problem Type</th>
                  <th>Station Master Priority</th>
                  <th>Submitted At</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {deptComplaints.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      No complaints assigned to {activeDepartment} department yet.
                    </td>
                  </tr>
                ) : (
                  deptComplaints.map(cmp => {
                    const isPending = cmp.status === 'PENDING DEPARTMENT ACCEPTANCE' || cmp.status === 'SUBMITTED' || cmp.status === 'STATION MASTER UPDATED';
                    return (
                      <tr key={cmp.id} className={isPending ? 'bg-amber-50/40 font-medium' : ''}>
                        <td className="font-bold text-navy-900">{cmp.id}</td>
                        <td>
                          <div className="font-semibold text-gray-800 text-xs">{cmp.station}</div>
                          <div className="text-[10px] text-gray-500">{cmp.location}</div>
                        </td>
                        <td>
                          <div className="font-semibold text-navy-800 text-xs">{cmp.problemType}</div>
                          <div className="text-[10px] text-gray-500 truncate max-w-[150px]">{cmp.title}</div>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            cmp.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                            cmp.priority === 'HIGH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {cmp.priority}
                          </span>
                        </td>
                        <td className="text-xs text-gray-500">{cmp.submittedAt}</td>
                        <td>
                          <span className={`badge ${
                            cmp.status === 'ACCEPTED' || cmp.status === 'ASSIGNED' ? 'badge--eng' :
                            cmp.status === 'REJECTED' ? 'badge--critical' :
                            cmp.status === 'RESOLVED' || cmp.status === 'CLOSED' ? 'badge--low' : 'badge--medium'
                          }`}>
                            {cmp.status}
                          </span>
                        </td>
                        <td>
                          {isPending ? (
                            <button
                              onClick={() => handleOpenReview(cmp)}
                              className="px-3 py-1 bg-rail-blue hover:bg-blue-700 text-white font-bold text-xs rounded transition-colors cursor-pointer"
                            >
                              Review & Assess
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenReview(cmp)}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded cursor-pointer"
                            >
                              View Details
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Sidebar: Active Maintenance Tasks & AI Integration */}
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold text-navy-900">Active Maintenance Tasks</h2>
              </div>
            </div>
            <div className="card-body space-y-3">
              {Object.values(maintenanceTasks).filter(t => t.department === targetDept).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No active maintenance tasks for {targetDept}.</p>
              ) : (
                Object.values(maintenanceTasks)
                  .filter(t => t.department === targetDept)
                  .map(task => (
                    <div key={task.taskId} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-navy-900">{task.taskId}</span>
                        <CriticalityBadge score={task.criticalityScore} />
                      </div>
                      <div className="text-xs text-gray-600">
                        <div><strong>Asset:</strong> {task.assetId} | <strong>Corridor:</strong> {task.corridor}</div>
                        <div><strong>Duration:</strong> {task.duration} min | <strong>Severity:</strong> {task.severity}</div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Status: {task.status}</span>
                        {task.status === 'ASSIGNED' && (
                          <button
                            onClick={() => updateTaskStatus(task.taskId, 'IN_PROGRESS')}
                            className="px-2.5 py-1 bg-amber-600 text-white font-bold text-xs rounded hover:bg-amber-700 cursor-pointer"
                          >
                            Start Work
                          </button>
                        )}
                        {task.status === 'IN_PROGRESS' && (
                          <button
                            onClick={() => updateTaskStatus(task.taskId, 'RESOLVED', 'Completed field repairs and safety inspection.')}
                            className="px-2.5 py-1 bg-green-600 text-white font-bold text-xs rounded hover:bg-green-700 cursor-pointer"
                          >
                            Mark RESOLVED
                          </button>
                        )}
                        {(task.status === 'RESOLVED' || task.status === 'VERIFIED') && (
                          <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Resolved
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Department Complaint Review & Technical Assessment Modal */}
      <AnimatePresence>
      {selectedComplaint && actionMode === 'review' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-overlay"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="modal-content max-w-3xl p-6 space-y-6"
          >
            <div className="flex justify-between items-center border-b border-gray-200 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-navy-900">
                  Department Complaint Technical Assessment — {selectedComplaint.id}
                </h3>
                <p className="text-xs text-gray-500">Target Department: {selectedComplaint.concernedDepartment}</p>
              </div>
              <button onClick={() => { setSelectedComplaint(null); setActionMode(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
            </div>

            {/* Visual Workflow Lifecycle Timeline */}
            <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200/80">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Workflow Lifecycle Progress</div>
              <ComplaintWorkflowTimeline currentStatus={selectedComplaint.status} />
            </div>

            {/* SECTION 1: Station Master Input Summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Station Master Reported Information (Observed Priority: {selectedComplaint.priority})
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><strong>Station:</strong> {selectedComplaint.station}</div>
                <div><strong>Location:</strong> {selectedComplaint.location}</div>
                <div><strong>Category:</strong> {selectedComplaint.category}</div>
                <div><strong>Problem Type:</strong> {selectedComplaint.problemType}</div>
                <div><strong>Submitted By:</strong> {selectedComplaint.submittedBy}</div>
                <div><strong>Submitted At:</strong> {selectedComplaint.submittedAt}</div>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <strong>Title:</strong> {selectedComplaint.title}
              </div>
              <div>
                <strong>Detailed Description:</strong> {selectedComplaint.description}
              </div>
              {selectedComplaint.evidence && (
                <div className="text-blue-600 font-semibold">
                  Evidence Attached: 📁 {selectedComplaint.evidence}
                </div>
              )}
            </div>

            {/* SECTION 2: Department Technical Assessment Form */}
            {selectedComplaint.status === 'PENDING DEPARTMENT ACCEPTANCE' || selectedComplaint.status === 'STATION MASTER UPDATED' ? (
              <div className="space-y-4 border-t border-gray-200 pt-4">
                <div className="text-xs font-bold text-navy-900 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-rail-blue" />
                  <span>Department Technical Assessment</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-gray-700">Technical Defect Type</label>
                    <input
                      type="text"
                      value={techDefectType}
                      onChange={(e) => setTechDefectType(e.target.value)}
                      className="w-full mt-1 p-2 border border-gray-300 rounded font-semibold text-navy-900"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-700">Affected Asset ID</label>
                    <input
                      type="text"
                      value={assetId}
                      onChange={(e) => setAssetId(e.target.value)}
                      className="w-full mt-1 p-2 border border-gray-300 rounded font-semibold text-navy-900"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-700">Confirmed Severity</label>
                    <select
                      value={confirmedSeverity}
                      onChange={(e) => setConfirmedSeverity(e.target.value as 'Class A' | 'Class B' | 'Class C')}
                      className="w-full mt-1 p-2 border border-gray-300 rounded font-bold text-navy-900 bg-white"
                    >
                      <option value="Class A">Class A (Safety Critical)</option>
                      <option value="Class B">Class B (High Operational Risk)</option>
                      <option value="Class C">Class C (Routine Maintenance)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-gray-700">Estimated Duration (minutes)</label>
                    <input
                      type="number"
                      value={durationMin}
                      onChange={(e) => setDurationMin(Number(e.target.value))}
                      className="w-full mt-1 p-2 border border-gray-300 rounded font-semibold text-navy-900"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-700">Required Team</label>
                    <input
                      type="text"
                      value={requiredTeam}
                      onChange={(e) => setRequiredTeam(e.target.value)}
                      className="w-full mt-1 p-2 border border-gray-300 rounded font-semibold text-navy-900"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-700">Required Equipment</label>
                    <input
                      type="text"
                      value={requiredEquipment}
                      onChange={(e) => setRequiredEquipment(e.target.value)}
                      className="w-full mt-1 p-2 border border-gray-300 rounded font-semibold text-navy-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700">Technical Remarks & Maintenance Justification</label>
                  <input
                    type="text"
                    value={techRemarks}
                    onChange={(e) => setTechRemarks(e.target.value)}
                    className="w-full mt-1 p-2 border border-gray-300 rounded text-xs font-medium"
                  />
                </div>

                {/* 3 Action Buttons */}
                <div className="flex flex-col sm:flex-row justify-between gap-3 pt-3 border-t border-gray-200">
                  <div className="flex gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setActionMode('reject')}
                      className="btn-danger text-xs py-2 px-3 cursor-pointer"
                    >
                      [ REJECT COMPLAINT ]
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setActionMode('clarify')}
                      className="btn-secondary text-xs py-2 px-3 text-amber-700 border-amber-300 hover:bg-amber-50 cursor-pointer"
                    >
                      [ REQUEST MORE INFORMATION ]
                    </motion.button>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAcceptSubmit}
                    className="btn-success text-xs py-2 px-6 cursor-pointer"
                  >
                    [ ACCEPT COMPLAINT ]
                  </motion.button>
                </div>
              </div>
            ) : (
              /* Already Accepted Details: Show AI Criticality, COA Windows & CP-SAT Optimization */
              <div className="space-y-5 border-t border-gray-200 pt-4">
                {/* AI Criticality Score Card */}
                <div className="bg-gradient-to-r from-blue-900 to-navy-900 text-white rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-cyan-400" />
                      <div>
                        <h4 className="font-extrabold text-sm">AI Criticality Assessment — Prototype</h4>
                        <p className="text-[10px] text-navy-300">XGBoost Task Prioritization Engine</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-amber-400">96 / 100</div>
                      <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-black rounded uppercase">
                        CRITICAL
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] pt-2 border-t border-white/10">
                    <div>Defect Severity: <strong className="text-white">Class A (35%)</strong></div>
                    <div>Overdue Impact: <strong className="text-white">6 Days (25%)</strong></div>
                    <div>Failure History: <strong className="text-white">3 Incidents (20%)</strong></div>
                    <div>Traffic Density: <strong className="text-white">High (12%)</strong></div>
                    <div>Dept Priority: <strong className="text-white">Critical (8%)</strong></div>
                    <div>Operational Impact: <strong className="text-white">High Risk</strong></div>
                  </div>
                </div>

                {/* COA Maintenance Windows & Optimization */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <h4 className="font-extrabold text-xs text-navy-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>COA Available Windows & Shared Block Allocation (CP-SAT Optimizer)</span>
                  </h4>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-white rounded border border-green-200 text-green-800 font-bold">
                      C05 10:00–11:00 ✓ (Available)
                    </div>
                    <div className="p-2 bg-white rounded border border-green-200 text-green-800 font-bold">
                      C05 14:00–14:30 ✓ (Available)
                    </div>
                    <div className="p-2 bg-white rounded border border-gray-200 text-gray-400 font-semibold line-through">
                      C05 16:00–17:00 ✕ (Conflict)
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-blue-100 text-xs space-y-1.5">
                    <div className="font-bold text-navy-900">Recommended Task-to-Block Assignment:</div>
                    <p className="text-gray-700">
                      Shared Block Opportunity on <strong className="text-blue-600">Corridor C05 (10:00–11:00)</strong>:
                      Bundling <strong>ENG-102</strong> (30 min) + <strong>SIG-078</strong> (25 min) = <strong>55 / 60 min</strong> (91.7% capacity utilization).
                    </p>
                    <div className="flex flex-wrap gap-3 text-[11px] text-green-700 font-semibold pt-1">
                      <span>✓ Same Corridor</span>
                      <span>✓ Compatible Work</span>
                      <span>✓ Capacity Satisfied</span>
                      <span>✓ Safety Validation Passed</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => { setSelectedComplaint(null); setActionMode(null); }} className="btn-primary text-xs cursor-pointer">
                    Close Details
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Reject Modal */}
      <AnimatePresence>
      {selectedComplaint && actionMode === 'reject' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-overlay"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="modal-content p-6 space-y-4"
          >
            <h3 className="font-bold text-base text-red-600">Reject Complaint — {selectedComplaint.id}</h3>
            <p className="text-xs text-gray-600">Please provide mandatory rejection reason for Station Master audit logging.</p>

            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              placeholder="e.g. Complaint does not fall under Engineering jurisdiction. Forwarded to Traction."
              className="w-full p-2 border border-red-300 rounded text-xs"
              required
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setActionMode('review')} className="btn-secondary text-xs cursor-pointer">Back</button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRejectSubmit}
                className="btn-danger text-xs cursor-pointer"
              >
                Confirm Rejection
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Clarification Modal */}
      <AnimatePresence>
      {selectedComplaint && actionMode === 'clarify' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-overlay"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="modal-content p-6 space-y-4"
          >
            <h3 className="font-bold text-base text-amber-700">Request Information — {selectedComplaint.id}</h3>
            <p className="text-xs text-gray-600">Enter clarification message for Station Master:</p>

            <textarea
              value={clarificationMsg}
              onChange={(e) => setClarificationMsg(e.target.value)}
              rows={3}
              placeholder="e.g. Please provide exact track location and supporting photograph."
              className="w-full p-2 border border-amber-300 rounded text-xs"
              required
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setActionMode('review')} className="btn-secondary text-xs cursor-pointer">Back</button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleClarifySubmit}
                className="btn-primary text-xs bg-amber-600 hover:bg-amber-700 cursor-pointer"
              >
                Send Clarification Request
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
