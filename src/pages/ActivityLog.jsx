import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, Pencil, Trash2, AlertTriangle, Clock3, Send, UserCog, GraduationCap, Loader2, Activity } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import EmptyState from '../components/EmptyState';
import ActivityViewersModal from '../components/ActivityViewersModal';

const PAGE_SIZE = 50;

// action -> { icon, tone, filter group }
const ACTIONS = {
  attendance_save: { icon: ClipboardCheck, tone: 'royal', group: 'attendance' },
  attendance_change: { icon: Pencil, tone: 'amber', group: 'attendance' },
  attendance_delete: { icon: Trash2, tone: 'rose', group: 'delete' },
  violation_add: { icon: AlertTriangle, tone: 'rose', group: 'violations' },
  violation_review: { icon: AlertTriangle, tone: 'amber', group: 'violations' },
  violation_delete: { icon: Trash2, tone: 'rose', group: 'delete' },
  lateness_add: { icon: Clock3, tone: 'amber', group: 'lateness' },
  lateness_delete: { icon: Trash2, tone: 'rose', group: 'delete' },
  student_add: { icon: GraduationCap, tone: 'royal', group: 'students' },
  student_deactivate: { icon: GraduationCap, tone: 'rose', group: 'students' },
  student_restore: { icon: GraduationCap, tone: 'emerald', group: 'students' },
  student_delete: { icon: Trash2, tone: 'rose', group: 'delete' },
  staff_change: { icon: UserCog, tone: 'royal', group: 'staff' },
  parent_contact: { icon: Send, tone: 'emerald', group: 'contact' },
};

const TONES = {
  royal: 'bg-royal/10 text-royal',
  amber: 'bg-amber-500/10 text-amber-600',
  rose: 'bg-rose-500/10 text-rose-500',
  emerald: 'bg-emerald-500/10 text-emerald-600',
};

const GROUPS = ['attendance', 'violations', 'lateness', 'students', 'staff', 'contact', 'delete'];

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ActivityLog() {
  const { t, lang, dark, staff } = useApp();
  const isAdmin = staff && staff.role === 'admin';
  const [viewersOpen, setViewersOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [summary, setSummary] = useState(null); // per-staff last login + counts
  const [missing, setMissing] = useState(false); // the SQL hasn't been run yet
  const [rows, setRows] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [staffFilter, setStaffFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());

  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-US';
  const fmtDateTime = (iso) => (iso
    ? new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '—');
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto' }), [lang]);
  const ago = (iso) => {
    if (!iso) return t.activityNever;
    const diff = (new Date(iso).getTime() - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('staff_activity_summary');
      if (error) { setMissing(true); setSummary([]); return; }
      setSummary(data || []);
    })();
  }, [reloadKey]);

  const buildQuery = useCallback(() => {
    let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false });
    if (staffFilter) q = q.eq('staff_id', staffFilter);
    if (groupFilter) {
      const actions = Object.entries(ACTIONS).filter(([, v]) => v.group === groupFilter).map(([k]) => k);
      q = q.in('action', actions);
    }
    if (fromDate) q = q.gte('created_at', `${fromDate}T00:00:00`);
    if (toDate) q = q.lte('created_at', `${toDate}T23:59:59`);
    return q;
  }, [staffFilter, groupFilter, fromDate, toDate]);

  const load = useCallback(async () => {
    setRows(null);
    const { data, error } = await buildQuery().range(0, PAGE_SIZE - 1);
    if (error) { setMissing(true); setRows([]); return; }
    setRows(data || []);
    setHasMore((data || []).length === PAGE_SIZE);
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    const from = rows.length;
    const { data } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    setRows((r) => [...r, ...(data || [])]);
    setHasMore((data || []).length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const status = (s) => ({
    present: t.statusPresent, absent: t.statusAbsent, late: t.statusLate, excused: t.statusExcused,
    pending: t.violationStatusPending, approved: t.violationStatusApproved, rejected: t.violationStatusRejected,
  }[s] || s || '—');

  const groupLabel = (g) => t.activityGroups[g];

  // one readable sentence (plus optional detail lines) per log row
  const describe = (r) => {
    const d = r.details || {};
    const sections = Array.isArray(d.sections) && d.sections.length ? ` (${d.sections.join('، ')})` : '';
    const vtype = d.type ? (t.violationTypeNames[d.type] || d.type) : '';
    switch (r.action) {
      case 'attendance_save':
        return {
          text: t.actAttendanceSave.replace('{n}', d.count).replace('{date}', d.date || '—').replace('{p}', d.period || '—') + sections,
          lines: [`${t.statusPresent} ${d.present || 0} · ${t.statusAbsent} ${d.absent || 0} · ${t.statusLate} ${d.late || 0} · ${t.statusExcused} ${d.excused || 0}`],
        };
      case 'attendance_change':
        return {
          text: t.actAttendanceChange.replace('{n}', d.count),
          lines: (d.changes || []).map((c) => `${c.student}: ${status(c.from)} ← ${status(c.to)} — ${c.date}${c.period ? ` (${t.periodN.replace('{n}', c.period)})` : ''}`),
        };
      case 'attendance_delete':
        return { text: t.actAttendanceDelete.replace('{n}', d.count).replace('{date}', d.date || '—') };
      case 'violation_add':
        return { text: t.actViolationAdd.replace('{s}', d.student || '—').replace('{v}', vtype) + (d.status === 'pending' ? ` — ${t.violationStatusPending}` : '') };
      case 'violation_review':
        return { text: t.actViolationReview.replace('{s}', d.student || '—').replace('{v}', vtype).replace('{to}', status(d.to)) };
      case 'violation_delete':
        return { text: t.actViolationDelete.replace('{s}', d.student || '—').replace('{v}', vtype) };
      case 'lateness_add':
        return { text: t.actLatenessAdd.replace('{s}', d.student || '—').replace('{date}', d.date || '—') };
      case 'lateness_delete':
        return { text: t.actLatenessDelete.replace('{s}', d.student || '—').replace('{date}', d.date || '—') };
      case 'student_add':
        return { text: t.actStudentAdd.replace('{s}', d.student || '—') };
      case 'student_deactivate':
        return { text: t.actStudentDeactivate.replace('{s}', d.student || '—') };
      case 'student_restore':
        return { text: t.actStudentRestore.replace('{s}', d.student || '—') };
      case 'student_delete':
        return { text: t.actStudentDelete.replace('{s}', d.student || '—') };
      case 'staff_change': {
        const parts = [];
        if (d.role_from !== d.role_to) parts.push(`${t.roleNames[d.role_from] || d.role_from} ← ${t.roleNames[d.role_to] || d.role_to}`);
        if (d.status_from !== d.status_to) parts.push(`${d.status_from} ← ${d.status_to}`);
        return { text: t.actStaffChange.replace('{s}', d.staff || '—'), lines: parts };
      }
      case 'parent_contact':
        return { text: t.actParentContact.replace('{s}', d.student || '—').replace('{c}', d.channel === 'whatsapp' ? 'WhatsApp' : 'Email') };
      default:
        return { text: r.action };
    }
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.activityTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{isAdmin ? t.activitySub : t.activitySubEdari}</p>
            {isAdmin && (
              <button onClick={() => setViewersOpen(true)} className={`mt-3 text-xs font-medium px-4 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                {t.activityViewersBtn}
              </button>
            )}
          </motion.div>

          {missing && (
            <div className={cardFloating(dark, 'p-5 mb-5')}>
              <p className="text-sm text-rose-500 font-medium">{t.activityNotReady}</p>
            </div>
          )}

          {/* who's active: last login + actions in the last 7 days */}
          <div className={cardFloating(dark, 'p-5 mb-5')}>
            <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.activityStaffTitle}</h2>
            {summary === null ? (
              <div className="grid sm:grid-cols-2 gap-2.5">{[0, 1, 2, 3].map((i) => <div key={i} className={skeleton(dark, 'h-16 w-full')} />)}</div>
            ) : summary.length === 0 ? (
              <EmptyState icon={Activity} text={isAdmin ? t.activityNoStaff : t.activityNoneAssigned} hint={isAdmin ? undefined : t.activityNoneAssignedHint} dark={dark} compact />
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {summary.map((s) => {
                  const active = staffFilter === s.staff_id;
                  return (
                    <button
                      key={s.staff_id}
                      onClick={() => setStaffFilter(active ? '' : s.staff_id)}
                      className={`text-start rounded-xl px-4 py-3 border transition-colors ${
                        active
                          ? 'border-royal bg-royal/10'
                          : dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{s.full_name}</span>
                        <span className={`text-xs shrink-0 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{t.roleNames[s.role] || s.role}</span>
                      </div>
                      <div className={`text-xs mt-1 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>
                        {t.activityLastLogin}: <span className="font-medium">{ago(s.last_sign_in_at)}</span>
                      </div>
                      <div className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>
                        {t.activityActions7d.replace('{n}', s.actions_7d)}
                        {s.last_action_at ? ` · ${t.activityLastAction}: ${ago(s.last_action_at)}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* filters */}
          <div className={cardFloating(dark, 'p-4 mb-5 grid grid-cols-1 sm:grid-cols-4 gap-3')}>
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className={inputCls}>
              <option value="">{t.activityAllStaff}</option>
              {(summary || []).map((s) => <option key={s.staff_id} value={s.staff_id}>{s.full_name}</option>)}
            </select>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={inputCls}>
              <option value="">{t.activityAllTypes}</option>
              {GROUPS.map((g) => <option key={g} value={g}>{groupLabel(g)}</option>)}
            </select>
            <input type="date" value={fromDate} max={todayStr()} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} font-en`} aria-label={t.fromDate} />
            <input type="date" value={toDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} className={`${inputCls} font-en`} aria-label={t.toDate} />
          </div>

          {/* timeline */}
          <div className={cardFloating(dark, 'p-5')}>
            {rows === null ? (
              <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className={skeleton(dark, 'h-14 w-full')} />)}</div>
            ) : rows.length === 0 ? (
              <EmptyState icon={Activity} text={t.activityEmpty} hint={t.activityEmptyHint} dark={dark} />
            ) : (
              <>
                <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {rows.map((r) => {
                    const meta = ACTIONS[r.action] || { icon: Activity, tone: 'royal' };
                    const Icon = meta.icon;
                    const info = describe(r);
                    return (
                      <li key={r.id} className="flex items-start gap-3 py-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${TONES[meta.tone]}`}>
                          <Icon size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">
                            <span className="font-semibold">{r.actor_name || '—'}</span>{' '}
                            <span className={dark ? 'text-slate-200' : 'text-slate-700'}>{info.text}</span>
                          </div>
                          {info.lines && info.lines.map((line, i) => (
                            <div key={i} className={`text-xs mt-0.5 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{line}</div>
                          ))}
                        </div>
                        <div className={`text-xs shrink-0 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{fmtDateTime(r.created_at)}</div>
                      </li>
                    );
                  })}
                </ul>
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <button onClick={loadMore} disabled={loadingMore} className={`flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                      {loadingMore && <Loader2 size={14} className="animate-spin" />} {t.activityLoadMore}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

        </main>
      </div>

      {viewersOpen && (
        <ActivityViewersModal
          staff={staff} t={t} dark={dark} inputCls={inputCls}
          onClose={() => setViewersOpen(false)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
