import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const { t, lang, setLang, dark, staff, signOut, confirmLeave } = useApp();
  // Staff/registration-request management is admin-only — "edari" staff
  // does not manage staff, so this notification stays admin-only too.
  const isAdmin = staff && staff.role === 'admin';
  const now = useLiveNow();
  const navigate = useNavigate();
  // the header box searches students: Enter opens the lookup page with results
  const [headerQuery, setHeaderQuery] = useState('');
  const dateTimeStr = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', {
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

  // supervisor/admin: teacher-reported violations waiting for review
  const canReview = staff && (staff.role === 'admin' || staff.role === 'supervisor');
  const [pendingViolations, setPendingViolations] = useState(0);
  useEffect(() => {
    if (!canReview) return;
    (async () => {
      const { count } = await supabase
        .from('behavior_violations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingViolations(count || 0);
    })();
  }, [canReview]);
  // a teacher's replies: the supervisor's decisions on the violations and
  // parent-contact requests they sent (last 14 days). "Unread" = decided after
  // the last time the bell was opened, remembered per person in this browser.
  const isRecorder = staff && staff.role === 'recorder';
  const [replies, setReplies] = useState([]);
  const [seenAt, setSeenAt] = useState(0);
  const [seenBefore, setSeenBefore] = useState(0); // seenAt as of the last bell open, to highlight new items
  useEffect(() => {
    if (!isRecorder) return;
    try { setSeenAt(Number(localStorage.getItem('madrasati-notif-seen-' + staff.id)) || 0); } catch { /* private mode: everything shows as new */ }
    (async () => {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [v, c] = await Promise.all([
        supabase.from('behavior_violations')
          .select('id, status, reviewed_at, students!behavior_violations_student_id_fkey(name_ar, name_en)')
          .eq('staff_id', staff.id).in('status', ['approved', 'rejected']).gte('reviewed_at', since)
          .order('reviewed_at', { ascending: false }).limit(10),
        supabase.from('contact_requests')
          .select('id, status, reviewed_at, students(name_ar, name_en)')
          .eq('requested_by', staff.id).in('status', ['approved', 'rejected']).gte('reviewed_at', since)
          .order('reviewed_at', { ascending: false }).limit(10),
      ]);
      const list = [
        ...(v.data || []).map((r) => ({ key: 'v' + r.id, kind: 'violation', status: r.status, student: r.students, ts: new Date(r.reviewed_at).getTime() })),
        ...(c.data || []).map((r) => ({ key: 'c' + r.id, kind: 'contact', status: r.status, student: r.students, ts: new Date(r.reviewed_at).getTime() })),
      ].sort((a, b) => b.ts - a.ts).slice(0, 10);
      setReplies(list);
    })();
  }, [isRecorder, staff]);
  const unreadReplies = replies.filter((r) => r.ts > seenAt).length;

  const toggleNotif = () => {
    setNotifOpen((open) => {
      if (!open && isRecorder) {
        setSeenBefore(seenAt);
        const now = Date.now();
        setSeenAt(now);
        try { localStorage.setItem('madrasati-notif-seen-' + staff.id, String(now)); } catch { /* ignore */ }
      }
      return !open;
    });
  };

  const notifCount = (isAdmin ? requests.length : 0) + (canReview ? pendingViolations : 0) + (isRecorder ? unreadReplies : 0);

  return (
    <header className={`no-print sticky top-0 z-20 backdrop-blur-md border-b shadow-lg transition-colors duration-300 ${dark ? 'bg-gradient-to-b from-navy-soft to-navy/80 border-royal/20' : 'bg-gradient-to-b from-white to-pearl-soft/70 border-royal/10'}`}>
      {notifOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setNotifOpen(false)}
        />
      )}
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-6">

        {/* School branding — first in the row, so it sits at the start edge
            (right in Arabic, left in English) beside the search box: the
            school name with the app name "مدرستي" as a small line under it,
            and the logo on the name's far side. */}
        <div className="hidden sm:flex items-center gap-2.5">
          <div className="hidden md:block leading-tight">
            <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.school} — {t.schoolSub}</div>
            <div className={`text-xs font-medium ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{lang === 'ar' ? 'مدرستي' : 'Madrasati'}</div>
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${dark ? 'bg-royal/15' : 'bg-royal/10'}`}>
            {staff && staff.school_logo_url ? (
              <img src={staff.school_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <GraduationCap size={20} className={dark ? 'text-royal-light' : 'text-royal'} />
            )}
          </div>
        </div>

        {/* Search — widened further */}
        <div className={`flex-1 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm max-w-xl border transition-colors focus-within:border-royal ${dark ? 'bg-white/5 border-transparent text-slate-400 focus-within:bg-white/10' : 'bg-slate-100 border-transparent text-slate-500 focus-within:bg-white focus-within:shadow-sm'}`}>
          <Search size={17} className={dark ? 'text-royal-light' : 'text-royal'} />
          <input
            value={headerQuery}
            onChange={(e) => setHeaderQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !headerQuery.trim()) return;
              if (!confirmLeave()) return;
              navigate('/lookup', { state: { q: headerQuery.trim() } });
              setHeaderQuery('');
            }}
            placeholder={t.search}
            className="bg-transparent outline-none placeholder:text-inherit w-full text-sm"
          />
        </div>

        {/* Everything else, grouped at the far end of the header (the left
            edge in Arabic, the right edge in English — flexbox mirrors this
            on its own from the document's dir, so one order works for both):
            live time, language, notifications, sign-out. */}
        <div className="flex items-center gap-6">
          {/* Live date/time */}
          <div className={`hidden lg:flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${dark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
            {dateTimeStr}
          </div>

          {/* Language — compact circular EN/AR badge; shows the language you'll SWITCH TO */}
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            className={`hidden sm:flex items-center justify-center h-10 w-10 rounded-full text-xs font-extrabold tracking-wide transition-colors ${dark ? 'bg-gold/15 text-gold-light hover:bg-gold/25' : 'bg-gold/10 text-gold hover:bg-gold/20'}`}
          >
            {lang === 'ar' ? 'EN' : 'AR'}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={toggleNotif}
              className={`relative h-10 w-10 rounded-full flex items-center justify-center transition-colors ${dark ? 'bg-royal/15 text-royal-light hover:bg-royal/25' : 'bg-royal/10 text-royal hover:bg-royal/20'}`}
            >
              <Bell size={18} />
              {notifCount > 0 && (
                <span className={`absolute -top-0.5 -end-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-gold text-white text-[9px] font-bold ring-2 ${dark ? 'ring-navy' : 'ring-white'}`}>
                  {notifCount}
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
                  {canReview && pendingViolations > 0 && (
                    <Link
                      to="/violations"
                      onClick={(e) => { if (!confirmLeave()) { e.preventDefault(); return; } setNotifOpen(false); }}
                      className={`block px-3.5 py-2 text-xs font-medium text-rose-500 ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                    >
                      {t.pendingViolationsNotif.replace('{n}', pendingViolations)}
                    </Link>
                  )}
                  {isAdmin && requests.length > 0 ? (
                    requests.map((r) => (
                      <div key={r.id} className="px-3.5 py-2 text-xs">
                        <span className={dark ? 'text-slate-200' : 'text-slate-500'}>{t.newRequestNotif}</span>{' '}
                        <span className="font-medium">{r.full_name}</span>
                      </div>
                    ))
                  ) : null}
                  {isRecorder && replies.map((r) => {
                    const name = r.student ? (lang === 'ar' ? (r.student.name_ar || r.student.name_en) : (r.student.name_en || r.student.name_ar)) : '—';
                    const text = (r.kind === 'violation'
                      ? (r.status === 'approved' ? t.replyViolationApproved : t.replyViolationRejected)
                      : (r.status === 'approved' ? t.replyContactApproved : t.replyContactRejected)).replace('{s}', name);
                    const isNew = r.ts > seenBefore;
                    return (
                      <div key={r.key} className={`px-3.5 py-2 text-xs ${isNew ? (dark ? 'bg-royal/10' : 'bg-royal/5') : ''}`}>
                        <span className={r.status === 'approved' ? 'text-emerald-500 font-medium' : 'text-rose-500 font-medium'}>{text}</span>
                      </div>
                    );
                  })}
                  {notifCount === 0 && (!isRecorder || replies.length === 0) && (
                    <div className={`px-3.5 py-2 text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noNotifications}</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Account — mobile only; on desktop it lives at the top of the sidebar,
              which is hidden on small screens. */}
          <Link to="/profile" onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }} className="md:hidden h-10 w-10 rounded-full shrink-0 overflow-hidden">
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
            onClick={() => { if (confirmLeave()) signOut(); }}
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
