import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const { t, fetchStaff } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError(t.errRequired); return; }
    setLoading(true);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (signInError) {
      setError(t.errInvalid);
      setLoading(false);
      return;
    }

    const { data: staffRow, error: staffError } = await supabase
      .from('staff')
      .select('id, full_name, role, status, school_id, avatar_url, email')
      .eq('id', signInData.user.id)
      .maybeSingle();

    if (staffError) {
      setError('DEBUG: ' + staffError.message + ' (code: ' + (staffError.code || '—') + ')');
      setLoading(false);
      return;
    }
    if (!staffRow) {
      setError('DEBUG: no staff row found for user id ' + signInData.user.id);
      setLoading(false);
      return;
    }
    if (staffRow.status !== 'approved') {
      setError('DEBUG: row found — status="' + staffRow.status + '" role="' + staffRow.role + '" id=' + staffRow.id + ' (signed-in as ' + signInData.user.id + ', ' + signInData.user.email + ')');
      setLoading(false);
      return;
    }

    await fetchStaff(signInData.user.id);
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
          <label htmlFor="loginEmail" className="block text-sm font-medium text-slate-700 mb-2">{t.email}</label>
          <input
            id="loginEmail"
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-royal focus:ring-4 focus:ring-royal/10 transition"
          />
        </div>
        <div>
          <label htmlFor="loginPassword" className="block text-sm font-medium text-slate-700 mb-2">{t.password}</label>
          <div className="relative">
            <input
              id="loginPassword"
              type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-3 pe-11 text-sm outline-none focus:border-royal focus:ring-4 focus:ring-royal/10 transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 end-0 flex items-center px-3.5 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
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
