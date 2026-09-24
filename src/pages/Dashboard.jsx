import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, GraduationCap, School as SchoolIcon, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts';
import { useApp } from '../lib/AppContext';
import { useDialogs } from '../lib/Dialogs';
import { sectionLabel as fmtSectionLabel } from '../lib/sections';
import { supabase } from '../lib/supabase';
import { STATUS_META } from '../lib/status';
import { cardFloating, skeleton } from '../lib/theme';
import { deriveByStudentAndDate } from '../lib/attendanceDerive';
import { CYCLE_KEYS, SUBJECT_KEYS } from '../lib/i18n';
import { staffCycles, staffSubjects, shownSubjects, namesOf } from '../lib/staffInfo';
import { fetchAllRows } from '../lib/fetchAll';
import TodaySummary from '../components/TodaySummary';
import BackupExport from '../components/BackupExport';
import ChipMultiSelect from '../components/ChipMultiSelect';
import SectionChecklistModal from '../components/SectionChecklistModal';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-royal/10 text-royal',
  'bg-gold/10 text-gold-deep',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
];

function CustomTooltip({ active, payload, label, dark }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg border ${dark ? 'bg-navy-soft border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
      <div className="font-medium">{label}</div>
      <div className="text-royal-light font-en">{payload[0].value}%</div>
    </div>
  );
}

export default function Dashboard() {
  const { t, lang, dark, staff } = useApp();
  const { notify } = useDialogs();
  const alertMsg = (m) => notify(m, 'error');
  const isAdmin = staff && staff.role === 'admin';
  // Staff management (approving registration requests, changing staff
  // roles) stays admin-only — "edari" (administrative) staff does NOT
  // inherit this, same as resetting attendance and linking staff to
  // sections (/staff-assignments).
  const canManageStaff = isAdmin;

  const [kpi, setKpi] = useState({ students: null, staffCount: null, sections: null });
  const [gradeData, setGradeData] = useState([]);
  const [recent, setRecent] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [chartType, setChartType] = useState('bar');
  const [roleChoice, setRoleChoice] = useState({});
  // sections picked for a pending teacher/supervisor while approving them
  const [allSections, setAllSections] = useState([]);
  const [sectionChoice, setSectionChoice] = useState({}); // staff id -> [section ids]
  const [sectionModalFor, setSectionModalFor] = useState(null); // pending request row

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const [s, st, sec] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('staff').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('sections').select('id', { count: 'exact', head: true }),
    ]);
    setKpi({ students: s.count, staffCount: st.count, sections: sec.count });
    setStatsLoading(false);
  }, []);

  const loadAbsenceRateChart = useCallback(async () => {
    setChartLoading(true);
    const days = [];
    const pad = (n) => String(n).padStart(2, '0');
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    // 7 days x up to 8 periods x every student is far past the 1000-row
    // response cap, so page through all rows instead of one request
    const { data: recs } = await fetchAllRows(() => supabase
      .from('attendance_records')
      .select('student_id, date, status, period')
      .gte('date', days[0])
      .lte('date', days[days.length - 1])
      .order('id'));

    // derive one status per student per day (see lib/attendanceDerive:
    // absent once 3+ periods are absent, present once all 8 periods are
    // recorded and that threshold wasn't hit, otherwise no verdict yet)
    // instead of counting raw per-period rows, which previously
    // over/under-counted whenever a student had more than one record for
    // the same day (per-period rows plus an override, or several periods)
    const derived = deriveByStudentAndDate(recs || []);
    const byDay = {};
    days.forEach((d) => { byDay[d] = { total: 0, absent: 0 }; });
    derived.forEach((dayMap) => {
      dayMap.forEach((info, date) => {
        if (!byDay[date]) return;
        // Skip days with no decisive verdict yet (attendanceDerive.js
        // returns status: null for a day that's too partially recorded to
        // call) — otherwise a still-in-progress day dilutes the %.
        if (info.status == null) return;
        byDay[date].total += 1;
        if (info.status === 'absent') byDay[date].absent += 1;
      });
    });
    const rows = days.map((d) => ({
      name: new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { weekday: 'short' }).format(new Date(`${d}T00:00:00`)),
      v: byDay[d].total > 0 ? Math.round((byDay[d].absent / byDay[d].total) * 100) : 0,
    }));
    setGradeData(rows);
    setChartLoading(false);
  }, [lang]);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    const { data } = await supabase
      .from('attendance_records')
      .select('status, date, created_at, students(name_ar, name_en, sections(grade_name, grade_name_en, section_name, stream, section_number))')
      .order('created_at', { ascending: false })
      .limit(5);
    setRecent(data || []);
    setRecentLoading(false);
  }, []);

  const loadRequests = useCallback(async () => {
    if (!canManageStaff) { setRequestsLoading(false); return; }
    setRequestsLoading(true);
    const [{ data }, { data: secs }] = await Promise.all([
      supabase
        .from('staff')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('sections').select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number'),
    ]);
    setRequests(data || []);
    setAllSections(secs || []);
    setRequestsLoading(false);
  }, [canManageStaff]);

  useEffect(() => {
    loadStats();
    loadAbsenceRateChart();
    loadRecent();
    loadRequests();
  }, [loadStats, loadAbsenceRateChart, loadRecent, loadRequests]);

  async function approve(id, role) {
    // the school may only ever have one admin account — block approving
    // someone as admin while another admin already exists, instead of
    // silently creating a second one.
    if (role === 'admin') {
      const { count } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', staff.school_id)
        .eq('role', 'admin')
        .eq('status', 'approved');
      if (count > 0) {
        alertMsg(lang === 'ar' ? 'يوجد أدمن واحد بالفعل في هذه المدرسة. لا يمكن تعيين أدمن آخر.' : 'This school already has an admin. You cannot assign another one.');
        return;
      }
    }
    const { error } = await supabase.from('staff').update({ status: 'approved', role }).eq('id', id);
    if (error) { alertMsg(lang === 'ar' ? 'تعذّرت الموافقة، حاول مرة أخرى.' : 'Could not approve. Please try again.'); return; }
    // link the sections chosen while approving, so a teacher can start
    // recording attendance right away instead of a second trip to
    // "Staff assignments"
    const chosen = sectionChoice[id] || [];
    if ((role === 'recorder' || role === 'supervisor') && chosen.length) {
      const { error: asgErr } = await supabase.from('staff_sections').insert(
        chosen.map((section_id) => ({ school_id: staff.school_id, staff_id: id, section_id }))
      );
      if (asgErr) {
        alertMsg(lang === 'ar'
          ? 'تمت الموافقة، لكن تعذّر ربط الشعب. اربطها من صفحة "ربط المعلمين بالصفوف".'
          : 'Approved, but the sections could not be linked. Link them from "Staff assignments".');
      }
    }
    setRequests((r) => r.filter((row) => row.id !== id));
    loadStats();
  }

  async function reject(id) {
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) { alertMsg(lang === 'ar' ? 'تعذّر الرفض، حاول مرة أخرى.' : 'Could not reject. Please try again.'); return; }
    setRequests((r) => r.filter((row) => row.id !== id));
  }

  const kpiCards = [
    { label: t.totalStudents, value: kpi.students, icon: GraduationCap, hint: lang === 'ar' ? 'مسجّلون في النظام' : 'enrolled in the system', accent: dark ? 'bg-royal/20 text-royal-light' : 'bg-royal/10 text-royal' },
    { label: t.staffMembers, value: kpi.staffCount, icon: Users, hint: lang === 'ar' ? 'حسابات معتمدة' : 'approved accounts', accent: dark ? 'bg-gold/20 text-gold-light' : 'bg-gold/10 text-gold' },
    { label: t.sections, value: kpi.sections, icon: SchoolIcon, hint: lang === 'ar' ? 'صف دراسي نشط' : 'active sections', accent: dark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-500/10 text-emerald-600' },
    ...(canManageStaff ? [{ label: t.pendingReq, value: requests.length, icon: Clock, hint: lang === 'ar' ? 'بانتظار المراجعة' : 'awaiting review', accent: dark ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-500/10 text-rose-600' }] : []),
  ];

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-navy text-slate-200' : 'bg-slate-100 text-slate-800'}`}>

        <main className="max-w-7xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.dashboard}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.overview}</p>
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
                  {statsLoading ? (
                    <div className={skeleton(dark, 'h-10 w-28 mt-3')} />
                  ) : (
                    <div className={`mt-3 text-4xl font-bold tracking-tight font-en ${dark ? 'text-white' : 'text-navy'}`}>
                      {item.value != null ? item.value.toLocaleString('en-US') : '—'}
                    </div>
                  )}
                  <div className={`mt-2 text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{item.hint}</div>
                </motion.div>
              );
            })}
          </div>

          {(isAdmin || staff?.role === 'edari') && <TodaySummary t={t} lang={lang} dark={dark} />}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className={`lg:col-span-3 ${cardFloating(dark)} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.gradeTitle}</h2>
                  <p className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.gradeSub}</p>
                </div>
                <div className={`flex items-center rounded-full p-1 ${dark ? 'bg-black/20' : 'bg-slate-100'}`}>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${chartType === 'bar' ? (dark ? 'bg-navy-soft text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : (dark ? 'text-slate-200' : 'text-slate-500')}`}
                  >
                    {lang === 'ar' ? 'أعمدة بيانية' : 'Bar'}
                  </button>
                  <button
                    onClick={() => setChartType('area')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${chartType === 'area' ? (dark ? 'bg-navy-soft text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : (dark ? 'text-slate-200' : 'text-slate-500')}`}
                  >
                    {lang === 'ar' ? 'مخطط خطي' : 'Line'}
                  </button>
                </div>
              </div>
              {chartLoading ? (
                <div className={skeleton(dark, 'h-[280px] w-full')} />
              ) : gradeData.length > 0 ? (
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={300}>
                    {chartType === 'bar' ? (
                      <BarChart data={gradeData} margin={{ left: 0, right: 8, top: 26, bottom: 0 }}>
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563EB" />
                            <stop offset="100%" stopColor="#93C5FD" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#47556980' : '#E2E8F0'} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: dark ? '#CBD5E1' : '#475569' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, (max) => Math.max(10, Math.ceil((max * 1.3) / 5) * 5)]} allowDecimals={false} tickFormatter={(v) => v + '%'} tick={{ fontSize: 12, fill: dark ? '#CBD5E1' : '#475569' }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip content={<CustomTooltip dark={dark} />} cursor={{ fill: dark ? '#ffffff10' : '#0000000a' }} />
                        <Bar dataKey="v" fill="url(#barGradient)" radius={[8, 8, 0, 0]} maxBarSize={48}>
                          <LabelList dataKey="v" position="top" formatter={(v) => v + '%'} style={{ fontSize: 13, fontWeight: 700, fill: dark ? '#F1F5F9' : '#0F172A' }} />
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart data={gradeData} margin={{ left: 0, right: 16, top: 26, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#47556980' : '#E2E8F0'} vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: dark ? '#CBD5E1' : '#475569' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, (max) => Math.max(10, Math.ceil((max * 1.3) / 5) * 5)]} allowDecimals={false} tickFormatter={(v) => v + '%'} tick={{ fontSize: 12, fill: dark ? '#CBD5E1' : '#475569' }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip content={<CustomTooltip dark={dark} />} />
                        <Area type="monotone" dataKey="v" stroke="#2563EB" strokeWidth={2.5} fill="url(#areaGradient)" dot={{ r: 4, fill: '#2563EB', strokeWidth: 0 }} activeDot={{ r: 6 }}>
                          <LabelList dataKey="v" position="top" offset={10} formatter={(v) => v + '%'} style={{ fontSize: 13, fontWeight: 700, fill: dark ? '#F1F5F9' : '#0F172A' }} />
                        </Area>
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className={`text-sm text-center py-16 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>—</div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className={`lg:col-span-2 ${cardFloating(dark)} p-5`}>
              <div className="mb-4">
                <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.recentStudentsTitle}</h2>
              </div>
              <div className="space-y-1">
                {recentLoading ? (
                  [0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className={skeleton(dark, 'h-10 w-10 rounded-full flex-shrink-0')} />
                      <div className="flex-1 space-y-1.5">
                        <div className={skeleton(dark, 'h-3.5 w-2/3')} />
                        <div className={skeleton(dark, 'h-3 w-1/3')} />
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    {recent.map((r, i) => {
                      const s = r.students || {};
                      const meta = STATUS_META[r.status] || STATUS_META.present;
                      const Icon = meta.icon;
                      return (
                        <div key={i} className={`flex items-center gap-3 text-sm rounded-xl px-2 -mx-2 py-2.5 transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                            {initials(s.name_ar)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate font-medium ${dark ? 'text-slate-100' : 'text-slate-800'}`}>{lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}</div>
                            <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                              {s.sections ? fmtSectionLabel(s.sections, lang) : '—'} · {r.date}
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium shrink-0" style={{ color: meta.color }}>
                            <Icon size={13} /> {t[meta.key]}
                          </span>
                        </div>
                      );
                    })}
                    {recent.length === 0 && <div className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>—</div>}
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {canManageStaff && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}
              className={`${cardFloating(dark)} p-5`}>
              <div className="mb-4">
                <h2 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{t.requestsTitle}</h2>
                <p className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.requestsSub}</p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                    <th className="text-start font-medium pb-3">{t.thName}</th>
                    <th className="text-start font-medium pb-3 hidden sm:table-cell">{t.thEmail}</th>
                    <th className="text-start font-medium pb-3 hidden md:table-cell">{t.thDate}</th>
                    <th className="text-start font-medium pb-3 hidden lg:table-cell">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="text-end font-medium pb-3">{t.thAction}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                  {requestsLoading ? (
                    [0, 1].map((i) => (
                      <tr key={i}>
                        <td className="py-3.5" colSpan={5}>
                          <div className="flex items-center gap-2.5">
                            <div className={skeleton(dark, 'h-8 w-8 rounded-full flex-shrink-0')} />
                            <div className={skeleton(dark, 'h-3.5 w-40')} />
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <AnimatePresence>
                      {requests.map((r) => (
                        <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 20 }}
                          className={`transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50/70'}`}>
                          <td className="py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${dark ? 'bg-royal/15 text-royal-light' : 'bg-royal/10 text-royal'}`}>
                                {initials(r.full_name)}
                              </div>
                              <div className="min-w-0">
                                <div className={`font-medium ${dark ? 'text-slate-100' : 'text-slate-800'}`}>{r.full_name}</div>
                                {(staffCycles(r).length > 0 || staffSubjects(r).length > 0) && (
                                  <div className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                                    {[namesOf(staffCycles(r), t.cycleNames, lang), namesOf(staffSubjects(r), t.subjectNames, lang)].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`py-3.5 font-en hidden sm:table-cell ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{r.email}</td>
                          <td className={`py-3.5 font-en hidden md:table-cell ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                            {r.created_at ? new Date(r.created_at).toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-US') : '—'}
                          </td>
                          <td className="py-3.5 hidden lg:table-cell">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${dark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                              {lang === 'ar' ? 'قيد الانتظار' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3.5">
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                              <select
                                value={roleChoice[r.id] || 'recorder'}
                                onChange={(e) => setRoleChoice((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                className={`text-xs rounded-full px-2.5 py-2 outline-none ${dark ? 'bg-navy border border-slate-700 text-slate-300' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}
                              >
                                <option value="recorder">{t.roleNames.recorder}</option>
                                <option value="supervisor">{t.roleNames.supervisor}</option>
                                <option value="edari">{t.roleNames.edari}</option>
                                <option value="admin">{t.roleNames.admin}</option>
                              </select>
                              {['recorder', 'supervisor'].includes(roleChoice[r.id] || 'recorder') && (
                                <button
                                  onClick={() => setSectionModalFor(r)}
                                  className={`rounded-full px-3.5 py-2 text-xs font-semibold border whitespace-nowrap ${dark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                                >
                                  {t.chooseSectionsBtn.replace('{n}', (sectionChoice[r.id] || []).length)}
                                </button>
                              )}
                              <button
                                onClick={() => approve(r.id, roleChoice[r.id] || 'recorder')}
                                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-amber-600 hover:-translate-y-0.5"
                              >
                                {t.accept}
                              </button>
                              <button
                                onClick={() => reject(r.id)}
                                className="rounded-full bg-slate-800 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-slate-900 hover:-translate-y-0.5"
                              >
                                {t.reject}
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
              {!requestsLoading && requests.length === 0 && (
                <div className={`text-center py-8 text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noRequests}</div>
              )}
            </motion.div>
          )}

          {sectionModalFor && (
            <SectionChecklistModal
              title={sectionModalFor.full_name}
              hint={t.approveSectionsHint}
              sections={allSections}
              initial={sectionChoice[sectionModalFor.id] || []}
              cycles={staffCycles(sectionModalFor)}
              t={t}
              lang={lang}
              dark={dark}
              onClose={() => setSectionModalFor(null)}
              onDone={(ids) => { setSectionChoice((m) => ({ ...m, [sectionModalFor.id]: ids })); setSectionModalFor(null); }}
            />
          )}

          {canManageStaff && <StaffManagement t={t} lang={lang} dark={dark} currentStaffId={staff.id} schoolId={staff.school_id} />}

          {isAdmin && <BackupExport t={t} lang={lang} dark={dark} />}
          {isAdmin && <ResetAttendanceZone t={t} lang={lang} dark={dark} school_id={staff.school_id} />}
        </main>
      </div>
    </div>
  );
}

function StaffManagement({ t, lang, dark, currentStaffId, schoolId }) {
  const { notify } = useDialogs();
  const alertMsg = (m) => notify(m, 'error');
  const [staffList, setStaffList] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('staff')
      .select('*')
      .in('status', ['approved', 'revoked'])
      .order('full_name', { ascending: true });
    setStaffList(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const staffSaveError = () => alertMsg(lang === 'ar' ? 'تعذّر الحفظ، حاول مرة أخرى.' : 'Could not save. Please try again.');

  const changeRole = async (id, role) => {
    // the school may only ever have one admin account.
    if (role === 'admin') {
      const { count } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('role', 'admin')
        .eq('status', 'approved');
      if (count > 0) {
        alertMsg(lang === 'ar' ? 'يوجد أدمن واحد بالفعل في هذه المدرسة. لا يمكن تعيين أدمن آخر.' : 'This school already has an admin. You cannot assign another one.');
        return;
      }
    }
    setSavingId(id);
    const { error } = await supabase.from('staff').update({ role }).eq('id', id);
    setSavingId(null);
    if (error) { console.error('changeRole error:', error); staffSaveError(); return; }
    load();
  };

  // cycles/subjects editor for one staff member (lists — a teacher can have
  // several of each). Subjects are only edited for teachers; for other roles
  // they're kept untouched (hidden) in case the person goes back to teaching.
  const [editing, setEditing] = useState(null); // { id, role, cycles, subjects }

  const saveCyclesSubjects = async () => {
    if (!editing) return;
    setSavingId(editing.id);
    const payload = { cycles: editing.cycles, cycle: editing.cycles[0] || null };
    if (editing.role === 'recorder') {
      payload.subjects = editing.subjects;
      payload.subject = editing.subjects[0] || null;
    }
    const { error } = await supabase.from('staff').update(payload).eq('id', editing.id);
    setSavingId(null);
    if (error) { console.error('saveCyclesSubjects error:', error); staffSaveError(); return; }
    setEditing(null);
    load();
  };

  const revoke = async (id) => {
    setSavingId(id);
    const { error } = await supabase.from('staff').update({ status: 'revoked' }).eq('id', id);
    setSavingId(null);
    setConfirmRevokeId(null);
    if (error) { console.error('revoke error:', error); staffSaveError(); return; }
    load();
  };

  const restore = async (id) => {
    setSavingId(id);
    const { error } = await supabase.from('staff').update({ status: 'approved' }).eq('id', id);
    setSavingId(null);
    if (error) { console.error('restore error:', error); staffSaveError(); return; }
    load();
  };

  return (
    <div className={cardFloating(dark, 'p-5 mt-6')}>
      <h3 className="text-sm font-semibold mb-4">{t.staffManagementTitle}</h3>

      {staffList === null ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className={skeleton(dark, 'h-11 w-full')} />)}</div>
      ) : staffList.length === 0 ? (
        <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noStaffYet}</p>
      ) : (
        <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
          {staffList.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex-1 min-w-[140px]">
                <div className="text-sm font-medium flex items-center gap-2">
                  {s.full_name}
                  {s.id === currentStaffId && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dark ? 'bg-royal/20 text-royal-light' : 'bg-royal/10 text-royal'}`}>{t.thatsYou}</span>
                  )}
                  {s.status === 'revoked' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500">{t.revokedBadge}</span>
                  )}
                </div>
                <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{s.email}</div>
              </div>

              {s.status === 'approved' ? (
                <>
                  <select
                    value={s.role || ''}
                    onChange={(e) => changeRole(s.id, e.target.value)}
                    disabled={savingId === s.id || s.id === currentStaffId}
                    className={`text-xs rounded-lg px-2.5 py-2 border outline-none disabled:opacity-50 ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                  >
                    <option value="recorder">{t.roleNames.recorder}</option>
                    <option value="supervisor">{t.roleNames.supervisor}</option>
                    <option value="edari">{t.roleNames.edari}</option>
                    <option value="admin">{t.roleNames.admin}</option>
                  </select>

                  <button
                    onClick={() => setEditing({ id: s.id, name: s.full_name, role: s.role, cycles: staffCycles(s), subjects: staffSubjects(s) })}
                    disabled={savingId === s.id}
                    className={`text-xs rounded-lg px-2.5 py-2 border text-start max-w-[260px] disabled:opacity-50 ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                  >
                    {[
                      staffCycles(s).length ? namesOf(staffCycles(s), t.cycleNames, lang) : t.noCyclesChosen,
                      shownSubjects(s).length ? namesOf(shownSubjects(s), t.subjectNames, lang) : null,
                    ].filter(Boolean).join(' · ')}
                  </button>

                  {s.id !== currentStaffId && (
                    confirmRevokeId === s.id ? (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => revoke(s.id)} className="text-xs font-medium px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white">
                          {t.confirmYesDelete}
                        </button>
                        <button onClick={() => setConfirmRevokeId(null)} className={`text-xs font-medium px-3 py-2 rounded-lg border ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                          {t.cancel}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRevokeId(s.id)}
                        className={`text-xs font-medium px-3 py-2 rounded-lg ${dark ? 'text-rose-400 hover:bg-rose-500/10' : 'text-rose-500 hover:bg-rose-50'}`}
                      >
                        {t.revokeAccess}
                      </button>
                    )
                  )}
                </>
              ) : (
                <button
                  onClick={() => restore(s.id)}
                  disabled={savingId === s.id}
                  className="text-xs font-medium px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-60"
                >
                  {t.restoreAccess}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className={`w-full max-w-md rounded-2xl p-5 space-y-4 ${dark ? 'bg-navy-soft border border-slate-700' : 'bg-white border border-slate-100'}`}>
            <h3 className="text-base font-semibold">{editing.name} — {t.editCyclesSubjects}</h3>
            <div>
              <div className={`text-xs font-medium mb-2 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t.cyclesShort}</div>
              <ChipMultiSelect
                dark={dark}
                options={CYCLE_KEYS.map((k) => ({ value: k, label: t.cycleNames[k] }))}
                value={editing.cycles}
                onChange={(v) => setEditing((e) => ({ ...e, cycles: v }))}
              />
            </div>
            {editing.role === 'recorder' && (
              <div>
                <div className={`text-xs font-medium mb-2 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t.subjectsShort}</div>
                <ChipMultiSelect
                  dark={dark}
                  options={SUBJECT_KEYS.map((k) => ({ value: k, label: t.subjectNames[k] }))}
                  value={editing.subjects}
                  onChange={(v) => setEditing((e) => ({ ...e, subjects: v }))}
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(null)} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                {t.cancel}
              </button>
              <button onClick={saveCyclesSubjects} disabled={savingId === editing.id} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white disabled:opacity-60">
                {savingId === editing.id && <Loader2 size={14} className="animate-spin" />} {t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResetAttendanceZone({ t, lang, dark, school_id }) {  const [confirmText, setConfirmText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const CONFIRM_WORD = lang === 'ar' ? 'حذف الكل' : 'DELETE ALL';

  const runReset = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('attendance_records').delete().eq('school_id', school_id);
    setBusy(false);
    setConfirming(false);
    setConfirmText('');
    if (error) {
      setMsg({ type: 'err', text: t.saveError });
    } else {
      setMsg({ type: 'ok', text: t.resetDone });
    }
  };

  return (
    <div className={cardFloating(dark, 'p-5 mt-6 border-2 border-dashed border-rose-300 dark:border-rose-900')}>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} className="text-rose-500" />
        <h3 className="text-sm font-semibold text-rose-500">{t.resetAttendanceTitle}</h3>
      </div>
      <p className={`text-xs mb-3 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.resetAttendanceSub}</p>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="text-sm font-medium px-4 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors"
        >
          {t.resetAttendanceBtn}
        </button>
      ) : (
        <div className={`rounded-lg p-3.5 ${dark ? 'bg-rose-500/10' : 'bg-rose-50'}`}>
          <p className="text-sm font-medium text-rose-600 mb-2">{t.resetConfirmWarning}</p>
          <p className={`text-xs mb-2 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
            {t.typeToConfirm.replace('{word}', CONFIRM_WORD)}
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className={`w-full sm:w-64 rounded-lg px-3 py-2 text-sm outline-none border mb-3 ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
          />
          <div className="flex gap-2">
            <button
              onClick={runReset}
              disabled={confirmText !== CONFIRM_WORD || busy}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-40"
            >
              {busy && <Loader2 size={14} className="animate-spin" />} {t.confirmYesDelete}
            </button>
            <button onClick={() => { setConfirming(false); setConfirmText(''); }} className={`text-sm font-medium px-4 py-2 rounded-lg border ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {msg && <p className={`text-xs mt-2 ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{msg.text}</p>}
    </div>
  );
}
