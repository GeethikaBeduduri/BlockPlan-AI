import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Menu, CheckCheck, User, Sliders, LogOut, Building2, ShieldCheck, UserCheck, X, AlertTriangle, Calendar, RefreshCw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useComplaints } from '../context/ComplaintContext';

interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  read: boolean;
}

const initialNotifications: NotificationItem[] = [
  {
    id: '1',
    title: '3 Class A tasks due within 24 hours',
    desc: 'ENG-102, TRC-044, SIG-091 require mandatory block allocation.',
    time: '10m ago',
    read: false,
  },
  {
    id: '2',
    title: 'New C05 maintenance window available',
    desc: 'COA synced a 60-min window on Corridor C05 (10:00–11:00).',
    time: '25m ago',
    read: false,
  },
  {
    id: '3',
    title: '2 corridors nearing block capacity',
    desc: 'Corridor C01 and C03 utilization above 85%.',
    time: '1h ago',
    read: false,
  },
];

export default function Header() {
  const { toggleSidebar, addToast } = useAppContext();
  const { user, logout } = useAuth();
  const { complaints, maintenanceTasks, auditLogs } = useComplaints();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [notifOpen, setNotifOpen] = useState(false);

  // Profile Interaction States
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'profile' | 'preferences' | 'logout' | null>(null);

  // Dynamic Relative Last Sync States
  const [lastSyncTime, setLastSyncTime] = useState<number>(() => Date.now());
  const [relativeSyncTime, setRelativeSyncTime] = useState<string>('Just now');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Preference settings state
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [displayDensity, setDisplayDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;
  const hasUnread = unreadCount > 0;

  // Recalculate relative time every 10 seconds
  useEffect(() => {
    const updateRelative = () => {
      const diffSec = Math.floor((Date.now() - lastSyncTime) / 1000);
      if (diffSec < 45) {
        setRelativeSyncTime('Just now');
      } else {
        const mins = Math.floor(diffSec / 60);
        if (mins < 60) {
          setRelativeSyncTime(`${mins} min ago`);
        } else {
          const hrs = Math.floor(mins / 60);
          setRelativeSyncTime(`${hrs} h ago`);
        }
      }
    };

    updateRelative();
    const timer = setInterval(updateRelative, 10000);
    return () => clearInterval(timer);
  }, [lastSyncTime]);

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setLastSyncTime(Date.now());
      setRelativeSyncTime('Just now');
      setIsSyncing(false);
      addToast('Application data synced with COA / TMS', 'success');
    }, 600);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    addToast('All notifications marked as read', 'info');
  };

  const handleConfirmLogout = () => {
    setActiveModal(null);
    logout();
    navigate('/complaints/login');
  };

  // Compute Role-Specific Profile Data
  const role = user?.role || 'STATION_MASTER';

  // 1. Station Master Data
  const smComplaints = complaints.filter(
    c => c.station.includes(user?.station || 'Guntur') ||
         c.submittedBy.includes(user?.name || 'Station Master') ||
         c.submittedBy.includes('SM-GNT') ||
         c.submittedBy.includes('stationmaster')
  );
  const smTotal = smComplaints.length;
  const smAccepted = smComplaints.filter(c => c.status === 'ACCEPTED' || c.status === 'ASSIGNED').length;
  const smResolved = smComplaints.filter(c => c.status === 'RESOLVED' || c.status === 'STATION MASTER VERIFICATION').length;
  const smClosed = smComplaints.filter(c => c.status === 'CLOSED').length;
  const smPending = smComplaints.filter(c => c.status === 'PENDING DEPARTMENT ACCEPTANCE' || c.status === 'SUBMITTED' || c.status === 'STATION MASTER UPDATED').length;
  const smClarification = smComplaints.filter(c => c.status === 'CLARIFICATION REQUIRED').length;

  // 2. Department Data
  const deptName = user?.department || 'Engineering';
  const deptCodeMap: Record<string, string> = {
    Engineering: 'ENG',
    Traction: 'TRC',
    'Signal & Telecom': 'SIG',
    Electrical: 'ELE',
  };
  const deptCode = deptCodeMap[deptName] || 'ENG';
  const deptComplaints = complaints.filter(c => c.concernedDepartment === deptName);
  const deptTasks = Object.values(maintenanceTasks).filter(t => t.department === deptName);
  const deptReceived = deptComplaints.length;
  const deptAccepted = deptComplaints.filter(c => c.status === 'ACCEPTED' || c.status === 'ASSIGNED' || c.status === 'WORK IN PROGRESS').length;
  const deptTasksCreated = deptTasks.length;
  const deptInProgress = deptTasks.filter(t => t.status === 'IN_PROGRESS').length;
  const deptCompleted = deptComplaints.filter(c => c.status === 'RESOLVED' || c.status === 'CLOSED').length;
  const deptPending = deptComplaints.filter(c => c.status === 'PENDING DEPARTMENT ACCEPTANCE' || c.status === 'SUBMITTED' || c.status === 'STATION MASTER UPDATED').length;

  // 3. Admin Data
  const adminTotalComplaints = complaints.length;
  const adminActiveTasks = Object.values(maintenanceTasks).filter(t => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length;
  const adminCompletedTasks = complaints.filter(c => c.status === 'CLOSED' || c.status === 'RESOLVED').length;

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Hamburger button for mobile */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-navy-800 focus:outline-none"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Clean Header Title */}
        <div className="font-bold text-sm text-navy-900 tracking-tight flex items-center gap-2">
          <span>BlockPlan AI</span>
          <span className="text-gray-300">•</span>
          <span className="text-xs font-semibold text-gray-500">{user?.role.replace('_', ' ')}</span>
        </div>

        {/* Planning Horizon Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-navy-50 text-navy-900 rounded-lg text-xs font-medium border border-navy-100/80 ml-2">
          <Calendar className="w-3.5 h-3.5 text-rail-blue flex-shrink-0" />
          <span>Planning Horizon: <strong className="font-bold text-navy-950">28 Aug — 04 Sep 2026</strong></span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Dynamic Relative Last Sync Button/Display */}
        <button
          onClick={handleManualSync}
          className="hidden md:flex items-center gap-1.5 text-xs text-gray-500 hover:text-navy-900 transition-colors cursor-pointer px-2.5 py-1 rounded-lg hover:bg-gray-100 border border-transparent hover:border-gray-200"
          title="Click to sync data with COA / TMS"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-rail-blue ${isSyncing ? 'animate-spin' : ''}`} />
          <span>Last sync: <strong className="font-bold text-gray-700">{relativeSyncTime}</strong></span>
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen(prev => !prev); setDropdownOpen(false); }}
            className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-gray-500" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rail-red rounded-full" />
            )}
          </button>

          {/* Notifications Dropdown */}
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden animate-scale-in">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-navy-900">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-extrabold rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {notifications.map(item => (
                  <div
                    key={item.id}
                    onClick={() => markAsRead(item.id)}
                    className={`p-3 text-left hover:bg-gray-50 transition-colors cursor-pointer flex items-start gap-2.5 ${
                      !item.read ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      !item.read ? 'bg-rail-blue' : 'bg-transparent'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold ${!item.read ? 'text-navy-900' : 'text-gray-600'}`}>
                          {item.title}
                        </span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{item.time}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setDropdownOpen(prev => !prev); setNotifOpen(false); }}
            className="flex items-center gap-2 pl-3 border-l border-gray-200 hover:opacity-80 transition-opacity text-left cursor-pointer focus:outline-none"
            aria-label="Profile Menu"
          >
            <div className="w-8 h-8 rounded-full bg-navy-900 text-white font-extrabold text-xs flex items-center justify-center flex-shrink-0 border border-navy-700 shadow-xs">
              {role === 'STATION_MASTER' ? <UserCheck className="w-4 h-4 text-amber-400" /> :
               role === 'DEPARTMENT' ? <Building2 className="w-4 h-4 text-cyan-400" /> :
               <ShieldCheck className="w-4 h-4 text-purple-400" />}
            </div>
            <div className="text-xs hidden sm:block">
              <div className="font-bold text-navy-900 leading-tight">
                {role === 'DEPARTMENT' ? deptName : user?.name}
              </div>
              <div className="text-gray-500 text-[10px] font-semibold">{role.replace('_', ' ')}</div>
            </div>
          </button>

          {/* STEP 1: SMALL ANCHORED DROPDOWN MENU (3 OPTIONS) */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden py-1 text-xs animate-scale-in">
              <button
                onClick={() => { setDropdownOpen(false); setActiveModal('profile'); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-left cursor-pointer"
              >
                <User className="w-4 h-4 text-navy-600" />
                <span>Profile</span>
              </button>

              <button
                onClick={() => { setDropdownOpen(false); setActiveModal('preferences'); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors text-left cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-gray-500" />
                <span>Preferences</span>
              </button>

              <div className="h-px bg-gray-100 my-1" />

              <button
                onClick={() => { setDropdownOpen(false); setActiveModal('logout'); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 font-semibold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* STEP 2: DETAILED ROLE-SPECIFIC PROFILE PANEL MODAL */}
      {activeModal === 'profile' && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md w-full p-0 overflow-hidden rounded-2xl shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 bg-navy-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rail-blue/20 border border-rail-blue/40 flex items-center justify-center font-bold text-white flex-shrink-0">
                  {role === 'STATION_MASTER' ? <UserCheck className="w-5 h-5 text-amber-400" /> :
                   role === 'DEPARTMENT' ? <Building2 className="w-5 h-5 text-cyan-400" /> :
                   <ShieldCheck className="w-5 h-5 text-purple-400" />}
                </div>
                <div>
                  <div className="font-extrabold text-sm text-white leading-tight">
                    {role === 'DEPARTMENT' ? `${deptName} Department` : user?.name}
                  </div>
                  <div className="text-[11px] text-navy-300 font-semibold mt-0.5">
                    {role === 'STATION_MASTER' ? `Station Master • ${user?.station || 'Guntur'}` :
                     role === 'DEPARTMENT' ? `Dept ID: ${deptCode} • Operational Control` :
                     'Administrator • Railway Board'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-navy-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* STATION MASTER PROFILE */}
              {role === 'STATION_MASTER' && (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <div><strong>Station Master:</strong> {user?.name}</div>
                    <div><strong>Role:</strong> Station Master</div>
                    <div><strong>Station:</strong> {user?.station || 'Guntur Railway Station'}</div>
                    <div><strong>Staff ID:</strong> SM-GNT-104</div>
                  </div>

                  <div>
                    <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-2">
                      Complaint Activity
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg">
                        <div className="text-lg font-black text-blue-700">{smTotal}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Total Reported</div>
                      </div>
                      <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg">
                        <div className="text-lg font-black text-amber-700">{smAccepted}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Accepted</div>
                      </div>
                      <div className="p-2 bg-green-50 border border-green-100 rounded-lg">
                        <div className="text-lg font-black text-green-700">{smResolved}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Resolved</div>
                      </div>
                      <div className="p-2 bg-green-100 border border-green-200 rounded-lg">
                        <div className="text-lg font-black text-green-800">{smClosed}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Closed</div>
                      </div>
                      <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="text-lg font-black text-gray-700">{smPending}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Pending</div>
                      </div>
                      <div className="p-2 bg-red-50 border border-red-100 rounded-lg">
                        <div className="text-lg font-black text-red-700">{smClarification}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Clarification</div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-gray-100" />

                  <div>
                    <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-2">
                      Recent Complaint Activity
                    </div>
                    <div className="space-y-1.5">
                      {smComplaints.slice(0, 3).map(cmp => (
                        <div key={cmp.id} className="p-2 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-navy-900">{cmp.id}</div>
                            <div className="text-[10px] text-gray-500 truncate max-w-[160px]">{cmp.title}</div>
                          </div>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                            {cmp.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* DEPARTMENT PROFILE */}
              {role === 'DEPARTMENT' && (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <div><strong>Department Name:</strong> {deptName} Department</div>
                    <div><strong>User Name:</strong> {user?.name}</div>
                    <div><strong>Role:</strong> Department Officer</div>
                    <div><strong>Department ID:</strong> {deptCode}</div>
                  </div>

                  <div>
                    <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-2">
                      Department Performance
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg">
                        <div className="text-lg font-black text-blue-700">{deptReceived}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Complaints Received</div>
                      </div>
                      <div className="p-2 bg-amber-50 border border-amber-100 rounded-lg">
                        <div className="text-lg font-black text-amber-700">{deptAccepted}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Complaints Accepted</div>
                      </div>
                      <div className="p-2 bg-purple-50 border border-purple-100 rounded-lg">
                        <div className="text-lg font-black text-purple-700">{deptTasksCreated}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Tasks Created</div>
                      </div>
                      <div className="p-2 bg-cyan-50 border border-cyan-100 rounded-lg">
                        <div className="text-lg font-black text-cyan-700">{deptInProgress}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Tasks In Progress</div>
                      </div>
                      <div className="p-2 bg-green-50 border border-green-100 rounded-lg">
                        <div className="text-lg font-black text-green-700">{deptCompleted}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Tasks Completed</div>
                      </div>
                      <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="text-lg font-black text-gray-700">{deptPending}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Tasks Pending</div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-gray-100" />

                  <div>
                    <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-2">
                      Recent {deptName} Records
                    </div>
                    <div className="space-y-1.5">
                      {deptComplaints.slice(0, 3).map(cmp => (
                        <div key={cmp.id} className="p-2 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-navy-900">{cmp.id}</div>
                            <div className="text-[10px] text-gray-500 truncate max-w-[160px]">{cmp.problemType}</div>
                          </div>
                          <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 rounded font-bold text-[10px]">
                            {cmp.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ADMIN PROFILE */}
              {role === 'ADMIN' && (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <div><strong>Name:</strong> Chief Planning Administrator</div>
                    <div><strong>Role:</strong> Administrator • Railway Board</div>
                    <div><strong>Department:</strong> Operations Governance</div>
                  </div>

                  <div>
                    <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-2">
                      System Governance Overview
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-2 bg-purple-50 border border-purple-100 rounded-lg">
                        <div className="text-lg font-black text-purple-700">{adminTotalComplaints}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Total System Complaints</div>
                      </div>
                      <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg">
                        <div className="text-lg font-black text-blue-700">{adminActiveTasks}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Active Maintenance Tasks</div>
                      </div>
                      <div className="p-2 bg-green-50 border border-green-100 rounded-lg">
                        <div className="text-lg font-black text-green-700">{adminCompletedTasks}</div>
                        <div className="text-[10px] text-gray-500 font-bold">Completed Tasks</div>
                      </div>
                      <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="text-lg font-black text-navy-900">4</div>
                        <div className="text-[10px] text-gray-500 font-bold">Departments Integrated</div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-gray-100" />

                  <div>
                    <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-2">
                      Recent System Audit Events
                    </div>
                    <div className="space-y-1.5">
                      {auditLogs.slice(0, 3).map(log => (
                        <div key={log.id} className="p-2 bg-gray-50 rounded-lg border border-gray-200 text-[11px] space-y-0.5">
                          <div className="flex justify-between font-bold text-navy-900">
                            <span>{log.action}</span>
                            <span className="text-gray-400 text-[9px]">{log.entityId}</span>
                          </div>
                          <p className="text-gray-600 truncate">{log.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setActiveModal(null)}
                  className="btn-primary text-xs px-4"
                >
                  Close Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: PREFERENCES PANEL MODAL */}
      {activeModal === 'preferences' && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm w-full p-6 space-y-4 rounded-2xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-navy-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-rail-blue" />
                <span>User Preferences</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="font-bold text-gray-700 block">Notification Preferences</label>
                <label className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                  <span>Email & In-App Status Alerts</span>
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="w-4 h-4 accent-rail-blue cursor-pointer"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-gray-700 block">Display Layout Density</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDisplayDensity('comfortable')}
                    className={`p-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                      displayDensity === 'comfortable' ? 'bg-blue-50 border-rail-blue text-blue-700 font-bold' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    Comfortable
                  </button>
                  <button
                    onClick={() => setDisplayDensity('compact')}
                    className={`p-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                      displayDensity === 'compact' ? 'bg-blue-50 border-rail-blue text-blue-700 font-bold' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    Compact
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  addToast('Preferences saved successfully', 'success');
                  setActiveModal(null);
                }}
                className="btn-primary text-xs px-4"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SIGN OUT CONFIRMATION DIALOG MODAL */}
      {activeModal === 'logout' && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm w-full p-6 space-y-4 rounded-2xl shadow-2xl animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-navy-900">Confirm Sign Out</h3>
                <p className="text-xs text-gray-500">Are you sure you want to sign out?</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setActiveModal(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLogout}
                className="btn-danger text-xs px-5"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
