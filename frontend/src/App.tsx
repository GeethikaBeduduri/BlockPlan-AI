import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ComplaintProvider } from './context/ComplaintContext';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ToastContainer from './components/ToastContainer';
import LoginPage from './components/LoginPage';

import OverviewPage from './pages/OverviewPage';
import TasksPage from './pages/TasksPage';
import BlocksPage from './pages/BlocksPage';
import PrioritizationPage from './pages/PrioritizationPage';
import PlannerPage from './pages/PlannerPage';
import GanttPage from './pages/GanttPage';
import SafetyPage from './pages/SafetyPage';
import ReviewPage from './pages/ReviewPage';
import AnalyticsPage from './pages/AnalyticsPage';
import DataSourcesPage from './pages/DataSourcesPage';
import SettingsPage from './pages/SettingsPage';

import StationMasterPage from './pages/StationMasterPage';
import DepartmentPage from './pages/DepartmentPage';
import AdminPage from './pages/AdminPage';
import AuditTrailPage from './pages/AuditTrailPage';

function ProtectedRoutes() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/complaints/login" replace />;
  }

  const role = user.role;
  const path = location.pathname;

  // Role authorization boundaries
  if (role === 'STATION_MASTER' && path !== '/complaints/station-master') {
    if (path === '/complaints/department' || path === '/complaints/admin') {
      return <Navigate to="/complaints/station-master" replace />;
    }
  }

  if (role === 'DEPARTMENT' && path !== '/complaints/department') {
    if (path === '/complaints/station-master' || path === '/complaints/admin') {
      return <Navigate to="/complaints/department" replace />;
    }
  }

  if (role === 'ADMIN') {
    if (path === '/complaints/station-master' || path === '/complaints/department') {
      return <Navigate to="/complaints/admin" replace />;
    }
  }

  return (
    <Routes>
      {/* Operational Portal Pages */}
      <Route path="/complaints/station-master" element={<StationMasterPage />} />
      <Route path="/complaints/department" element={<DepartmentPage />} />
      <Route path="/complaints/admin" element={<AdminPage />} />
      <Route path="/complaints/audit" element={<AuditTrailPage />} />

      {/* Feature & Governance Dashboards */}
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/blocks" element={<BlocksPage />} />
      <Route path="/prioritization" element={<PrioritizationPage />} />
      <Route path="/planner" element={<PlannerPage />} />
      <Route path="/gantt" element={<GanttPage />} />
      <Route path="/safety" element={<SafetyPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/datasources" element={<DataSourcesPage />} />
      <Route path="/settings" element={<SettingsPage />} />

      {/* Fallback to appropriate role home */}
      <Route
        path="*"
        element={
          <Navigate
            to={
              role === 'STATION_MASTER'
                ? '/complaints/station-master'
                : role === 'DEPARTMENT'
                ? '/complaints/department'
                : '/complaints/admin'
            }
            replace
          />
        }
      />
    </Routes>
  );
}

function AppLayout() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/' || location.pathname === '/complaints/login';

  if (isLoginPage) {
    return <LoginPage key={location.pathname} />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-0 lg:ml-[240px] w-full min-w-0 flex flex-col min-h-screen">
        <Header />
        <main className="p-3 sm:p-4 md:p-6 w-full min-w-0 flex-1">
          <ProtectedRoutes />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <ComplaintProvider>
          <AppLayout />
        </ComplaintProvider>
      </AuthProvider>
    </AppProvider>
  );
}
