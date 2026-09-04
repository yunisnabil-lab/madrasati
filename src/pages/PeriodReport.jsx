import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Printer, Download, Flag, PieChart as PieIcon } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import { fetchAllRows } from '../lib/fetchAll';
import { deriveByStudentAndDate } from '../lib/attendanceDerive';
import { exportXlsx } from '../lib/exportXlsx';
import SectionPicker from '../components/SectionPicker';

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function PeriodReport() {
  const { t, lang, dark } = useApp();

  const [sections, setSections] = useState([]);
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [sectionSel, setSectionSel] = useState('__ALL__');
  const [fromDate, setFromDate] = useState(weekAgoStr());
  const [toDate, setToDate] = useState(todayStr());

  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printSelection, setPrintSelection] = useState(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sections').select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
      setSections(data || []);
    })();
  }, []);

  const activeSectionIds = useMemo(() => {
    if (!grade) return [];
    if (sectionSel === '__ALL__') return sectionsFor(sections, grade, stream).map((s) => s.id);
    if (sectionSel) return [sectionSel];
    return [];
  }, [sections, grade, stream, sectionSel]);

  const [dateError, setDateError] = useState('');

  const showReport = async () => {
    if (activeSectionIds.length === 0 || !fromDate || !toDate) return;
    if (fromDate > toDate) {
      setDateError(t.invalidDateRange);
      return;
    }
    setDateError('');
    setLoading(true);

    const { data: studs } = await supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number)')
      .in('section_id', activeSectionIds)
      .eq('is_active', true)
      .order('name_ar', { ascending: true });

    const list = studs || [];
    if (list.length === 0) { setRows([]); setLoading(false); return; }

    const ids = list.map((s) => s.id);
    const { data: records } = await fetchAllRows(() => supabase
      .from('attendance_records')
      .select('student_id, date, status, period')
      .gte('date', fromDate)
      .lte('date', toDate)
      .in('student_id', ids));

    const derived = deriveByStudentAndDate(records || []);

    const result = list.map((s) => {
      const dayMap = derived.get(s.id);
      const days = dayMap ? [...dayMap.values()] : [];
      const total = days.length;
      const present = days.filter((d) => d.status === 'present').length;
      const absent = days.filter((d) => d.status === 'absent').length;
      const excused = days.filter((d) => d.status === 'excused').length;
      const lateDays = days.filter((d) => d.status === 'late' || d.lateCount > 0).length;
      // excused days don't count against the attendance rate or the red-flag ratio
      const ratable = total - excused;
      const rate = ratable > 0 ? Math.round((present / ratable) * 100) : 100;

      const sortedDates = dayMap ? [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])) : [];
      let streak = 0; let flagged = false;
      sortedDates.forEach(([, d]) => {
        streak = d.status === 'absent' ? streak + 1 : 0;
        if (streak >= 3) flagged = true;
      });
      if (ratable > 0 && absent / ratable >= 0.2) flagged = true;

      return {
        id: s.id,
        sis_no: s.sis_no,
        name: lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar),
        grade: (lang === 'en' && s.sections?.grade_name_en) ? s.sections.grade_name_en : s.sections?.grade_name,
        section_id: s.section_id,
        section_label: fmtSectionLabel(s.sections, lang),
        present, absent, excused, lateDays, rate, flagged,
      };
    });

    result.sort((a, b) => a.name.localeCompare(b.name, lang === 'ar' ? 'ar' : 'en'));
    setRows(result);
    setPrintSelection(new Set());
    setLoading(false);
  };

  const printRows = printSelection.size > 0 ? (rows || []).filter((r) => printSelection.has(r.id)) : (rows || []);

  const sectionGroups = useMemo(() => {
    if (!rows) return [];
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.section_id)) map.set(r.section_id, { label: r.section_label, ids: [] });
      map.get(r.section_id).ids.push(r.id);
    });
    return [...map.entries()].map(([section_id, g]) => ({ section_id, ...g }));
  }, [rows]);

  const toggleStudentSelect = (id) => {
    setPrintSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSectionSelect = (ids) => {
    setPrintSelection((prev) => {
      const allIn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const exportCsv = () => {
    const header = [t.colNo, t.colStudentNo, t.colStudentName, t.colGrade, t.colPresentDays, t.colAbsentDays, t.colLateDays, t.colExcusedDays, t.colRate, t.colFlag];
    const body = printRows.map((r, i) => [i + 1, r.sis_no, r.name, r.grade, r.present, r.absent, r.lateDays, r.excused, `${r.rate}%`, r.flagged ? t.frequentAbsence : '']);
    exportXlsx(`period-report-${fromDate}-to-${toDate}.xlsx`, [header, ...body], { lang });
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7 print-area">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 no-print">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.periodReportTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.periodReportSub}</p>
          </motion.div>

          <div className="print-only mb-4 text-black">
            <h1 className="text-lg font-bold">{t.school} — {t.schoolSub}</h1>
            <h2 className="text-base font-semibold mt-0.5">{t.periodReportTitle}</h2>
            <p className="text-sm mt-1">{t.fromDate}: {fromDate} — {t.toDate}: {toDate}{printSelection.size > 0 ? ` — ${t.selectedForPrint.replace('{n}', printSelection.size)}` : ''}</p>
          </div>

          <div className={cardFloating(dark, 'p-4 mb-5 space-y-3 no-print')}>
            <SectionPicker
              sections={sections} lang={lang} dark={dark}
              grade={grade} stream={stream} sectionId={sectionSel}
              allowAll
              onGradeChange={(g) => { setGrade(g); setStream(''); setSectionSel(g ? '__ALL__' : ''); }}
              onStreamChange={(s) => { setStream(s); setSectionSel('__ALL__'); }}
              onSectionChange={setSectionSel}
              inputCls={inputCls}
            />
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.fromDate}</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} font-en`} />
              </div>
              <div className="flex-1">
                <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.toDate}</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${inputCls} font-en`} />
              </div>
              <button
                onClick={showReport}
                disabled={activeSectionIds.length === 0 || loading}
                className="text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {t.showReport}
              </button>
            </div>
            {dateError && <p className="text-xs text-rose-500">{dateError}</p>}
          </div>

          {loading ? (
            <div className={cardFloating(dark, 'p-5 space-y-3')}>{[...Array(6)].map((_, i) => <div key={i} className={skeleton(dark, 'h-11 w-full')} />)}</div>
          ) : rows === null ? (
            <div className={cardFloating(dark, 'p-10 text-center no-print')}>
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noReportYet}</p>
            </div>
          ) : (
            <>
              {rows.length > 0 && (
                <div className={cardFloating(dark, 'p-5 mb-5 print-area')}>
                  <div className="flex items-center gap-2 mb-3">
                    <PieIcon size={15} className={dark ? 'text-slate-400' : 'text-slate-500'} />
                    <h3 className="text-sm font-semibold">{t.chartTitle}</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: t.statusPresent, value: rows.reduce((s, r) => s + r.present, 0), color: '#05cd99' },
                          { name: t.statusAbsent, value: rows.reduce((s, r) => s + r.absent, 0), color: '#ee5d50' },
                          { name: t.statusLate, value: rows.reduce((s, r) => s + r.lateDays, 0), color: '#ffb800' },
                          { name: t.statusExcused, value: rows.reduce((s, r) => s + r.excused, 0), color: '#8b5cf6' },
                        ].filter((d) => d.value > 0)}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {['#05cd99', '#ee5d50', '#ffb800', '#8b5cf6'].map((c) => <Cell key={c} fill={c} />)}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {sectionGroups.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 mb-3 no-print">
                  <span className={`text-xs font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.selectBySection}</span>
                  {sectionGroups.map((g) => {
                    const allSelected = g.ids.every((id) => printSelection.has(id));
                    return (
                      <button
                        key={g.section_id}
                        onClick={() => toggleSectionSelect(g.ids)}
                        className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                          allSelected
                            ? 'bg-royal text-white border-transparent'
                            : dark ? 'border-slate-700 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between mb-3 no-print">
                <div>
                  {printSelection.size > 0 && (
                    <span className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {t.selectedForPrint.replace('{n}', printSelection.size)}
                      {' · '}
                      <button onClick={() => setPrintSelection(new Set())} className={dark ? 'text-royal-light' : 'text-royal'}>{t.clearSelection}</button>
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={exportCsv} className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <Download size={13} /> {t.exportCsv}
                  </button>
                  <button onClick={() => window.print()} className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <Printer size={13} /> {printSelection.size > 0 ? t.printSelectedBtn.replace('{n}', printSelection.size) : t.printReport}
                  </button>
                </div>
              </div>

              <div className={cardFloating(dark, 'overflow-hidden')}>
                {rows.length === 0 ? (
                  <div className="p-10 text-center"><p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noResultsForFilter}</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                          <th className="w-9 px-4 py-3 no-print"></th>
                          <th className="text-start font-medium px-4 py-3">{t.colNo}</th>
                          <th className="text-start font-medium px-4 py-3 font-en">{t.colStudentNo}</th>
                          <th className="text-start font-medium px-4 py-3">{t.colStudentName}</th>
                          <th className="text-center font-medium px-4 py-3">{t.colPresentDays}</th>
                          <th className="text-center font-medium px-4 py-3">{t.colAbsentDays}</th>
                          <th className="text-center font-medium px-4 py-3 hidden sm:table-cell">{t.colLateDays}</th>
                          <th className="text-center font-medium px-4 py-3 hidden sm:table-cell">{t.colExcusedDays}</th>
                          <th className="text-center font-medium px-4 py-3">{t.colRate}</th>
                          <th className="text-center font-medium px-4 py-3">{t.colFlag}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                        {rows.map((r, i) => {
                          const excludedFromPrint = printSelection.size > 0 && !printSelection.has(r.id);
                          return (
                          <tr key={r.id} className={excludedFromPrint ? 'no-print' : ''}>
                            <td className="px-4 py-2.5 no-print">
                              <input type="checkbox" checked={printSelection.has(r.id)} onChange={() => toggleStudentSelect(r.id)} className="accent-royal" />
                            </td>
                            <td className="px-4 py-2.5">{i + 1}</td>
                            <td className="px-4 py-2.5 font-en">{r.sis_no}</td>
                            <td className="px-4 py-2.5 font-medium">{r.name}</td>
                            <td className="px-4 py-2.5 text-center text-emerald-500 font-semibold">{r.present}</td>
                            <td className="px-4 py-2.5 text-center text-rose-500 font-semibold">{r.absent}</td>
                            <td className="px-4 py-2.5 text-center hidden sm:table-cell text-amber-500 font-semibold">{r.lateDays}</td>
                            <td className="px-4 py-2.5 text-center hidden sm:table-cell text-violet-500 font-semibold">{r.excused}</td>
                            <td className="px-4 py-2.5 text-center font-semibold">{r.rate}%</td>
                            <td className="px-4 py-2.5 text-center">
                              {r.flagged && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500">
                                  <Flag size={10} /> {t.frequentAbsence}
                                </span>
                              )}
                            </td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
