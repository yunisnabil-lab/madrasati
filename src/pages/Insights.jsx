import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, MessageCircle, Download, ShieldAlert, Loader2, Printer } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { fetchAllRows } from '../lib/fetchAll';
import { sortSections, sectionLabel as fmtSectionLabel } from '../lib/sections';
import { exportXlsx } from '../lib/exportXlsx';
import { printWithTitle, reportName, rangeLabel } from '../lib/print';
import { PrintSheet, PrintHeading, PrintTable } from '../components/PrintSheet';
import EmptyState from '../components/EmptyState';
import BulkContactModal from '../components/BulkContactModal';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => fmt(new Date());
const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d); };
const monthStr = () => todayStr().slice(0, 7);
const monthYears = Array.from({ length: Number(todayStr().slice(0, 4)) - 2024 }, (_, i) => String(2025 + i));
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = fmt(new Date(y, m, 0));
  const today = todayStr();
  return { from: `${ym}-01`, to: last > today ? today : last };
}

// Two tools built on the same numbers (attendance is summed inside the
// database by student_attendance_summary): an early-warning list of students
// worth a look, and a per-section monthly report for the principal.
export default function Insights() {
  const { t, lang, dark, staff } = useApp();
  const canContact = staff && ['admin', 'supervisor', 'edari'].includes(staff.role);

  const [tab, setTab] = useState('warning');
  const [from, setFrom] = useState(daysAgoStr(30));
  const [to, setTo] = useState(todayStr());
  const [threshold, setThreshold] = useState(3);
  const [month, setMonth] = useState(monthStr());

  const range = tab === 'monthly' ? monthRange(month) : { from, to };

  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState({});
  const [violations, setViolations] = useState([]);
  const [lateness, setLateness] = useState([]);

  const [picked, setPicked] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    if (!staff || !range.from || !range.to || range.from > range.to) return;
    setLoading(true);
    setMissing(false);
    const secRes = await supabase
      .from('sections')
      .select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
    let secs = secRes.data || [];
    if (staff.role === 'supervisor' || staff.role === 'edari') {
      const { data: assigned } = await supabase.from('staff_sections').select('section_id').eq('staff_id', staff.id);
      const allowed = new Set((assigned || []).map((a) => a.section_id));
      secs = secs.filter((s) => allowed.has(s.id));
    }
    const [studRes, sumRes, vioRes, latRes] = await Promise.all([
      fetchAllRows(() => supabase.from('students').select('id, name_ar, name_en, section_id').eq('is_active', true).order('id')),
      supabase.rpc('student_attendance_summary', { p_from: range.from, p_to: range.to }),
      fetchAllRows(() => supabase.from('behavior_violations').select('id, student_id, violation_type').eq('status', 'approved').gte('date', range.from).lte('date', range.to).order('id')),
      fetchAllRows(() => supabase.from('morning_lateness').select('id, student_id').gte('date', range.from).lte('date', range.to).order('id')),
    ]);
    if (sumRes.error) {
      setMissing(true);
      setLoading(false);
      return;
    }
    const secIds = new Set(secs.map((s) => s.id));
    const studs = (studRes.data || []).filter((s) => secIds.has(s.section_id));
    const studIds = new Set(studs.map((s) => s.id));
    const bySt = {};
    (sumRes.data || []).forEach((r) => { if (studIds.has(r.student_id)) bySt[r.student_id] = r; });
    setSections(sortSections(secs));
    setStudents(studs);
    setSummary(bySt);
    setViolations((vioRes.data || []).filter((v) => studIds.has(v.student_id)));
    setLateness((latRes.data || []).filter((l) => studIds.has(l.student_id)));
    setPicked(new Set());
    setLoading(false);
  }, [staff, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const sectionMap = useMemo(() => {
    const m = {};
    sections.forEach((s) => { m[s.id] = s; });
    return m;
  }, [sections]);

  const vioByStudent = useMemo(() => {
    const m = {};
    violations.forEach((v) => { m[v.student_id] = (m[v.student_id] || 0) + 1; });
    return m;
  }, [violations]);
  const latByStudent = useMemo(() => {
    const m = {};
    lateness.forEach((l) => { m[l.student_id] = (m[l.student_id] || 0) + 1; });
    return m;
  }, [lateness]);

  // ---------- early warning ----------
  const warnList = useMemo(() => {
    const min = Math.max(1, Number(threshold) || 1);
    return students
      .map((s) => ({
        ...s,
        absent: summary[s.id]?.absent_days || 0,
        vio: vioByStudent[s.id] || 0,
        late: latByStudent[s.id] || 0,
      }))
      .filter((s) => s.absent >= min || s.vio >= 3)
      .sort((a, b) => b.absent - a.absent || b.vio - a.vio || (a.name_ar || '').localeCompare(b.name_ar || '', 'ar'));
  }, [students, summary, vioByStudent, latByStudent, threshold]);

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allPicked = warnList.length > 0 && picked.size === warnList.length;
  const pickedStudents = warnList
    .filter((s) => picked.has(s.id))
    .map((s) => ({
      id: s.id,
      name: lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar),
      sectionLabel: sectionMap[s.section_id] ? fmtSectionLabel(sectionMap[s.section_id], lang) : '',
    }));

  // ---------- monthly report ----------
  const monthly = useMemo(() => {
    const rows = sections.map((sec) => {
      const studs = students.filter((s) => s.section_id === sec.id);
      let present = 0; let absent = 0; let latePeriods = 0; let vio = 0; let lat = 0;
      studs.forEach((s) => {
        const r = summary[s.id];
        if (r) { present += r.present_days; absent += r.absent_days; latePeriods += r.late_periods; }
        vio += vioByStudent[s.id] || 0;
        lat += latByStudent[s.id] || 0;
      });
      const rate = present + absent > 0 ? (present / (present + absent)) * 100 : null;
      return { sec, count: studs.length, present, absent, latePeriods, vio, lat, rate };
    }).filter((r) => r.count > 0);
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    const present = sum('present'); const absent = sum('absent');
    return {
      rows,
      total: {
        count: sum('count'), absent, latePeriods: sum('latePeriods'), vio: sum('vio'), lat: sum('lat'),
        rate: present + absent > 0 ? (present / (present + absent)) * 100 : null,
      },
    };
  }, [sections, students, summary, vioByStudent, latByStudent]);

  const byType = useMemo(() => {
    const m = {};
    violations.forEach((v) => { m[v.violation_type] = (m[v.violation_type] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [violations]);

  const exportMonth = () => {
    const ar = lang === 'ar';
    const rows = [
      [ar ? 'الصف والشعبة' : 'Grade & section', ar ? 'الطلاب' : 'Students', ar ? 'نسبة الحضور %' : 'Attendance %', ar ? 'أيام الغياب' : 'Absent days', ar ? 'حصص التأخر' : 'Late periods', ar ? 'المخالفات' : 'Violations', ar ? 'التأخر الصباحي' : 'Morning lateness'],
      ...monthly.rows.map((r) => [fmtSectionLabel(r.sec, lang), r.count, r.rate == null ? '' : Number(r.rate.toFixed(1)), r.absent, r.latePeriods, r.vio, r.lat]),
      [ar ? 'الإجمالي' : 'Total', monthly.total.count, monthly.total.rate == null ? '' : Number(monthly.total.rate.toFixed(1)), monthly.total.absent, monthly.total.latePeriods, monthly.total.vio, monthly.total.lat],
    ];
    exportXlsx(`${reportName(t.monthlyReportTitle, monthTitle)}.xlsx`, rows, { lang, sheetName: month });
  };

  // printed / PDF versions (components/PrintSheet.jsx)
  const monthName = (i) => new Date(2026, i, 1).toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { month: 'long' });
  const pickMonth = (y, m) => { const ym = `${y}-${m}`; setMonth(ym > monthStr() ? monthStr() : ym); };
  const monthTitle = new Date(`${month}-01T00:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric' });
  const printTitle = tab === 'monthly'
    ? reportName(t.monthlyReportTitle, monthTitle)
    : reportName(t.warnTitle, rangeLabel(lang, from, to));
  const nameOf = (s) => (lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar));
  const printSheet = loading || missing ? null : tab === 'monthly' ? (
    monthly.rows.length === 0 ? null : (
      <PrintSheet
        t={t} lang={lang}
        title={`${t.monthlyReportTitle} — ${monthTitle}`}
        stats={[
          { label: t.mStudents, value: monthly.total.count, color: '#0f1b3c' },
          { label: t.mAttendanceRate, value: monthly.total.rate == null ? '—' : `${monthly.total.rate.toFixed(1)}%`, color: '#05cd99' },
          { label: t.mAbsentDays, value: monthly.total.absent, color: '#ee5d50' },
          { label: t.mViolations, value: monthly.total.vio, color: '#ffb800' },
          { label: t.mLateness, value: monthly.total.lat, color: '#8b5cf6' },
        ]}
        signatures={[t.signPreparedBy, t.signApprovedBy]}
      >
        <PrintHeading>{t.mBySection}</PrintHeading>
        <PrintTable
          columns={[
            { label: t.colGradeSection, render: (r) => fmtSectionLabel(r.sec, lang) },
            { label: t.mStudents, align: 'center', width: '52px', render: (r) => r.count },
            { label: t.mAttendanceRate, align: 'center', width: '64px', render: (r) => (r.rate == null ? '—' : `${r.rate.toFixed(1)}%`) },
            { label: t.mAbsentDays, align: 'center', width: '58px', render: (r) => r.absent },
            { label: t.mLatePeriods, align: 'center', width: '58px', render: (r) => r.latePeriods },
            { label: t.mViolations, align: 'center', width: '58px', render: (r) => r.vio },
            { label: t.mLateness, align: 'center', width: '64px', render: (r) => r.lat },
          ]}
          groups={[{ rows: monthly.rows.map((r) => ({ ...r, id: r.sec.id })) }]}
        />
        {byType.length > 0 && (
          <>
            <PrintHeading>{t.mByType}</PrintHeading>
            <PrintTable
              columns={[
                { label: t.colIncidentType, render: (r) => t.violationTypeNames[r.type] || r.type },
                { label: t.mViolations, align: 'center', width: '80px', render: (r) => r.n },
              ]}
              groups={[{ rows: byType.map(([type, n]) => ({ id: type, type, n })) }]}
            />
          </>
        )}
      </PrintSheet>
    )
  ) : (
    warnList.length === 0 ? null : (
      <PrintSheet
        t={t} lang={lang}
        title={t.warnTitle}
        meta={[[t.fromDate, from], [t.toDate, to], [t.warnThreshold, String(Math.max(1, Number(threshold) || 1))]]}
        stats={[
          { label: t.statStudentsCount, value: warnList.length, color: '#0f1b3c' },
          { label: t.warnAbsent, value: warnList.reduce((n, s) => n + s.absent, 0), color: '#ee5d50' },
          { label: t.warnViolations, value: warnList.reduce((n, s) => n + s.vio, 0), color: '#ffb800' },
          { label: t.warnLate, value: warnList.reduce((n, s) => n + s.late, 0), color: '#8b5cf6' },
        ]}
        signatures={[t.signPreparedBy, t.signApprovedBy]}
      >
        <PrintTable
          columns={[
            { label: t.colStudentName, render: (s) => nameOf(s) },
            { label: t.colSection, render: (s) => (sectionMap[s.section_id] ? fmtSectionLabel(sectionMap[s.section_id], lang) : '—') },
            { label: t.warnAbsent, align: 'center', width: '56px', render: (s) => s.absent },
            { label: t.warnViolations, align: 'center', width: '56px', render: (s) => s.vio },
            { label: t.warnLate, align: 'center', width: '56px', render: (s) => s.late },
          ]}
          groups={[{ rows: warnList }]}
        />
      </PrintSheet>
    )
  );

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border font-en ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`;
  const lbl = `block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`;
  const muted = dark ? 'text-slate-300' : 'text-slate-500';
  const rateCls = (r) => (r == null ? muted : r >= 90 ? 'text-emerald-500' : r >= 75 ? 'text-amber-500' : 'text-rose-500');
  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === id ? 'bg-royal text-white' : (dark ? 'text-slate-200 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100')}`}
    >
      {label}
    </button>
  );

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`print:hidden min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.insightsTitle}</h1>
            <p className={`text-sm mt-1 ${muted}`}>{t.insightsSub}</p>
          </motion.div>

          <div className="flex gap-2 mb-5">
            {tabBtn('warning', t.tabWarning)}
            {tabBtn('monthly', t.tabMonthly)}
          </div>

          <div className={cardFloating(dark, 'p-4 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:items-end')}>
            {tab === 'warning' ? (
              <>
                <div>
                  <label className={lbl}>{t.fromDate}</label>
                  <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={lbl}>{t.toDate}</label>
                  <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={lbl}>{t.warnThreshold}</label>
                  <input type="number" min="1" max="60" value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputCls} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={lbl}>{t.monthLabel}</label>
                  <div className="flex gap-2">
                    <select value={month.slice(5)} onChange={(e) => pickMonth(month.slice(0, 4), e.target.value)} className={inputCls}>
                      {Array.from({ length: 12 }, (_, i) => {
                        const mm = pad(i + 1);
                        return <option key={mm} value={mm} disabled={`${month.slice(0, 4)}-${mm}` > monthStr()}>{monthName(i)}</option>;
                      })}
                    </select>
                    <select value={month.slice(0, 4)} onChange={(e) => pickMonth(e.target.value, month.slice(5))} className={inputCls}>
                      {monthYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <div className="sm:col-span-2 sm:text-end">
                  <button
                    onClick={exportMonth}
                    disabled={loading || monthly.rows.length === 0}
                    className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border disabled:opacity-60 ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <Download size={15} /> {t.monthExport}
                  </button>
                  <button
                    onClick={() => printWithTitle(printTitle)}
                    disabled={loading || monthly.rows.length === 0}
                    className={`ms-2 inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border disabled:opacity-60 ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <Printer size={15} /> {t.printThisTab}
                  </button>
                </div>
              </>
            )}
          </div>

          {missing ? (
            <div className={cardFloating(dark, 'p-5')}>
              <EmptyState icon={ShieldAlert} text={t.insightsMissing} hint={t.insightsMissingHint} dark={dark} compact />
            </div>
          ) : tab === 'warning' ? (
            <div className={cardFloating(dark, 'p-5')}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h2 className={`text-sm font-semibold flex items-center gap-2 ${dark ? 'text-white' : 'text-slate-900'}`}>
                  <ShieldAlert size={16} className="text-amber-500" /> {t.warnTitle}
                  {!loading && <span className={`text-xs font-normal ${muted}`}>({warnList.length})</span>}
                </h2>
                <div className="flex items-center gap-2">
                {warnList.length > 0 && (
                  <button
                    onClick={() => printWithTitle(printTitle)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <Printer size={13} /> {t.printThisTab}
                  </button>
                )}
                {canContact && warnList.length > 0 && (
                  <button
                    onClick={() => setPicked(allPicked ? new Set() : new Set(warnList.map((s) => s.id)))}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    {allPicked ? t.recClearAll : t.recSelectAll}
                  </button>
                )}
                </div>
              </div>
              <p className={`text-xs mb-3 ${muted}`}>{t.warnHint.replace('{n}', Math.max(1, Number(threshold) || 1))}</p>
              {loading ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
              ) : warnList.length === 0 ? (
                <EmptyState icon={Check} text={t.warnNone} dark={dark} compact />
              ) : (
                <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {warnList.map((s) => {
                    const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                    const on = picked.has(s.id);
                    const Row = canContact ? 'button' : 'div';
                    return (
                      <li key={s.id}>
                        <Row
                          {...(canContact ? { onClick: () => toggle(s.id), type: 'button' } : {})}
                          className={`w-full flex items-center gap-3 py-3 text-start ${canContact ? (dark ? 'hover:bg-white/5' : 'hover:bg-slate-50') : ''}`}
                        >
                          {canContact && (
                            <span className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-royal border-royal text-white' : (dark ? 'border-slate-500' : 'border-slate-300')}`}>
                              {on && <Check size={13} />}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{name}</div>
                            <div className={`text-xs ${muted}`}>{sectionMap[s.section_id] ? fmtSectionLabel(sectionMap[s.section_id], lang) : '—'}</div>
                          </div>
                          <div className="flex gap-3 shrink-0 text-center">
                            <div><div className="text-sm font-bold font-en text-rose-500">{s.absent}</div><div className={`text-[11px] ${muted}`}>{t.warnAbsent}</div></div>
                            <div><div className="text-sm font-bold font-en text-amber-500">{s.vio}</div><div className={`text-[11px] ${muted}`}>{t.warnViolations}</div></div>
                            <div><div className="text-sm font-bold font-en">{s.late}</div><div className={`text-[11px] ${muted}`}>{t.warnLate}</div></div>
                          </div>
                        </Row>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <>
              {loading ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className={skeleton(dark, 'h-16 w-full')} />)}</div>
              ) : monthly.rows.length === 0 ? (
                <div className={cardFloating(dark, 'p-5')}><EmptyState icon={Check} text={t.monthNoData} dark={dark} compact /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                    {[
                      [t.mStudents, monthly.total.count, ''],
                      [t.mAttendanceRate, monthly.total.rate == null ? '—' : `${monthly.total.rate.toFixed(1)}%`, rateCls(monthly.total.rate)],
                      [t.mAbsentDays, monthly.total.absent, 'text-rose-500'],
                      [t.mViolations, monthly.total.vio, 'text-amber-500'],
                      [t.mLateness, monthly.total.lat, ''],
                    ].map(([label, value, cls]) => (
                      <div key={label} className={cardFloating(dark, 'p-4')}>
                        <div className={`text-xs mb-1 ${muted}`}>{label}</div>
                        <div className={`text-xl font-bold font-en ${cls}`}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className={cardFloating(dark, 'p-5 mb-5')}>
                    <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.mBySection}</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={muted}>
                            <th className="text-start font-medium py-2 pe-3">{t.colGradeSection}</th>
                            <th className="font-medium px-2">{t.mStudents}</th>
                            <th className="font-medium px-2">{t.mAttendanceRate}</th>
                            <th className="font-medium px-2">{t.mAbsentDays}</th>
                            <th className="font-medium px-2">{t.mLatePeriods}</th>
                            <th className="font-medium px-2">{t.mViolations}</th>
                            <th className="font-medium px-2">{t.mLateness}</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                          {monthly.rows.map((r) => (
                            <tr key={r.sec.id} className="text-center font-en">
                              <td className="py-2 pe-3 text-start whitespace-nowrap font-ar">{fmtSectionLabel(r.sec, lang)}</td>
                              <td className="px-2">{r.count}</td>
                              <td className={`px-2 font-semibold ${rateCls(r.rate)}`}>{r.rate == null ? '—' : `${r.rate.toFixed(1)}%`}</td>
                              <td className="px-2">{r.absent}</td>
                              <td className="px-2">{r.latePeriods}</td>
                              <td className="px-2">{r.vio}</td>
                              <td className="px-2">{r.lat}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {byType.length > 0 && (
                    <div className={cardFloating(dark, 'p-5')}>
                      <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.mByType}</h2>
                      <ul className="space-y-2">
                        {byType.map(([type, n]) => (
                          <li key={type} className="flex items-center gap-3 text-sm">
                            <span className="w-40 shrink-0 truncate">{t.violationTypeNames[type] || type}</span>
                            <div className={`flex-1 h-2 rounded-full ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>
                              <div className="h-2 rounded-full bg-amber-500" style={{ width: `${(n / byType[0][1]) * 100}%` }} />
                            </div>
                            <span className="font-en font-semibold w-8 text-end">{n}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {printSheet}

      {tab === 'warning' && canContact && picked.size > 0 && (
        <div className="no-print fixed bottom-16 md:bottom-4 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <button
            onClick={() => setBulkOpen(true)}
            className="pointer-events-auto flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-full bg-royal hover:bg-royal-light text-white shadow-xl"
          >
            {bulkOpen ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} {t.sendToSelectedBtn.replace('{n}', picked.size)}
          </button>
        </div>
      )}

      {bulkOpen && (
        <BulkContactModal
          students={pickedStudents}
          contextType="general"
          defaultNote={t.warnNote}
          staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
