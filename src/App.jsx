import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './lib/AppContext';
import { DialogsProvider } from './lib/Dialogs';
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
import ActivityLog from './pages/ActivityLog';
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

// strictly the one admin account — used only for the handful of actions the
// new "edari" (administrative) role does NOT inherit: resetting attendance
// and linking teachers/supervisors to sections.
function AdminOnly({ children, fallback = '/attendance' }) {
  const { staff } = useApp();
  if (staff?.role !== 'admin') return <Navigate to={fallback} replace />;
  return children;
}

// "/" shows a role-appropriate home page: the full admin dashboard for
// admins and "edari" staff, a personal home (their own classes/students) for
// recorders, and everyone else falls through to /attendance (which is now
// also usable by a supervisor, scoped to their own sections).
function HomeRoute() {
  const { staff } = useApp();
  if (staff?.role === 'admin' || staff?.role === 'edari') return <Dashboard />;
  if (staff?.role === 'recorder') return <RecorderDashboard />;
  return <Navigate to="/attendance" replace />;
}

// a supervisor now also takes attendance, looks students up, and views the
// daily/period reports — scoped to the sections they're assigned to, same as
// a recorder — in addition to their existing violations/lateness access.
// Student management (add/edit/deactivate) stays out of scope for them.
function NotSupervisor({ children, fallback = '/violations' }) {
  const { staff } = useApp();
  if (staff?.role === 'supervisor') return <Navigate to={fallback} replace />;
  return children;
}

function ViolationsAccess({ children, fallback = '/attendance' }) {
  const { staff } = useApp();
  const allowed = ['admin', 'supervisor', 'edari'];
  if (staff && !allowed.includes(staff.role)) return <Navigate to={fallback} replace />;
  return children;
}

// only the supervisor (and the admin) review and approve parent-contact
// requests — a teacher submits one from Student Lookup. "edari" staff contact
// parents directly without approval, so they have no review queue.
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
        <Route path="/attendance" element={<Gate><Layout><Attendance /></Layout></Gate>} />
        <Route path="/students" element={<Gate><NotRecorder><NotSupervisor><Layout><Students /></Layout></NotSupervisor></NotRecorder></Gate>} />
        <Route path="/lookup" element={<Gate><Layout><StudentLookup /></Layout></Gate>} />
        <Route path="/daily-report" element={<Gate><Layout><DailyReport /></Layout></Gate>} />
        <Route path="/period-report" element={<Gate><Layout><PeriodReport /></Layout></Gate>} />
        <Route path="/profile" element={<Gate><Layout><Profile /></Layout></Gate>} />
        {/* open to every role: teachers report violations for their own
            students, which then wait for the supervisor's approval */}
        <Route path="/violations" element={<Gate><Layout><Violations /></Layout></Gate>} />
        <Route path="/lateness" element={<Gate><ViolationsAccess><Layout><Lateness /></Layout></ViolationsAccess></Gate>} />
        <Route path="/supervisor-report" element={<Gate><ViolationsAccess><Layout><SupervisorReport /></Layout></ViolationsAccess></Gate>} />
        <Route path="/contact-requests" element={<Gate><ContactRequestsAccess><Layout><ContactRequests /></Layout></ContactRequestsAccess></Gate>} />
        <Route path="/staff-assignments" element={<Gate><AdminOnly><Layout><StaffAssignments /></Layout></AdminOnly></Gate>} />
        <Route path="/activity" element={<Gate><AdminOnly><Layout><ActivityLog /></Layout></AdminOnly></Gate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <DialogsProvider>
        <Router />
      </DialogsProvider>
    </AppProvider>
  );
}
