import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './lib/AppContext';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Register';
import RegisterComplete from './pages/RegisterComplete';
import Pending from './pages/Pending';
import Dashboard from './pages/Dashboard';
import Attendance from './pages/Attendance';
import SingleAttendance from './pages/SingleAttendance';
import Students from './pages/Students';
import StudentLookup from './pages/StudentLookup';
import DailyReport from './pages/DailyReport';
import PeriodReport from './pages/PeriodReport';
import StaffAssignments from './pages/StaffAssignments';
import Profile from './pages/Profile';
import Layout from './components/Layout';

function Gate({ children }) {
  const { session, staff, staffLoading } = useApp();

  if (session === undefined || (session && staffLoading)) {
    return <div className="min-h-screen flex items-center justify-center bg-pearl text-slate-400 text-sm">...</div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!staff || staff.status !== 'approved') return <Navigate to="/pending" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { session, staff, staffLoading } = useApp();
  if (session === undefined) return null;
  if (!session) return children;
  if (staffLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-pearl text-slate-400 text-sm">...</div>;
  }
  if (staff && staff.status === 'approved') return <Navigate to="/" replace />;
  return <Navigate to="/pending" replace />;
}

function PendingGuard({ children }) {
  const { session, staff, staffLoading } = useApp();
  if (session === undefined || (session && staffLoading)) {
    return <div className="min-h-screen flex items-center justify-center bg-pearl text-slate-400 text-sm">...</div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  if (staff && staff.status === 'approved') return <Navigate to="/" replace />;
  return children;
}

function NotRecorder({ children, fallback = '/attendance' }) {
  const { staff } = useApp();
  if (staff?.role === 'recorder') return <Navigate to={fallback} replace />;
  return children;
}

function AdminOnly({ children, fallback = '/attendance' }) {
  const { staff } = useApp();
  if (staff?.role !== 'admin') return <Navigate to={fallback} replace />;
  return children;
}

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/register-complete" element={<RegisterComplete />} />
        <Route path="/pending" element={<PendingGuard><Pending /></PendingGuard>} />
        <Route path="/" element={<Gate><AdminOnly><Layout><Dashboard /></Layout></AdminOnly></Gate>} />
        <Route path="/attendance" element={<Gate><Layout><Attendance /></Layout></Gate>} />
        <Route path="/single-attendance" element={<Gate><Layout><SingleAttendance /></Layout></Gate>} />
        <Route path="/students" element={<Gate><NotRecorder><Layout><Students /></Layout></NotRecorder></Gate>} />
        <Route path="/lookup" element={<Gate><Layout><StudentLookup /></Layout></Gate>} />
        <Route path="/daily-report" element={<Gate><NotRecorder><Layout><DailyReport /></Layout></NotRecorder></Gate>} />
        <Route path="/period-report" element={<Gate><NotRecorder><Layout><PeriodReport /></Layout></NotRecorder></Gate>} />
        <Route path="/profile" element={<Gate><Layout><Profile /></Layout></Gate>} />
        <Route path="/staff-assignments" element={<Gate><AdminOnly><Layout><StaffAssignments /></Layout></AdminOnly></Gate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
