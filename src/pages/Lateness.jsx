import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock3, AlertTriangle } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel } from '../lib/sections';

const REPEAT_THRESHOLD = 3;
const RANGE_OPTIONS = [7, 30, 90];

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export default function Lateness() {
  const { t, lang, dark } = useApp();
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  const load = useCallback(async (days) => {
    setLoading(true);
    const from = daysAgoStr(days);
    const { data } = await fetchAllRows(() => supabase
      .from('attendance_records')
      .select('student_id, date, students(name_ar, name_en, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order))')
      .eq('period', 1)
      .eq('status', 'late')
      .gte('date', from));

    const byStudent = new Map();
    (data || []).forEach((r) => {
      if (!r.students) return;
      const existing = byStudent.get(r.student_id);
      if (existing) {
        existing.count += 1;
        if (r.date > existing.lastDate) existing.lastDate = r.date;
      } else {
        byStudent.set(r.student_id, { id: r.student_id, student: r.students, count: 1, lastDate: r.date });
      }
    });

    const list = Array.from(byStudent.values()).sort((a, b) => b.count - a.count);
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(rangeDays); }, [rangeDays, load]);

  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—');

  const repeated = rows.filter((r) => r.count >= REPEAT_THRESHOLD);
  const rest = rows.filter((r) => r.count < REPEAT_THRESHOLD);

  function Row({ r }) {
    const s = r.student;
    const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
    return (
      <li className="flex items-center gap-3 py-3">
        <div className="h-9 w-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 text-xs font-semibold">
          {initials(name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            {s.sections ? fmtSectionLabel(s.sections, lang) : '—'}
          </div>
        </div>
        <div className="text-end shrink-0">
          <div className="text-sm font-bold font-en" style={{ color: r.count >= REPEAT_THRESHOLD ? '#ee5d50' : undefined }}>{r.count}</div>
          <div className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.lastLateDate}: {fmtDate(r.lastDate)}</div>
        </div>
      </li>
    );
  }

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-3xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.latenessTitle}</h1>
              <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.latenessSub}</p>
            </div>
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              className={`text-sm rounded-lg px-3 py-2 border outline-none ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
            >
              {RANGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{t.latenessRangeLabel.replace('{n}', n)}</option>
              ))}
            </select>
          </motion.div>

          <div className={cardFloating(dark, 'p-5 mb-5')}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-rose-500" />
              <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.repeatedLatenessTitle}</h2>
            </div>
            {loading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
            ) : repeated.length === 0 ? (
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noLatenessRecords}</p>
            ) : (
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {repeated.map((r) => <Row key={r.id} r={r} />)}
              </ul>
            )}
          </div>

          <div className={cardFloating(dark, 'p-5')}>
            <div className="flex items-center gap-2 mb-3">
              <Clock3 size={16} className={dark ? 'text-royal-light' : 'text-royal'} />
              <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.allLatenessTitle}</h2>
            </div>
            {loading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
            ) : rest.length === 0 && repeated.length === 0 ? (
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noLatenessRecords}</p>
            ) : rest.length === 0 ? (
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>—</p>
            ) : (
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {rest.map((r) => <Row key={r.id} r={r} />)}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
