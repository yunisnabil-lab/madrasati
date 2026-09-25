import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, MessageCircle, UserX, Loader2 } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { fetchAllRows } from '../lib/fetchAll';
import { sortSections, sectionLabel as fmtSectionLabel } from '../lib/sections';
import { periodsForDate } from '../lib/attendanceDerive';
import { nonSchoolDay } from '../lib/schoolCalendar';
import EmptyState from '../components/EmptyState';
import BulkContactModal from '../components/BulkContactModal';

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// For one day: which section/period combinations have attendance recorded
// (so the supervisor can chase what's missing), and who was absent (so the
// parents can be contacted in one pass).
export default function RecordingStatus() {
  const { t, lang, dark, staff } = useApp();
  const canContact = staff && ['admin', 'supervisor', 'edari'].includes(staff.role);

  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);

  const [picked, setPicked] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    if (!staff) return;
    setLoading(true);
    const secRes = await supabase
      .from('sections')
      .select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
    let secs = secRes.data || [];
    // a supervisor follows only the sections they're assigned to
    if (staff.role === 'supervisor' || staff.role === 'edari') {
      const { data: assigned } = await supabase.from('staff_sections').select('section_id').eq('staff_id', staff.id);
      const allowed = new Set((assigned || []).map((a) => a.section_id));
      secs = secs.filter((s) => allowed.has(s.id));
    }
    const [studRes, recRes] = await Promise.all([
      fetchAllRows(() => supabase.from('students').select('id, name_ar, name_en, section_id').eq('is_active', true).order('id')),
      fetchAllRows(() => supabase.from('attendance_records').select('id, student_id, period, status').eq('date', date).order('id')),
    ]);
    const secIds = new Set(secs.map((s) => s.id));
    const studs = (studRes.data || []).filter((s) => secIds.has(s.section_id));
    const studIds = new Set(studs.map((s) => s.id));
    setSections(sortSections(secs));
    setStudents(studs);
    setRecords((recRes.data || []).filter((r) => studIds.has(r.student_id) && r.period != null));
    setPicked(new Set());
    setLoading(false);
  }, [staff, date]);

  useEffect(() => { load(); }, [load]);

  const periodCount = periodsForDate(date);
  const periods = useMemo(() => [...Array(periodCount)].map((_, i) => i + 1), [periodCount]);
  const offDay = nonSchoolDay(date, lang);

  const { totals, counts, absentees } = useMemo(() => {
    const totalBySection = {};
    students.forEach((s) => { totalBySection[s.section_id] = (totalBySection[s.section_id] || 0) + 1; });
    const sectionOf = {};
    students.forEach((s) => { sectionOf[s.id] = s.section_id; });

    // one record per student+period (a double save counts once)
    const seen = new Set();
    const byStudent = {};
    const cnt = {};
    records.forEach((r) => {
      const key = `${r.student_id}:${r.period}`;
      if (seen.has(key)) return;
      seen.add(key);
      const sec = sectionOf[r.student_id];
      if (!cnt[sec]) cnt[sec] = {};
      cnt[sec][r.period] = (cnt[sec][r.period] || 0) + 1;
      if (!byStudent[r.student_id]) byStudent[r.student_id] = { absent: [] };
      if (r.status === 'absent') byStudent[r.student_id].absent.push(r.period);
    });

    const list = students
      .filter((s) => byStudent[s.id] && byStudent[s.id].absent.length > 0)
      .map((s) => ({ ...s, absent: byStudent[s.id].absent.sort((a, b) => a - b) }))
      .sort((a, b) => b.absent.length - a.absent.length || (a.name_ar || '').localeCompare(b.name_ar || '', 'ar'));

    return { totals: totalBySection, counts: cnt, absentees: list };
  }, [students, records]);

  const sectionMap = useMemo(() => {
    const m = {};
    sections.forEach((s) => { m[s.id] = s; });
    return m;
  }, [sections]);

  // summary numbers over sections that have students
  const activeSections = sections.filter((s) => (totals[s.id] || 0) > 0);
  const complete = (secId, p) => (counts[secId]?.[p] || 0) >= (totals[secId] || 0) && (totals[secId] || 0) > 0;
  const doneCells = activeSections.reduce((n, s) => n + periods.filter((p) => complete(s.id, p)).length, 0);
  const totalCells = activeSections.length * periods.length;

  const toggle = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allPicked = absentees.length > 0 && picked.size === absentees.length;

  const pickedStudents = absentees
    .filter((s) => picked.has(s.id))
    .map((s) => ({
      id: s.id,
      name: lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar),
      sectionLabel: sectionMap[s.section_id] ? fmtSectionLabel(sectionMap[s.section_id], lang) : '',
    }));

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`;

  const cell = (secId, p) => {
    const n = counts[secId]?.[p] || 0;
    const total = totals[secId] || 0;
    if (total > 0 && n >= total) {
      return <span className="inline-flex items-center justify-center h-7 w-9 rounded-md bg-emerald-500/15 text-emerald-600"><Check size={14} /></span>;
    }
    if (n > 0) {
      return <span className="inline-flex items-center justify-center h-7 min-w-9 px-1 rounded-md bg-amber-500/15 text-amber-600 text-xs font-semibold font-en">{n}/{total}</span>;
    }
    return <span className={`inline-flex items-center justify-center h-7 w-9 rounded-md text-xs font-semibold ${dark ? 'bg-rose-500/15 text-rose-400' : 'bg-rose-500/10 text-rose-500'}`}>—</span>;
  };

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.recStatusTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.recStatusSub}</p>
          </motion.div>

          <div className={cardFloating(dark, 'p-4 mb-5 flex flex-col sm:flex-row gap-3 sm:items-end')}>
            <div className="sm:w-56">
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.dateLabel}</label>
              <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className={`${inputCls} font-en`} />
            </div>
            {!loading && totalCells > 0 && (
              <div className={`text-sm font-medium ${doneCells === totalCells ? 'text-emerald-500' : (dark ? 'text-slate-200' : 'text-slate-600')}`}>
                {t.recStatusSummary.replace('{done}', doneCells).replace('{total}', totalCells)}
              </div>
            )}
          </div>

          {offDay && (
            <p className={`text-xs rounded-lg px-3 py-2 mb-5 ${dark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
              {t.notSchoolDayNote.replace('{name}', offDay.name)}
            </p>
          )}

          {/* section x period grid */}
          <div className={cardFloating(dark, 'p-5 mb-5')}>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-3">
              <span className="flex items-center gap-1.5 text-emerald-600"><Check size={13} /> {t.recLegendDone}</span>
              <span className="flex items-center gap-1.5 text-amber-600"><span className="font-en font-semibold">n/m</span> {t.recLegendPartial}</span>
              <span className={`flex items-center gap-1.5 ${dark ? 'text-rose-400' : 'text-rose-500'}`}><span className="font-semibold">—</span> {t.recLegendMissing}</span>
            </div>
            {loading ? (
              <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className={skeleton(dark, 'h-10 w-full')} />)}</div>
            ) : activeSections.length === 0 ? (
              <EmptyState icon={Check} text={t.recNoSections} dark={dark} compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={dark ? 'text-slate-300' : 'text-slate-500'}>
                      <th className="text-start font-medium py-2 pe-3">{t.colGradeSection}</th>
                      {periods.map((p) => <th key={p} className="font-medium font-en px-1 py-2">{p}</th>)}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {activeSections.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 pe-3 text-start whitespace-nowrap">{fmtSectionLabel(s, lang)}</td>
                        {periods.map((p) => <td key={p} className="px-1 py-2 text-center">{cell(s.id, p)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* absentees + one-pass parent contact */}
          <div className={cardFloating(dark, 'p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className={`text-sm font-semibold flex items-center gap-2 ${dark ? 'text-white' : 'text-slate-900'}`}>
                <UserX size={16} className="text-rose-500" /> {t.recAbsenteesTitle}
                {!loading && <span className={`text-xs font-normal ${dark ? 'text-slate-300' : 'text-slate-500'}`}>({absentees.length})</span>}
              </h2>
              {canContact && absentees.length > 0 && (
                <button
                  onClick={() => setPicked(allPicked ? new Set() : new Set(absentees.map((s) => s.id)))}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {allPicked ? t.recClearAll : t.recSelectAll}
                </button>
              )}
            </div>
            {loading ? (
              <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
            ) : absentees.length === 0 ? (
              <EmptyState icon={Check} text={t.recNoAbsentees} dark={dark} compact />
            ) : (
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {absentees.map((s) => {
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
                          <div className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>
                            {sectionMap[s.section_id] ? fmtSectionLabel(sectionMap[s.section_id], lang) : '—'}
                          </div>
                        </div>
                        <div className="text-end shrink-0">
                          <div className="text-sm font-bold font-en text-rose-500">{s.absent.length}</div>
                          <div className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{t.recAbsentPeriods.replace('{p}', s.absent.join('، '))}</div>
                        </div>
                      </Row>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </main>
      </div>

      {canContact && picked.size > 0 && (
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
          defaultNote={t.recAbsenceNote}
          staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
