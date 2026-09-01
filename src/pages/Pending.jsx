import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import AuthShell from '../components/AuthShell';

export default function Pending() {
  const { t, signOut } = useApp();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <AuthShell>
      <div className="text-center">
        <div className="h-14 w-14 rounded-full bg-gold/10 text-gold flex items-center justify-center mx-auto mb-5">
          <Clock size={22} />
        </div>
        <h1 className="text-xl font-semibold text-navy mb-2">{t.pendingTitle}</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-7">{t.pendingBody}</p>
        <button onClick={handleSignOut} className="text-royal font-medium text-sm">{t.signOut}</button>
      </div>
    </AuthShell>
  );
}
