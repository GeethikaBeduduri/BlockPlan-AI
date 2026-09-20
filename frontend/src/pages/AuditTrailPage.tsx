import { useState } from 'react';
import { FileText, Search, ShieldCheck } from 'lucide-react';
import { useComplaints } from '../context/ComplaintContext';

export default function AuditTrailPage() {
  const { auditLogs } = useComplaints();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch =
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'ALL' || log.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-navy-900 rounded-xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border border-navy-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-400" />
            <span className="px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs font-bold border border-purple-500/30 uppercase">
              System Audit Trail
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold mt-1">Immutable Operational Event Log</h1>
          <p className="text-navy-300 text-xs sm:text-sm mt-0.5">
            Chronological audit trail documenting complaint submissions, department decisions, AI scoring, and verification actions.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, user, complaint ID..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-gray-500 whitespace-nowrap">Filter Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold text-navy-900 bg-white"
          >
            <option value="ALL">All Roles</option>
            <option value="STATION_MASTER">Station Master</option>
            <option value="DEPARTMENT">Department</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-navy-900">Event Audit Log ({filteredLogs.length} Entries)</h2>
          </div>
          <span className="text-[10px] text-gray-400 font-semibold uppercase">Non-editable Log</span>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Audit ID</th>
                <th>Timestamp</th>
                <th>User / Actor</th>
                <th>Role</th>
                <th>Action</th>
                <th>Entity ID</th>
                <th>Detailed Audit Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No matching audit entries found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id}>
                    <td className="font-mono text-xs text-gray-400">{log.id}</td>
                    <td className="font-mono text-xs text-gray-500">{log.timestamp}</td>
                    <td className="font-bold text-navy-900">{log.user}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        log.role === 'STATION_MASTER' ? 'bg-amber-100 text-amber-800' :
                        log.role === 'DEPARTMENT' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {log.role}
                      </span>
                    </td>
                    <td className="font-bold text-purple-700 text-xs">{log.action}</td>
                    <td className="font-semibold text-navy-800">{log.entityId}</td>
                    <td className="text-gray-700 text-xs max-w-lg">{log.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
