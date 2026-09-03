import { Clock, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import AuthShell from '../components/AuthShell';

export default function Pending() {
  const { t, staff, signOut } = useApp();
  const navigate = useNavigate();
  const isRevoked = staff && staff.status === 'revoked';

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <AuthShell>
      <div className="text-center">
        <div className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-5 ${isRevoked ? 'bg-rose-500/10 text-rose-500' : 'bg-gold/10 text-gold'}`}>
          {isRevoked ? <Ban size={22} /> : <Clock size={22} />}
        </div>
        <h1 className="text-xl font-semibold text-navy mb-2">{isRevoked ? t.revokedTitle : t.pendingTitle}</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-7">{isRevoked ? t.revokedBody : t.pendingBody}</p>
        <button onClick={handleSignOut} className="text-royal font-medium text-sm">{t.signOut}</button>
      </div>
    </AuthShell>
  );
}
