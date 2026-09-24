import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, LogOut, GraduationCap } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';

function useLiveNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Header() {
  const { t, lang, setLang, dark, staff, signOut } = useApp();
  // Staff/registration-request management is admin-only — "edari" staff
  // does not manage staff, so this notification stays admin-only too.
  const isAdmin = staff && staff.role === 'admin';
  const now = useLiveNow();
  const dateTimeStr = new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(now);

  const [requests, setRequests] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, email, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setRequests(data || []);
  }, [isAdmin]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  return (
    <header className={`no-print sticky top-0 z-20 backdrop-blur-md border-b shadow-lg transition-colors duration-300 ${dark ? 'bg-gradient-to-b from-navy-soft to-navy/80 border-royal/20' : 'bg-gradient-to-b from-white to-pearl-soft/70 border-royal/10'}`}>
      {notifOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setNotifOpen(false)}
        />
      )}
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">

        {/* School branding — rightmost now that the account block lives only in the sidebar */}
        <div className="hidden sm:flex items-center gap-2.5">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${dark ? 'bg-royal/15' : 'bg-royal/10'}`}>
            {staff && staff.school_logo_url ? (
              <img src={staff.school_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <GraduationCap size={20} className={dark ? 'text-royal-light' : 'text-royal'} />
            )}
          </div>
          <div className="hidden md:block leading-tight">
            <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.school}</div>
            <div className={`text-[11px] ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{lang === 'ar' ? 'مدرستي' : 'Madrasati'}</div>
          </div>
        </div>

        {/* Search — widened further */}
        <div className={`flex-1 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm max-w-xl border transition-colors focus-within:border-royal ${dark ? 'bg-white/5 border-transparent text-slate-400 focus-within:bg-white/10' : 'bg-slate-100 border-transparent text-slate-500 focus-within:bg-white focus-within:shadow-sm'}`}>
          <Search size={17} className={dark ? 'text-royal-light' : 'text-royal'} />
          <input placeholder={t.search} className="bg-transparent outline-none placeholder:text-inherit w-full text-sm" />
        </div>

        {/* Everything else — sits right after search, no leftover gap.
            Sign-out is last in DOM, so under RTL it renders furthest left. */}
        <div className="flex items-center gap-6">
          {/* Live date/time */}
          <div className={`hidden lg:flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${dark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
            {dateTimeStr}
          </div>

          {/* Language — compact circular EN/AR badge; shows the language you'll SWITCH TO */}
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            className={`hidden sm:flex items-center justify-center h-10 w-10 rounded-full text-[11px] font-extrabold tracking-wide transition-colors ${dark ? 'bg-gold/15 text-gold-light hover:bg-gold/25' : 'bg-gold/10 text-gold hover:bg-gold/20'}`}
          >
            {lang === 'ar' ? 'EN' : 'AR'}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className={`relative h-10 w-10 rounded-full flex items-center justify-center transition-colors ${dark ? 'bg-royal/15 text-royal-light hover:bg-royal/25' : 'bg-royal/10 text-royal hover:bg-royal/20'}`}
            >
              <Bell size={18} />
              {isAdmin && requests.length > 0 && (
                <span className={`absolute -top-0.5 -end-0.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-gold text-white text-[9px] font-bold ring-2 ${dark ? 'ring-navy' : 'ring-white'}`}>
                  {requests.length}
                </span>
              )}
            </button>
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  className={`absolute end-0 mt-2 w-72 rounded-xl border shadow-xl py-2 z-30 ${dark ? 'bg-navy-soft border-slate-700' : 'bg-white border-slate-100'}`}
                >
                  <div className="px-3.5 py-1.5 text-xs font-semibold">{t.notifications}</div>
                  {isAdmin && requests.length > 0 ? (
                    requests.map((r) => (
                      <div key={r.id} className="px-3.5 py-2 text-xs">
                        <span className={dark ? 'text-slate-200' : 'text-slate-500'}>{t.newRequestNotif}</span>{' '}
                        <span className="font-medium">{r.full_name}</span>
                      </div>
                    ))
                  ) : (
                    <div className={`px-3.5 py-2 text-xs ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.noNotifications}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Account — mobile only; on desktop it lives at the top of the sidebar,
              which is hidden on small screens. */}
          <Link to="/profile" className="md:hidden h-10 w-10 rounded-full shrink-0 overflow-hidden">
            {staff && staff.avatar_url ? (
              <img src={staff.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold">
                {staff ? (staff.full_name || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() : '--'}
              </div>
            )}
          </Link>

          {/* Sign-out */}
          <button
            onClick={signOut}
            title={t.signOut}
            className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${dark ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}
          >
            <LogOut size={18} />
          </button>
        </div>

      </div>
    </header>
  );
}
