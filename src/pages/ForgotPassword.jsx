import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function ForgotPassword() {
  const { t } = useApp();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) { setError(t.errRequired); return; }
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    // Always show success, even if the address isn't registered — avoids
    // revealing which emails exist in the system.
    setSent(true);
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-navy mb-2">{t.forgotPasswordTitle}</h1>
      <p className="text-sm text-slate-500 mb-8">{t.forgotPasswordSub}</p>

      {sent ? (
        <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3.5 py-3 text-sm mb-5">
          {t.resetLinkSent}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3.5 py-3 text-sm">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="fpEmail" className="block text-sm font-medium text-slate-700 mb-2">{t.email}</label>
            <input
              id="fpEmail"
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-royal focus:ring-4 focus:ring-royal/10 transition"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg bg-navy text-white font-semibold py-3 text-sm transition hover:bg-navy-soft disabled:opacity-70 active:scale-[0.985]"
          >
            {loading ? '...' : t.sendResetLink}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-500 mt-7">
        <Link to="/login" className="text-royal font-medium">{t.backToLogin}</Link>
      </p>
    </AuthShell>
  );
}
