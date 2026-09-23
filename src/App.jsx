import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './lib/AppContext';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Register';
import RegisterComplete from './pages/RegisterComplete';
import Pending from './pages/Pending';
import Dashboard from './pages/Dashboard';
import RecorderDashboard from './pages/RecorderDashboard';
import Attendance from './pages/Attendance';
import Students from './pages/Students';
import StudentLookup from './pages/StudentLookup';
import DailyReport from './pages/DailyReport';
import PeriodReport from './pages/PeriodReport';
import StaffAssignments from './pages/StaffAssignments';
import Profile from './pages/Profile';
import Violations from './pages/Violations';
import Lateness from './pages/Lateness';
import SupervisorReport from './pages/SupervisorReport';
import ContactRequests from './pages/ContactRequests';
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

// "/" shows a role-appropriate home page: the full admin dashboard for
// admins, a personal home (their own classes/students) for recorders, and
// everyone else falls through to /attendance (which itself redirects a
// supervisor on to /violations, same as before this route existed).
function HomeRoute() {
  const { staff } = useApp();
  if (staff?.role === 'admin') return <Dashboard />;
  if (staff?.role === 'recorder') return <RecorderDashboard />;
  return <Navigate to="/attendance" replace />;
}

// the "supervisor" role is scoped to behavioral violations + lateness
// monitoring only — it doesn't take attendance, manage students, or see
// the other reports, so every other protected page redirects it away.
function NotSupervisor({ children, fallback = '/violations' }) {
  const { staff } = useApp();
  if (staff?.role === 'supervisor') return <Navigate to={fallback} replace />;
  return children;
}

function ViolationsAccess({ children, fallback = '/attendance' }) {
  const { staff } = useApp();
  const allowed = ['admin', 'supervisor', 'viewer'];
  if (staff && !allowed.includes(staff.role)) return <Navigate to={fallback} replace />;
  return children;
}

// only admin/supervisor review and approve parent-contact requests — a
// teacher can submit one (from Student Lookup) but can't approve their own.
function ContactRequestsAccess({ children, fallback = '/attendance' }) {
  const { staff } = useApp();
  const allowed = ['admin', 'supervisor'];
  if (staff && !allowed.includes(staff.role)) return <Navigate to={fallback} replace />;
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
        <Route path="/" element={<Gate><Layout><HomeRoute /></Layout></Gate>} />
        <Route path="/attendance" element={<Gate><NotSupervisor><Layout><Attendance /></Layout></NotSupervisor></Gate>} />
        <Route path="/students" element={<Gate><NotRecorder><NotSupervisor><Layout><Students /></Layout></NotSupervisor></NotRecorder></Gate>} />
        <Route path="/lookup" element={<Gate><NotSupervisor><Layout><StudentLookup /></Layout></NotSupervisor></Gate>} />
        <Route path="/daily-report" element={<Gate><NotSupervisor><Layout><DailyReport /></Layout></NotSupervisor></Gate>} />
        <Route path="/period-report" element={<Gate><NotSupervisor><Layout><PeriodReport /></Layout></NotSupervisor></Gate>} />
        <Route path="/profile" element={<Gate><Layout><Profile /></Layout></Gate>} />
        <Route path="/violations" element={<Gate><ViolationsAccess><Layout><Violations /></Layout></ViolationsAccess></Gate>} />
        <Route path="/lateness" element={<Gate><ViolationsAccess><Layout><Lateness /></Layout></ViolationsAccess></Gate>} />
        <Route path="/supervisor-report" element={<Gate><ViolationsAccess><Layout><SupervisorReport /></Layout></ViolationsAccess></Gate>} />
        <Route path="/contact-requests" element={<Gate><ContactRequestsAccess><Layout><ContactRequests /></Layout></ContactRequestsAccess></Gate>} />
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
