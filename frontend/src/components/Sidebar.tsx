import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  BrainCircuit,
  Zap,
  GanttChart,
  ShieldAlert,
  BarChart3,
  Database,
  Settings,
  Train,
  X,
  UserCheck,
  Building2,
  ShieldCheck,
  FileText,
  LogOut,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export default function Sidebar() {
  const { sidebarOpen, closeSidebar } = useAppContext();
  const { user, logout } = useAuth();

  const role = user?.role || 'STATION_MASTER';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-navy-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      <aside
        className={`fixed left-0 top-0 bottom-0 w-[240px] bg-navy-950 flex flex-col z-50 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo Header */}
        <div className="px-5 py-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rail-blue flex items-center justify-center">
              <Train className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">BlockPlan AI</div>
              <div className="text-navy-400 text-[10px] font-medium tracking-wider uppercase">Indian Railways</div>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            className="lg:hidden text-navy-400 hover:text-white p-1"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Strict Role-Based Navigation */}
        <nav className="flex-1 py-3 px-3 space-y-4 overflow-y-auto">
          {/* STATION MASTER NAVIGATION */}
          {role === 'STATION_MASTER' && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-extrabold text-navy-400 uppercase tracking-wider">
                Station Master Navigation
              </div>
              <NavLink
                to="/complaints/station-master"
                onClick={closeSidebar}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <UserCheck className="w-[18px] h-[18px] flex-shrink-0" />
                <span>Station Master Portal</span>
              </NavLink>
            </div>
          )}

          {/* DEPARTMENT NAVIGATION */}
          {role === 'DEPARTMENT' && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-extrabold text-navy-400 uppercase tracking-wider">
                Department Navigation
              </div>
              <NavLink
                to="/complaints/department"
                onClick={closeSidebar}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <Building2 className="w-[18px] h-[18px] flex-shrink-0" />
                <span>Department Portal ({user?.department})</span>
              </NavLink>
            </div>
          )}

          {/* ADMIN NAVIGATION */}
          {role === 'ADMIN' && (
            <>
              <div className="space-y-1">
                <div className="px-3 text-[10px] font-extrabold text-navy-400 uppercase tracking-wider">
                  Admin Governance
                </div>
                <NavLink
                  to="/complaints/admin"
                  onClick={closeSidebar}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                >
                  <ShieldCheck className="w-[18px] h-[18px] flex-shrink-0" />
                  <span>Admin Dashboard</span>
                </NavLink>
                <NavLink
                  to="/complaints/audit"
                  onClick={closeSidebar}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                >
                  <FileText className="w-[18px] h-[18px] flex-shrink-0" />
                  <span>Audit Trail</span>
                </NavLink>
              </div>

              <div className="h-px bg-white/5 mx-2" />

              <div className="space-y-1">
                <div className="px-3 text-[10px] font-extrabold text-navy-400 uppercase tracking-wider">
                  System Monitoring
                </div>
                {[
                  { to: '/', icon: LayoutDashboard, label: 'Overview Control' },
                  { to: '/tasks', icon: ClipboardList, label: 'Maintenance Tasks' },
                  { to: '/blocks', icon: Calendar, label: 'Block Availability' },
                  { to: '/prioritization', icon: BrainCircuit, label: 'AI Prioritization' },
                  { to: '/planner', icon: Zap, label: 'Auto Planner' },
                  { to: '/gantt', icon: GanttChart, label: 'Gantt Plan' },
                  { to: '/safety', icon: ShieldAlert, label: 'Conflicts & Safety' },
                  { to: '/review', icon: ClipboardList, label: 'Planner Review' },
                  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
                  { to: '/datasources', icon: Database, label: 'Data Sources' },
                  { to: '/settings', icon: Settings, label: 'Settings' },
                ].map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={closeSidebar}
                    className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                  >
                    <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/5 space-y-2">
          {user && (
            <div className="flex items-center justify-between text-xs text-navy-300">
              <span className="truncate font-semibold text-white">{user.role.replace('_', ' ')}</span>
              <button
                onClick={logout}
                className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3 h-3" /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
