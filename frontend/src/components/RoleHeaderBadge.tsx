import { useNavigate } from 'react-router-dom';
import { User, LogOut, RefreshCw, Shield, Building2, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RoleHeaderBadge() {
  const { user, logout, activeDepartment } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const roleColors: Record<string, { bg: string; text: string; border: string; icon: typeof User }> = {
    ADMIN: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: Shield },
    DEPARTMENT: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Building2 },
    STATION_MASTER: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: UserCheck },
  };

  const meta = roleColors[user.role] || roleColors.STATION_MASTER;
  const RoleIcon = meta.icon;

  const handleLogout = () => {
    logout();
    navigate('/complaints/login');
  };

  return (
    <div className="flex items-center gap-2">
      {/* Role Pill */}
      <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${meta.bg} ${meta.text} ${meta.border}`}>
        <RoleIcon className="w-3.5 h-3.5" />
        <span>{user.role === 'DEPARTMENT' ? `Dept: ${user.department || activeDepartment}` : user.role.replace('_', ' ')}</span>
      </div>

      {/* Logout / Switch Role Button */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors cursor-pointer"
        title="Logout or Switch Role"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Logout</span>
      </button>

      {/* Role Switcher Drawer shortcut */}
      <button
        onClick={() => navigate('/complaints/login')}
        className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors cursor-pointer"
        title="Switch Role"
      >
        <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
        <span>Switch Role</span>
      </button>
    </div>
  );
}
