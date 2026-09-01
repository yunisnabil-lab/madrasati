import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function Register() {
  const { t } = useApp();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!fullName || !email || !password) { setError(t.errRequired); return; }
    if (password.length < 8) { setError(t.errPasswordShort); return; }

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + '/register-complete',
      },
    });
    setLoading(false);

    if (signUpError) {
      const msg = String(signUpError.message || '').toLowerCase();
      setError(msg.includes('already') || msg.includes('registered') ? t.errExists : t.errGeneric);
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell>
      {!sent ? (
        <>
          <h1 className="text-2xl font-semibold text-navy mb-2">{t.registerTitle}</h1>
          <p className="text-sm text-slate-500 mb-8">{t.registerSubtitle}</p>

          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3.5 py-3 text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">{t.fullName}</label>
              <input
                value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-royal focus:ring-4 focus:ring-royal/10 transition"
              />
            </div>
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
              {loading ? '...' : t.createBtn}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-7">
            {t.haveAccount}{' '}
            <Link to="/login" className="text-royal font-medium">{t.signIn}</Link>
          </p>
        </>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="h-14 w-14 rounded-full bg-royal/10 text-royal flex items-center justify-center mx-auto mb-5">
            <Mail size={22} />
          </div>
          <h1 className="text-xl font-semibold text-navy mb-2">{t.sentTitle}</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-7">{t.sentBody}</p>
          <Link to="/login" className="text-royal font-medium text-sm">{t.backToLogin}</Link>
        </motion.div>
      )}
    </AuthShell>
  );
}
