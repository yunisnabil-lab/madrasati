import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './lib/AppContext';
import Login from './pages/Login';
import Register from './pages/Register';
import RegisterComplete from './pages/RegisterComplete';
import Pending from './pages/Pending';
import Dashboard from './pages/Dashboard';

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

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/register-complete" element={<RegisterComplete />} />
        <Route path="/pending" element={<PendingGuard><Pending /></PendingGuard>} />
        <Route path="/" element={<Gate><Dashboard /></Gate>} />
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
