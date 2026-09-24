import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Layers, CheckCircle2, Flag, ClipboardCheck, Search } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { sectionLabel as fmtSectionLabel, sortSections } from '../lib/sections';
import { STATUS_META } from '../lib/status';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { deriveByStudentAndDate } from '../lib/attendanceDerive';
import { fetchAllRowsByIds } from '../lib/fetchAll';

const NEEDS_ATTENTION_WINDOW_DAYS = 14;
const NEEDS_ATTENTION_MIN_ABSENCES = 3;

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

export default function RecorderDashboard() {
  const { t, lang, dark, staff } = useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [sectionStats, setSectionStats] = useState({}); // section_id -> { total, recorded }
  const [todayRate, setTodayRate] = useState(null);
  const [needsAttention, setNeedsAttention] = useState([]);
  const [recentMine, setRecentMine] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const load = useCallback(async () => {
    if (!staff) return;
    setLoading(true);

    const { data: asg } = await supabase
      .from('staff_sections')
      .select('section_id, sections(id, grade_name, grade_name_en, section_name, stream, section_number, grade_order)')
      .eq('staff_id', staff.id);
    const mySections = sortSections((asg || []).map((a) => a.sections).filter(Boolean));
    setSections(mySections);

    const sectionIds = mySections.map((s) => s.id);
    if (sectionIds.length === 0) {
      setStudentTotal(0);
      setSectionStats({});
      setTodayRate(null);
      setNeedsAttention([]);
      setLoading(false);
      return;
    }

    const { data: studs } = await supabase
      .from('students')
      .select('id, name_ar, name_en, section_id')
      .in('section_id', sectionIds)
      .eq('is_active', true);
    const list = studs || [];
    setStudentTotal(list.length);

    const studentIds = list.map((s) => s.id);
    const today = todayStr();

    // 14 days × up to 8 periods per student is far past the 1000-row cap,
    // so both of these page through all rows instead of a single request
    const [{ data: todayRecs }, { data: rangeRecs }] = await Promise.all([
      fetchAllRowsByIds(studentIds, (chunk) => supabase.from('attendance_records')
        .select('id, student_id, date, status, period').eq('date', today).in('student_id', chunk).order('id')),
      fetchAllRowsByIds(studentIds, (chunk) => supabase.from('attendance_records')
        .select('id, student_id, date, status, period')
        .gte('date', daysAgoStr(NEEDS_ATTENTION_WINDOW_DAYS - 1)).lte('date', today).in('student_id', chunk).order('id')),
    ]);

    // today's per-section completion + overall rate
    const derivedToday = deriveByStudentAndDate(todayRecs || []);
    const stats = {};
    mySections.forEach((sec) => { stats[sec.id] = { total: 0, recorded: 0 }; });
    let decisiveCount = 0;
    let presentCount = 0;
    list.forEach((s) => {
      if (stats[s.section_id]) stats[s.section_id].total += 1;
      const info = derivedToday.get(s.id)?.get(today);
      if (info) {
        // "recorded" (data-entry progress) counts any period logged today,
        // even a day that's only partially entered so far.
        if (stats[s.section_id]) stats[s.section_id].recorded += 1;
        // The rate itself only counts days with a decisive verdict
        // (attendanceDerive.js returns status: null for a day that's too
        // partially recorded to call) — otherwise a still-in-progress day
        // would drag today's rate down before it's even finished.
        if (info.status != null) {
          decisiveCount += 1;
          if (info.status === 'present') presentCount += 1;
        }
      }
    });
    setSectionStats(stats);
    setTodayRate(decisiveCount > 0 ? Math.round((presentCount / decisiveCount) * 100) : null);

    // needs-attention: students with 3+ absent days in the last 14 days
    const derivedRange = deriveByStudentAndDate(rangeRecs || []);
    const flagged = list
      .map((s) => {
        const dayMap = derivedRange.get(s.id);
        if (!dayMap) return null;
        const absentCount = [...dayMap.values()].filter((d) => d.status === 'absent').length;
        return absentCount >= NEEDS_ATTENTION_MIN_ABSENCES ? { ...s, absentCount } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.absentCount - a.absentCount)
      .slice(0, 6);
    setNeedsAttention(flagged);

    setLoading(false);
  }, [staff]);

  const loadRecentMine = useCallback(async () => {
    if (!staff) return;
    setRecentLoading(true);
    const { data } = await supabase
      .from('attendance_records')
      .select('status, date, created_at, students(name_ar, name_en, sections(grade_name, grade_name_en, section_name, stream, section_number))')
      .eq('recorded_by', staff.id)
      .order('created_at', { ascending: false })
      .limit(6);
    setRecentMine(data || []);
    setRecentLoading(false);
  }, [staff]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRecentMine(); }, [loadRecentMine]);

  const kpiCards = [
    { label: t.myStudentsKpi, value: studentTotal, icon: Users, accent: dark ? 'bg-royal/20 text-royal-light' : 'bg-royal/10 text-royal' },
    { label: t.mySectionsKpi, value: sections.length, icon: Layers, accent: dark ? 'bg-gold/20 text-gold-light' : 'bg-gold/10 text-gold' },
    { label: t.todayAttendanceRateKpi, value: todayRate != null ? `${todayRate}%` : '—', icon: CheckCircle2, accent: dark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 text-emerald-600' },
    { label: t.needsAttentionKpi, value: needsAttention.length, icon: Flag, accent: dark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-500/10 text-rose-600' },
  ];

  const quickActions = [
    { to: '/attendance', label: t.qaRecordAttendance, icon: ClipboardCheck },
    { to: '/lookup', label: t.qaLookup, icon: Search },
  ];

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <main className="max-w-7xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>
              {t.recorderWelcome.replace('{name}', staff?.full_name || '')}
            </h1>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpiCards.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4 }}
                  className={`${cardFloating(dark)} p-6`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[15px] font-medium ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{item.label}</span>
                    <div className={`h-11 w-11 rounded-full flex items-center justify-center ${item.accent}`}>
                      <Icon size={19} />
                    </div>
                  </div>
                  {loading ? (
                    <div className={skeleton(dark, 'h-10 w-20 mt-3')} />
                  ) : (
                    <div className={`mt-3 text-4xl font-bold tracking-tight font-en ${dark ? 'text-white' : 'text-navy'}`}>{item.value}</div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* quick actions */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="flex flex-wrap gap-2.5 mb-6">
            {quickActions.map((qa) => {
              const Icon = qa.icon;
              return (
                <Link
                  key={qa.to}
                  to={qa.to}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-royal hover:bg-royal-light text-white transition-colors shadow-sm"
                >
                  <Icon size={16} /> {qa.label}
                </Link>
              );
            })}
          </motion.div>

          {/* my sections */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className={`${cardFloating(dark)} p-5 mb-6`}>
            <h2 className={`text-sm font-semibold mb-4 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.mySectionsTitle}</h2>
            {loading ? (
              <div className="grid sm:grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className={skeleton(dark, 'h-14 w-full')} />)}</div>
            ) : sections.length === 0 ? (
              <div className="text-center py-8">
                <p className={`text-sm font-medium ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{t.noSectionsAssignedTitle}</p>
                <p className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.noSectionsAssignedBody}</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {sections.map((sec) => {
                  const st = sectionStats[sec.id] || { total: 0, recorded: 0 };
                  const complete = st.total > 0 && st.recorded >= st.total;
                  return (
                    <div key={sec.id} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${dark ? 'bg-black/20' : 'bg-slate-50'}`}>
                      <div className="min-w-0">
                        <div className={`text-sm font-medium truncate ${dark ? 'text-slate-200' : 'text-slate-700'}`}>{fmtSectionLabel(sec, lang)}</div>
                        <div className={`text-[11px] mt-0.5 font-medium ${complete ? 'text-emerald-500' : (dark ? 'text-slate-200' : 'text-slate-400')}`}>
                          {complete ? t.recordedTodayBadge : t.notRecordedTodayBadge.replace('{n}', st.recorded).replace('{total}', st.total)}
                        </div>
                      </div>
                      <button
                        onClick={() => navigate('/attendance', { state: { sectionId: sec.id, grade: sec.grade_name, stream: sec.stream } })}
                        className={`shrink-0 text-xs font-medium px-3 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-white'}`}
                      >
                        {t.recordAttendanceBtn}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* recent entries I logged */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className={`${cardFloating(dark)} p-5`}>
              <h2 className={`text-sm font-semibold mb-4 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.myRecentEntriesTitle}</h2>
              <div className="space-y-1">
                {recentLoading ? (
                  [0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className={skeleton(dark, 'h-10 w-10 rounded-full flex-shrink-0')} />
                      <div className="flex-1 space-y-1.5">
                        <div className={skeleton(dark, 'h-3.5 w-2/3')} />
                        <div className={skeleton(dark, 'h-3 w-1/3')} />
                      </div>
                    </div>
                  ))
                ) : recentMine.length === 0 ? (
                  <div className={`text-sm py-4 ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.noRecentEntries}</div>
                ) : (
                  recentMine.map((r, i) => {
                    const s = r.students || {};
                    const meta = STATUS_META[r.status] || STATUS_META.present;
                    const Icon = meta.icon;
                    return (
                      <div key={i} className={`flex items-center gap-3 text-sm rounded-xl px-2 -mx-2 py-2.5 transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${dark ? 'bg-royal/15 text-royal-light' : 'bg-royal/10 text-royal'}`}>
                          {initials(s.name_ar)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate font-medium ${dark ? 'text-slate-100' : 'text-slate-800'}`}>{lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}</div>
                          <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{s.sections ? fmtSectionLabel(s.sections, lang) : '—'} · {r.date}</div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs font-medium shrink-0" style={{ color: meta.color }}>
                          <Icon size={13} /> {t[meta.key]}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>

            {/* needs attention */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${cardFloating(dark)} p-5`}>
              <h2 className={`text-sm font-semibold mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.needsAttentionTitle}</h2>
              <p className={`text-xs mb-4 ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.needsAttentionSub}</p>
              {loading ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className={skeleton(dark, 'h-11 w-full')} />)}</div>
              ) : needsAttention.length === 0 ? (
                <div className={`text-sm py-4 ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.noNeedsAttention}</div>
              ) : (
                <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {needsAttention.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      <div className="h-9 w-9 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 text-xs font-semibold">
                        {initials(s.name_ar)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium truncate ${dark ? 'text-slate-100' : 'text-slate-800'}`}>{lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}</div>
                      </div>
                      <span className="text-xs font-semibold text-rose-500 shrink-0">{t.absenceCountLabel.replace('{n}', s.absentCount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}
