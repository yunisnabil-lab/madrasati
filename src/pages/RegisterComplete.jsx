import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/AuthShell';

export default function RegisterComplete() {
  const { t } = useApp();
  const [status, setStatus] = useState('working'); // working | done | error

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session ? sessionData.session.user : null;

      if (!user) { if (!cancelled) setStatus('error'); return; }

      const { data: existing } = await supabase
        .from('staff')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (existing) { if (!cancelled) setStatus('done'); return; }

      const { data: school } = await supabase.from('schools').select('id').limit(1).maybeSingle();
      if (!school) { if (!cancelled) setStatus('error'); return; }

      const { error } = await supabase.from('staff').insert({
        id: user.id,
        school_id: school.id,
        full_name: (user.user_metadata && user.user_metadata.full_name) || user.email,
        email: user.email,
        status: 'pending',
        role: null,
      });

      if (!cancelled) setStatus(error ? 'error' : 'done');
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <AuthShell>
      <div className="text-center">
        {status === 'working' && (
          <>
            <div className="h-10 w-10 mx-auto mb-6 border-2 border-royal/30 border-t-royal rounded-full animate-spin" />
            <p className="text-sm text-slate-500">{t.completing}</p>
          </>
        )}

        {status === 'done' && (
          <>
            <div className="h-14 w-14 rounded-full bg-royal/10 text-royal flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={24} />
            </div>
            <h1 className="text-xl font-semibold text-navy mb-2">{t.completeDone}</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-7">{t.completeBody}</p>
            <Link to="/login" className="text-royal font-medium text-sm">{t.backToLogin}</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="h-14 w-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-5">
              <AlertCircle size={24} />
            </div>
            <p className="text-sm text-slate-500 leading-relaxed mb-7">{t.completeError}</p>
            <Link to="/login" className="text-royal font-medium text-sm">{t.backToLogin}</Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
