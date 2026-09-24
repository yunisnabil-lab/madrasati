import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, UserX, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { cardFloating, skeleton } from '../lib/theme';
import { periodsForDate } from '../lib/attendanceDerive';
import { nonSchoolDay } from '../lib/schoolCalendar';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Dashboard block for admin/edari: how today's recording is going, who was
// absent, and how many students the early-warning list flags. Each card opens
// the page with the detail.
export default function TodaySummary({ t, lang, dark }) {
  const [data, setData] = useState(null);
  const today = fmt(new Date());
  const offDay = nonSchoolDay(today, lang);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      const fromStr = fmt(from);
      const [studRes, recRes, sumRes, vioRes] = await Promise.all([
        fetchAllRows(() => supabase.from('students').select('id, section_id').eq('is_active', true).order('id')),
        fetchAllRows(() => supabase.from('attendance_records').select('id, student_id, period, status').eq('date', today).order('id')),
        supabase.rpc('student_attendance_summary', { p_from: fromStr, p_to: today }),
        fetchAllRows(() => supabase.from('behavior_violations').select('id, student_id').eq('status', 'approved').gte('date', fromStr).lte('date', today).order('id')),
      ]);
      if (cancelled) return;

      const students = (studRes.data || []).filter((s) => s.section_id);
      const sectionOf = {};
      const perSection = {};
      students.forEach((s) => { sectionOf[s.id] = s.section_id; perSection[s.section_id] = (perSection[s.section_id] || 0) + 1; });

      const seen = new Set();
      const counts = {};
      const absent = new Set();
      (recRes.data || []).forEach((r) => {
        if (r.period == null || !sectionOf[r.student_id]) return;
        const key = `${r.student_id}:${r.period}`;
        if (seen.has(key)) return;
        seen.add(key);
        const sec = sectionOf[r.student_id];
        counts[sec] = counts[sec] || {};
        counts[sec][r.period] = (counts[sec][r.period] || 0) + 1;
        if (r.status === 'absent') absent.add(r.student_id);
      });
      const periods = periodsForDate(today);
      let done = 0;
      Object.keys(perSection).forEach((sec) => {
        for (let p = 1; p <= periods; p++) if ((counts[sec]?.[p] || 0) >= perSection[sec]) done += 1;
      });

      let warn = null;
      if (!sumRes.error) {
        const vio = {};
        (vioRes.data || []).forEach((v) => { vio[v.student_id] = (vio[v.student_id] || 0) + 1; });
        const flagged = new Set();
        (sumRes.data || []).forEach((r) => { if (r.absent_days >= 3) flagged.add(r.student_id); });
        Object.keys(vio).forEach((id) => { if (vio[id] >= 3) flagged.add(Number(id)); });
        warn = [...flagged].filter((id) => sectionOf[id] || sectionOf[String(id)]).length;
      }
      setData({ done, total: Object.keys(perSection).length * periods, absent: absent.size, warn });
    })();
    return () => { cancelled = true; };
  }, [today]);

  const cards = [
    {
      to: '/recording-status', icon: ListChecks, label: t.todayPeriods,
      value: data ? t.todayPeriodsOf.replace('{done}', data.done).replace('{total}', data.total) : null,
      accent: dark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 text-emerald-600',
    },
    {
      to: '/recording-status', icon: UserX, label: t.todayAbsent,
      value: data ? data.absent : null,
      accent: dark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-500/10 text-rose-600',
    },
    {
      to: '/insights', icon: ShieldAlert, label: t.todayWarning,
      value: data ? (data.warn == null ? '—' : data.warn) : null,
      accent: dark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/10 text-amber-600',
    },
  ];

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline gap-x-3 mb-3">
        <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.todayTitle}</h2>
        {offDay && <span className={`text-xs ${dark ? 'text-amber-200' : 'text-amber-700'}`}>{t.notSchoolDayNote.replace('{name}', offDay.name)}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to} className={`${cardFloating(dark)} p-5 flex items-center gap-4`}>
              <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${c.accent}`}><Icon size={19} /></div>
              <div className="min-w-0">
                <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{c.label}</div>
                {c.value == null
                  ? <div className={skeleton(dark, 'h-7 w-20 mt-1')} />
                  : <div className={`text-2xl font-bold font-en ${dark ? 'text-white' : 'text-navy'}`}>{c.value}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
