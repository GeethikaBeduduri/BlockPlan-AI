import React, { useState } from 'react';
import {
  FilePlus2, Clock, CheckCircle2, AlertTriangle, AlertCircle, HelpCircle, FileText, CheckSquare, RefreshCw, Upload, Eye
} from 'lucide-react';
import KPICard from '../components/KPICard';
import { useComplaints } from '../context/ComplaintContext';
import { useAuth } from '../context/AuthContext';
import { type DefectCategory, type ComplaintPriority, type Complaint, getDepartmentForCategory } from '../data/mockComplaints';

export default function StationMasterPage() {
  const { complaints, createComplaint, respondClarification, verifyComplaint, reopenComplaint } = useComplaints();
  const { user } = useAuth();

  // Tab State: 'dashboard' | 'create'
  const [activeTab, setActiveTab] = useState<'dashboard' | 'create'>('dashboard');

  // Form state
  const [station, setStation] = useState('Guntur Railway Station');
  const [location, setLocation] = useState('Platform 1, Track No. 2');
  const [category, setCategory] = useState<DefectCategory>('Track Defect');
  const [problemType, setProblemType] = useState('Rail Defect / Gauge Face Crack');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('HIGH');
  const [evidenceName, setEvidenceName] = useState('');
  const [remarks, setRemarks] = useState('');

  // Modals state
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'clarify' | 'verify' | null>(null);
  const [clarificationText, setClarificationText] = useState('');
  const [reopenReasonText, setReopenReasonText] = useState('');

  // Auto-calculated concerned department
  const concernedDept = getDepartmentForCategory(category);

  // Filter complaints for Station Master's station/user
  const myComplaints = complaints.filter(c => c.station.includes(user?.station || 'Guntur') || c.submittedBy.includes(user?.name || 'Station Master') || c.submittedBy.includes('SM-GNT') || c.submittedBy.includes('stationmaster'));

  // Statistics
  const total = myComplaints.length;
  const pending = myComplaints.filter(c => c.status === 'PENDING DEPARTMENT ACCEPTANCE' || c.status === 'SUBMITTED' || c.status === 'STATION MASTER UPDATED').length;
  const accepted = myComplaints.filter(c => c.status === 'ACCEPTED' || c.status === 'ASSIGNED').length;
  const clarificationReq = myComplaints.filter(c => c.status === 'CLARIFICATION REQUIRED').length;
  const inProgress = myComplaints.filter(c => c.status === 'WORK IN PROGRESS').length;
  const resolved = myComplaints.filter(c => c.status === 'RESOLVED' || c.status === 'STATION MASTER VERIFICATION').length;
  const closed = myComplaints.filter(c => c.status === 'CLOSED').length;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    createComplaint({
      station,
      location,
      category,
      problemType,
      title,
      description,
      priority,
      evidence: evidenceName || undefined,
      remarks: remarks || undefined,
    });

    // Reset form & go to dashboard
    setTitle('');
    setDescription('');
    setRemarks('');
    setEvidenceName('');
    setActiveTab('dashboard');
  };

  const handleFileSimulate = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEvidenceName(e.target.files[0].name);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-navy-900 rounded-xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border border-navy-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-navy-300 text-xs">• {user?.station || 'Guntur Railway Station'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold mt-1">Defect Reporting & Verification Portal</h1>
          <p className="text-navy-300 text-xs sm:text-sm mt-0.5">
            Log observed infrastructure defects, receive technical updates from departments, and verify completed maintenance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-rail-blue text-white' : 'bg-white/10 text-navy-200 hover:bg-white/15'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'create' ? 'bg-rail-blue text-white' : 'bg-white/10 text-navy-200 hover:bg-white/15'
            }`}
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Create Complaint</span>
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <div className="space-y-6 animate-fade-in">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <KPICard title="Total" value={total} variant="info" icon={<FileText className="w-4 h-4" />} />
            <KPICard title="Pending Acceptance" value={pending} variant="warning" icon={<Clock className="w-4 h-4" />} />
            <KPICard title="Accepted" value={accepted} variant="info" icon={<CheckCircle2 className="w-4 h-4" />} />
            <KPICard title="Clarification Req." value={clarificationReq} variant="critical" icon={<HelpCircle className="w-4 h-4" />} />
            <KPICard title="In Progress" value={inProgress} variant="info" icon={<RefreshCw className="w-4 h-4" />} />
            <KPICard title="Resolved" value={resolved} variant="warning" icon={<AlertCircle className="w-4 h-4" />} />
            <KPICard title="Closed" value={closed} variant="success" icon={<CheckSquare className="w-4 h-4" />} />
          </div>

          {/* Clarification Required Alert Banner */}
          {clarificationReq > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-amber-900">
                    {clarificationReq} Complaint(s) Require Your Action
                  </h3>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The department has requested additional technical details or photos before accepting your complaint.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const target = myComplaints.find(c => c.status === 'CLARIFICATION REQUIRED');
                  if (target) {
                    setSelectedComplaint(target);
                    setModalMode('clarify');
                  }
                }}
                className="btn-primary text-xs whitespace-nowrap self-start sm:self-auto bg-amber-600 hover:bg-amber-700"
              >
                Provide Details
              </button>
            </div>
          )}

          {/* Verification Required Banner */}
          {resolved > 0 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-green-900">
                    {resolved} Maintenance Task(s) Resolved — Verification Required
                  </h3>
                  <p className="text-xs text-green-700 mt-0.5">
                    Maintenance teams have completed field work. Please inspect and verify work to close the complaint.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const target = myComplaints.find(c => c.status === 'RESOLVED' || c.status === 'STATION MASTER VERIFICATION');
                  if (target) {
                    setSelectedComplaint(target);
                    setModalMode('verify');
                  }
                }}
                className="btn-success text-xs whitespace-nowrap self-start sm:self-auto"
              >
                Inspect & Verify Work
              </button>
            </div>
          )}

          {/* Recent Complaints Table */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-navy-600" />
                <h2 className="text-sm font-bold text-navy-900">Recent Reported Complaints</h2>
              </div>
              <button
                onClick={() => setActiveTab('create')}
                className="btn-primary py-1.5 text-xs"
              >
                + New Complaint
              </button>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Complaint ID</th>
                    <th>Station & Location</th>
                    <th>Category</th>
                    <th>Title / Problem</th>
                    <th>Priority (Observed)</th>
                    <th>Target Dept</th>
                    <th>Submitted At</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myComplaints.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-gray-400">
                        No complaints reported yet. Click "+ New Complaint" to create one.
                      </td>
                    </tr>
                  ) : (
                    myComplaints.map(cmp => {
                      const isClarify = cmp.status === 'CLARIFICATION REQUIRED';
                      const isResolve = cmp.status === 'RESOLVED' || cmp.status === 'STATION MASTER VERIFICATION';
                      return (
                        <tr key={cmp.id} className={isClarify ? 'bg-amber-50/50' : isResolve ? 'bg-green-50/50' : ''}>
                          <td className="font-bold text-navy-900">{cmp.id}</td>
                          <td>
                            <div className="font-semibold text-gray-800 text-xs">{cmp.station}</div>
                            <div className="text-[10px] text-gray-500">{cmp.location}</div>
                          </td>
                          <td>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-semibold">
                              {cmp.category}
                            </span>
                          </td>
                          <td className="max-w-[220px]">
                            <div className="font-semibold text-navy-800 text-xs truncate">{cmp.title}</div>
                            <div className="text-[10px] text-gray-500 truncate">{cmp.problemType}</div>
                          </td>
                          <td>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              cmp.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                              cmp.priority === 'HIGH' ? 'bg-amber-100 text-amber-700' :
                              cmp.priority === 'MEDIUM' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {cmp.priority}
                            </span>
                          </td>
                          <td>
                            <span className="font-bold text-xs text-navy-700">{cmp.concernedDepartment}</span>
                          </td>
                          <td className="text-xs text-gray-500">{cmp.submittedAt}</td>
                          <td>
                            <span className={`badge ${
                              cmp.status === 'CLOSED' ? 'badge--low' :
                              cmp.status === 'ACCEPTED' || cmp.status === 'ASSIGNED' ? 'badge--eng' :
                              cmp.status === 'CLARIFICATION REQUIRED' ? 'badge--critical' :
                              cmp.status === 'RESOLVED' || cmp.status === 'STATION MASTER VERIFICATION' ? 'badge--medium' : 'badge--high'
                            }`}>
                              {cmp.status}
                            </span>
                          </td>
                          <td>
                            {isClarify ? (
                              <button
                                onClick={() => { setSelectedComplaint(cmp); setModalMode('clarify'); }}
                                className="px-2.5 py-1 bg-amber-600 text-white font-semibold text-xs rounded hover:bg-amber-700 cursor-pointer"
                              >
                                Respond
                              </button>
                            ) : isResolve ? (
                              <button
                                onClick={() => { setSelectedComplaint(cmp); setModalMode('verify'); }}
                                className="px-2.5 py-1 bg-green-600 text-white font-semibold text-xs rounded hover:bg-green-700 cursor-pointer"
                              >
                                Verify & Close
                              </button>
                            ) : (
                              <button
                                onClick={() => { setSelectedComplaint(cmp); setModalMode('view'); }}
                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" /> View Details
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
        </div>
      ) : (
        /* Create Complaint Form Tab */
        <div className="card max-w-3xl mx-auto animate-scale-in">
          <div className="card-header bg-navy-950 text-white">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FilePlus2 className="w-5 h-5 text-rail-blue" />
                <span>Station Master Complaint Creation Form</span>
              </h2>
              <p className="text-xs text-navy-300">Fill accurate station & observed defect details for automated department routing.</p>
            </div>
          </div>

          <form onSubmit={handleFormSubmit} className="card-body space-y-5">
            {/* Rule-Based Department Routing Alert */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-xs text-navy-800">
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span className="font-medium">Rule-based Department Routing:</span>
                <strong className="text-blue-700 font-extrabold text-sm">{concernedDept}</strong>
              </div>
              <span className="text-[10px] text-gray-400">Deterministic Rule Applied</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Station Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">1. Station Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Exact Location */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">2. Exact Location <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Platform 1, Track No. 2, KM 42.3"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Problem Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">3. Department / Category <span className="text-red-500">*</span></label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DefectCategory)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="Track Defect">Track Defect (→ Engineering)</option>
                  <option value="OHE Defect">OHE Defect (→ Traction)</option>
                  <option value="Substation Defect">Substation Defect (→ Traction)</option>
                  <option value="Electrical Equipment Failure">Electrical Equipment Failure (→ Electrical)</option>
                  <option value="Signal Failure">Signal Failure (→ S&T)</option>
                  <option value="Telecom Failure">Telecom Failure (→ S&T)</option>
                </select>
              </div>

              {/* Problem Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">4. Problem Type <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={problemType}
                  onChange={(e) => setProblemType(e.target.value)}
                  placeholder="e.g. Gauge face crack, OHE Wire Sag, Point Machine Error"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Title */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-gray-700">5. Complaint Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Summary title of observed defect"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">7. Observed Priority <span className="text-red-500">*</span></label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="CRITICAL">CRITICAL (Immediate hazard)</option>
                  <option value="HIGH">HIGH (Urgent attention)</option>
                  <option value="MEDIUM">MEDIUM (Standard workflow)</option>
                  <option value="LOW">LOW (Routine check)</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">6. Detailed Description <span className="text-red-500">*</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Provide accurate observed physical details, symptoms, train impact..."
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Photo Evidence */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">8. Photo / Video Evidence (Optional)</label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 px-3 py-2 border border-dashed border-gray-300 hover:border-blue-500 rounded-lg text-xs text-gray-600 bg-gray-50 flex items-center justify-center gap-2 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>{evidenceName || 'Upload Photo/Video File'}</span>
                    <input type="file" onChange={handleFileSimulate} className="hidden" accept="image/*,video/*" />
                  </label>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">9. Additional Remarks (Optional)</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Speed restrictions imposed, temporary clamping..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-navy-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Auto Generated Summary */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 space-y-1">
              <div className="font-bold text-navy-900">Auto-Generated Metadata:</div>
              <div className="flex flex-wrap gap-4 text-[11px]">
                <span>Complaint ID: <strong className="text-navy-800">CMP-2026-XXXX (Auto)</strong></span>
                <span>Submitted By: <strong className="text-navy-800">{user?.name}</strong></span>
                <span>Initial Status: <strong className="text-amber-700">PENDING DEPARTMENT ACCEPTANCE</strong></span>
              </div>
            </div>

            {/* Submit Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary text-xs px-6">
                SUBMIT COMPLAINT
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modals for Station Master */}
      {selectedComplaint && modalMode && (
        <div className="modal-overlay">
          <div className="modal-content p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-navy-900">Complaint Details — {selectedComplaint.id}</h3>
                <p className="text-xs text-gray-500">Concerned Dept: {selectedComplaint.concernedDepartment}</p>
              </div>
              <button onClick={() => { setSelectedComplaint(null); setModalMode(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {/* Complaint Info */}
            <div className="space-y-2 text-xs bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="grid grid-cols-2 gap-2">
                <div><strong>Station:</strong> {selectedComplaint.station}</div>
                <div><strong>Location:</strong> {selectedComplaint.location}</div>
                <div><strong>Category:</strong> {selectedComplaint.category}</div>
                <div><strong>Problem Type:</strong> {selectedComplaint.problemType}</div>
                <div><strong>Priority:</strong> {selectedComplaint.priority}</div>
                <div><strong>Status:</strong> {selectedComplaint.status}</div>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <strong>Title:</strong> {selectedComplaint.title}
              </div>
              <div>
                <strong>Description:</strong> {selectedComplaint.description}
              </div>
              {selectedComplaint.remarks && (
                <div><strong>Remarks:</strong> {selectedComplaint.remarks}</div>
              )}
            </div>

            {/* Mode 1: Clarification Response */}
            {modalMode === 'clarify' && (
              <div className="space-y-3 border-t border-gray-100 pt-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <div className="font-bold mb-1">Department Clarification Request:</div>
                  <p>{selectedComplaint.clarificationRequest}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700">Your Response & Additional Details:</label>
                  <textarea
                    value={clarificationText}
                    onChange={(e) => setClarificationText(e.target.value)}
                    rows={3}
                    placeholder="Provide requested photo link, exact track meter mark, or equipment serial..."
                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => { setSelectedComplaint(null); setModalMode(null); }} className="btn-secondary text-xs">Cancel</button>
                  <button
                    onClick={() => {
                      if (!clarificationText.trim()) return;
                      respondClarification(selectedComplaint.id, clarificationText);
                      setSelectedComplaint(null);
                      setModalMode(null);
                      setClarificationText('');
                    }}
                    className="btn-primary text-xs"
                  >
                    Submit Clarification & Re-send
                  </button>
                </div>
              </div>
            )}

            {/* Mode 2: Verification */}
            {modalMode === 'verify' && (
              <div className="space-y-3 border-t border-gray-100 pt-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-900">
                  <div className="font-bold mb-1">Department Maintenance Completion Report:</div>
                  <p>Maintenance work completed safely on-site. Field checks passed. Safe for train movement.</p>
                </div>

                {reopenReasonText !== '' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-red-700">Reason for Re-opening Complaint:</label>
                    <textarea
                      value={reopenReasonText}
                      onChange={(e) => setReopenReasonText(e.target.value)}
                      rows={2}
                      placeholder="Explain why defect persists..."
                      className="w-full p-2 border border-red-300 rounded-lg text-xs font-medium"
                    />
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => {
                      if (!reopenReasonText) {
                        setReopenReasonText('Defect still observed during local inspection.');
                      } else {
                        reopenComplaint(selectedComplaint.id, reopenReasonText);
                        setSelectedComplaint(null);
                        setModalMode(null);
                        setReopenReasonText('');
                      }
                    }}
                    className="btn-danger text-xs"
                  >
                    {reopenReasonText ? 'Confirm Re-open' : 'REPORT ISSUE AGAIN'}
                  </button>

                  <div className="flex gap-2">
                    <button onClick={() => { setSelectedComplaint(null); setModalMode(null); }} className="btn-secondary text-xs">Cancel</button>
                    <button
                      onClick={() => {
                        verifyComplaint(selectedComplaint.id);
                        setSelectedComplaint(null);
                        setModalMode(null);
                      }}
                      className="btn-success text-xs"
                    >
                      VERIFY & CLOSE
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
