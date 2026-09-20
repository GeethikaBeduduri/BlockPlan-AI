import { ShieldCheck, Database, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import KPICard from '../components/KPICard';
import { useComplaints } from '../context/ComplaintContext';

export default function AdminPage() {
  const { complaints, auditLogs } = useComplaints();
  const navigate = useNavigate();

  const total = complaints.length;
  const pending = complaints.filter(c => c.status === 'PENDING DEPARTMENT ACCEPTANCE' || c.status === 'SUBMITTED' || c.status === 'STATION MASTER UPDATED').length;
  const accepted = complaints.filter(c => c.status === 'ACCEPTED' || c.status === 'ASSIGNED').length;
  const rejected = complaints.filter(c => c.status === 'REJECTED').length;
  const clarificationReq = complaints.filter(c => c.status === 'CLARIFICATION REQUIRED').length;
  const activeWork = complaints.filter(c => c.status === 'WORK IN PROGRESS').length;
  const resolved = complaints.filter(c => c.status === 'RESOLVED' || c.status === 'STATION MASTER VERIFICATION').length;
  const closed = complaints.filter(c => c.status === 'CLOSED').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-navy-900 rounded-xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border border-navy-800">
        <div>
          <div className="flex items-center gap-2">
           
            <span className="text-navy-300 text-xs">• Railway Board Operations Control</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold mt-1">System Oversight & Governance Control</h1>
          <p className="text-navy-300 text-xs sm:text-sm mt-0.5">
            Monitor system-wide complaints, role permissions, simulated data integrations, and immutable audit trails.
          </p>
        </div>

        <button
          onClick={() => navigate('/complaints/audit')}
          className="btn-primary text-xs flex items-center gap-1.5 self-start md:self-auto bg-purple-600 hover:bg-purple-700"
        >
          <FileText className="w-4 h-4" />
          <span>View Full Audit Trail</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard title="Total" value={total} variant="info" />
        <KPICard title="Pending" value={pending} variant="warning" />
        <KPICard title="Accepted" value={accepted} variant="info" />
        <KPICard title="Rejected" value={rejected} variant="critical" />
        <KPICard title="Clarification" value={clarificationReq} variant="warning" />
        <KPICard title="Active Work" value={activeWork} variant="info" />
        <KPICard title="Resolved" value={resolved} variant="warning" />
        <KPICard title="Closed" value={closed} variant="success" />
      </div>

      {/* Grid: System Status + Role Management */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Connectivity */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-bold text-navy-900">System Integration Status</h2>
            </div>
            <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Prototype Mode
            </span>
          </div>

          <div className="card-body space-y-3 text-xs">
            {[
              { name: 'TMS', desc: 'Track Management System', status: 'Prototype Data' },
              { name: 'TDMS', desc: 'Traction Distribution Management', status: 'Prototype Data' },
              { name: 'SMMS', desc: 'Signalling Maintenance Management', status: 'Prototype Data' },
              { name: 'COA', desc: 'Control Office Application', status: 'Prototype Data' },
            ].map(sys => (
              <div key={sys.name} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <div>
                    <div className="font-bold text-navy-900">{sys.name}</div>
                    <div className="text-[10px] text-gray-500">{sys.desc}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-800 rounded">
                  ● {sys.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* User & Role Permissions Matrix */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <h2 className="text-sm font-bold text-navy-900">Role Access & Permission Matrix</h2>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Create Complaint</th>
                  <th>Technical Assessment</th>
                  <th>Accept / Reject</th>
                  <th>AI Criticality</th>
                  <th>Verify & Close</th>
                  <th>User Admin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-bold text-navy-900">Station Master</td>
                  <td className="text-green-600 font-bold">✓ Allowed</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-gray-400">✕ System/AI</td>
                  <td className="text-green-600 font-bold">✓ Allowed</td>
                  <td className="text-gray-400">✕ Disabled</td>
                </tr>
                <tr>
                  <td className="font-bold text-navy-900">Department Officer</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-green-600 font-bold">✓ Allowed</td>
                  <td className="text-green-600 font-bold">✓ Allowed</td>
                  <td className="text-blue-600 font-bold">● View Score</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-gray-400">✕ Disabled</td>
                </tr>
                <tr>
                  <td className="font-bold text-navy-900">Administrator</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-blue-600 font-bold">● System View</td>
                  <td className="text-gray-400">✕ Disabled</td>
                  <td className="text-green-600 font-bold">✓ Full Access</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Audit Log Preview */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-navy-900">Recent Immutable Audit Trail</h2>
          </div>
          <button
            onClick={() => navigate('/complaints/audit')}
            className="text-xs font-semibold text-purple-600 hover:text-purple-800"
          >
            View All Logs →
          </button>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Entity ID</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 6).map(log => (
                <tr key={log.id}>
                  <td className="text-xs text-gray-500 font-mono">{log.timestamp}</td>
                  <td className="font-bold text-navy-900">{log.user}</td>
                  <td>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-bold rounded">
                      {log.role}
                    </span>
                  </td>
                  <td className="font-bold text-purple-700 text-xs">{log.action}</td>
                  <td className="font-semibold text-gray-800">{log.entityId}</td>
                  <td className="text-gray-600 text-xs truncate max-w-xs">{log.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
