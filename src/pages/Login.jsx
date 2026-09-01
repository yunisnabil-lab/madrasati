import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const { t, refreshStaff } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError(t.errRequired); return; }
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(t.errInvalid);
      setLoading(false);
      return;
    }

    await refreshStaff();
    setLoading(false);
    navigate('/');
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-navy mb-2">{t.loginTitle}</h1>
      <p className="text-sm text-slate-500 mb-8">{t.loginSubtitle}</p>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3.5 py-3 text-sm mb-5">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.email}</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-royal focus:ring-4 focus:ring-royal/10 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.password}</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-royal focus:ring-4 focus:ring-royal/10 transition"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="w-full rounded-lg bg-navy text-white font-semibold py-3 text-sm transition hover:bg-navy-soft disabled:opacity-70 active:scale-[0.985]"
        >
          {loading ? '...' : t.signIn}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-7">
        {t.noAccount}{' '}
        <Link to="/register" className="text-royal font-medium">{t.createAccount}</Link>
      </p>
    </AuthShell>
  );
}
