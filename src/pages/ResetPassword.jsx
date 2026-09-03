import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function ResetPassword() {
  const { t } = useApp();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(t.errPasswordShort); return; }
    if (password !== confirm) { setError(t.errPasswordMismatch); return; }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) { setError(t.errGeneric); return; }
    setDone(true);
    setTimeout(() => navigate('/login'), 1800);
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-navy mb-2">{t.resetPasswordTitle}</h1>
      <p className="text-sm text-slate-500 mb-8">{t.resetPasswordSub}</p>

      {done ? (
        <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3.5 py-3 text-sm">
          {t.passwordUpdated}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3.5 py-3 text-sm">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-2">{t.newPassword}</label>
            <div className="relative">
              <input
                id="newPassword"
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
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-2">{t.confirmNewPassword}</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-royal focus:ring-4 focus:ring-royal/10 transition"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg bg-navy text-white font-semibold py-3 text-sm transition hover:bg-navy-soft disabled:opacity-70 active:scale-[0.985]"
          >
            {loading ? '...' : t.updatePassword}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
