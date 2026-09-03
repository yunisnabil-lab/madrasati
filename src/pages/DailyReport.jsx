import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Printer, Download } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { sectionsFor, sectionLabel as fmtSectionLabel } from '../lib/sections';
import { deriveByStudentAndDate } from '../lib/attendanceDerive';
import { STATUS_META, STATUS_LIST } from '../lib/status';
import { exportXlsx } from '../lib/exportXlsx';
import SectionPicker from '../components/SectionPicker';

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function DailyReport() {
  const { t, lang, dark } = useApp();

  const [sections, setSections] = useState([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [sectionSel, setSectionSel] = useState('__ALL__');
  const [date, setDate] = useState(todayStr());
  const [filter, setFilter] = useState('all');

  const [rows, setRows] = useState(null); // null = not run yet
  const [loading, setLoading] = useState(false);
  const [printSelection, setPrintSelection] = useState(new Set());

  const loadSectionsIfNeeded = async () => {
    if (sectionsLoaded) return;
    const { data } = await supabase.from('sections').select('id, grade_name, section_name, grade_order, stream, section_number');
    setSections(data || []);
    setSectionsLoaded(true);
  };
  useEffect(() => { loadSectionsIfNeeded(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSectionIds = useMemo(() => {
    if (!grade) return [];
    if (sectionSel === '__ALL__') return sectionsFor(sections, grade, stream).map((s) => s.id);
    if (sectionSel) return [sectionSel];
    return [];
  }, [sections, grade, stream, sectionSel]);

  const showReport = async () => {
    if (activeSectionIds.length === 0) return;
    setLoading(true);

    const { data: studs } = await supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, section_name, stream, section_number)')
      .in('section_id', activeSectionIds)
      .eq('is_active', true)
      .order('name_ar', { ascending: true });

    const list = studs || [];
    if (list.length === 0) { setRows([]); setLoading(false); return; }

    const ids = list.map((s) => s.id);
    const { data: records } = await supabase
      .from('attendance_records')
      .select('student_id, date, status, period')
      .eq('date', date)
      .in('student_id', ids);

    const derived = deriveByStudentAndDate(records || []);

    const result = list.map((s) => {
      const dayMap = derived.get(s.id);
      const day = dayMap ? dayMap.get(date) : null;
      return {
        id: s.id,
        sis_no: s.sis_no,
        name: lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar),
        grade: s.sections?.grade_name,
        section: s.sections,
        section_id: s.section_id,
        section_label: fmtSectionLabel(s.sections, lang),
        status: day ? day.status : 'present',
      };
    });

    setRows(result);
    setPrintSelection(new Set());
    setLoading(false);
  };

  const filtered = rows ? rows.filter((r) => filter === 'all' || r.status === filter) : [];
  const printRows = printSelection.size > 0 ? filtered.filter((r) => printSelection.has(r.id)) : filtered;

  const sectionGroups = useMemo(() => {
    if (!filtered.length) return [];
    const map = new Map();
    filtered.forEach((r) => {
      if (!map.has(r.section_id)) map.set(r.section_id, { label: r.section_label, ids: [] });
      map.get(r.section_id).ids.push(r.id);
    });
    return [...map.entries()].map(([section_id, g]) => ({ section_id, ...g }));
  }, [filtered]);

  const toggleSectionSelect = (ids) => {
    setPrintSelection((prev) => {
      const allIn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const togglePrintSelect = (id) => {
    setPrintSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const counts = rows ? {
    present: rows.filter((r) => r.status === 'present').length,
    absent: rows.filter((r) => r.status === 'absent').length,
    late: rows.filter((r) => r.status === 'late').length,
    excused: rows.filter((r) => r.status === 'excused').length,
  } : null;

  const exportCsv = () => {
    const header = [t.colNo, t.colStudentNo, t.colStudentName, t.colGrade, t.colStatus];
    const body = printRows.map((r, i) => [i + 1, r.sis_no, r.name, r.grade, t[STATUS_META[r.status].key]]);
    exportXlsx(`daily-report-${date}.xlsx`, [header, ...body], { lang });
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7 print-area">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 no-print">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.dailyReportTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.dailyReportSub}</p>
          </motion.div>

          {/* print-only header: school name, report title, and the active filters,
              since the on-screen controls above are hidden when printing */}
          <div className="print-only mb-4 text-black">
            <h1 className="text-lg font-bold">{t.school} — {t.schoolSub}</h1>
            <h2 className="text-base font-semibold mt-0.5">{t.dailyReportTitle}</h2>
            <p className="text-sm mt-1">{t.dateLabel}: {date}{printSelection.size > 0 ? ` — ${t.selectedForPrint.replace('{n}', printSelection.size)}` : ''}</p>
          </div>

          {/* controls */}
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
              <div className="sm:w-56">
                <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.dateLabel}</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} font-en`} />
              </div>
              <button
                onClick={showReport}
                disabled={activeSectionIds.length === 0 || loading}
                className="text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60"
              >
                {t.showReport}
              </button>
            </div>
          </div>

          {loading ? (
            <div className={cardFloating(dark, 'p-5 space-y-3')}>{[...Array(5)].map((_, i) => <div key={i} className={skeleton(dark, 'h-11 w-full')} />)}</div>
          ) : rows === null ? (
            <div className={cardFloating(dark, 'p-10 text-center no-print')}>
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noReportYet}</p>
            </div>
          ) : (
            <>
              {/* KPI + filter + actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 no-print">
                {STATUS_LIST.map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilter(filter === k ? 'all' : k)}
                    className={cardFloating(dark, `p-4 text-center border-b-4 ${filter === k ? 'ring-2 ring-royal' : ''}`)}
                    style={{ borderBottomColor: STATUS_META[k].color }}
                  >
                    <div className="text-2xl font-bold">{counts[k]}</div>
                    <div className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t[STATUS_META[k].key]}</div>
                  </button>
                ))}
              </div>

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
                <div className="flex items-center gap-3">
                  <button onClick={() => setFilter('all')} className={`text-xs font-medium ${filter === 'all' ? (dark ? 'text-royal-light' : 'text-royal') : (dark ? 'text-slate-500' : 'text-slate-400')}`}>
                    {t.filterAll} ({rows.length})
                  </button>
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
                {filtered.length === 0 ? (
                  <div className="p-10 text-center"><p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noResultsForFilter}</p></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                        <th className="w-9 px-4 py-3 no-print"></th>
                        <th className="text-start font-medium px-4 py-3">{t.colNo}</th>
                        <th className="text-start font-medium px-4 py-3 font-en">{t.colStudentNo}</th>
                        <th className="text-start font-medium px-4 py-3">{t.colStudentName}</th>
                        <th className="text-start font-medium px-4 py-3 hidden sm:table-cell">{t.colGrade}</th>
                        <th className="text-start font-medium px-4 py-3">{t.colStatus}</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                      {filtered.map((r, i) => {
                        const meta = STATUS_META[r.status];
                        const Icon = meta.icon;
                        const excludedFromPrint = printSelection.size > 0 && !printSelection.has(r.id);
                        return (
                          <tr key={r.id} className={excludedFromPrint ? 'no-print' : ''}>
                            <td className="px-4 py-2.5 no-print">
                              <input type="checkbox" checked={printSelection.has(r.id)} onChange={() => togglePrintSelect(r.id)} className="accent-royal" />
                            </td>
                            <td className="px-4 py-2.5">{i + 1}</td>
                            <td className="px-4 py-2.5 font-en">{r.sis_no}</td>
                            <td className="px-4 py-2.5 font-medium">{r.name}</td>
                            <td className="px-4 py-2.5 hidden sm:table-cell">{r.grade}</td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                                <Icon size={13} /> {t[meta.key]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
