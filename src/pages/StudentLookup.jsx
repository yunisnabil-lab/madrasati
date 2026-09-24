import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, Flag, Printer, MessageCircle, Trash2, Loader2, Mail, RefreshCw, ChevronDown } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { matchesStudentSearch, searchStudents, studentMatchRank } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import { buildWhatsAppLink } from '../lib/whatsapp';
import { deriveByStudentAndDate } from '../lib/attendanceDerive';
import { printWithTitle, reportName, rangeLabel } from '../lib/print';
import { PrintSheet, PrintTable, StatusPill } from '../components/PrintSheet';
import { sheetToPdfBase64 } from '../lib/pdfReport';
import { emailErrorText } from '../lib/emailErrors';
import { STATUS_META } from '../lib/status';
import SectionPicker from '../components/SectionPicker';
import PeriodBreakdown from '../components/PeriodBreakdown';
import ContactParentPanel from '../components/ContactParentPanel';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function dayName(dateStr, lang) {
  const d = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { weekday: 'long' }).format(d);
}

// group raw period-level attendance rows into one derived status per day,
// using the same rule as everywhere else in the app (see lib/attendanceDerive).
function deriveDayRecords(rawRecords) {
  const byDate = deriveByStudentAndDate(rawRecords.map((r) => ({ ...r, student_id: '_' }))).get('_') || new Map();
  const days = [...byDate.entries()].map(([date, day]) => ({ date, ...day }));
  return days.sort((a, b) => b.date.localeCompare(a.date));
}

// red-flag: >=20% absence, or 3+ consecutive absent days (by chronological order)
function isFrequentAbsence(records) {
  if (!records.length) return false;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  // Not-recorded days (status: null) have no verdict, so they shouldn't
  // dilute the absence ratio's denominator.
  const decisive = records.filter((r) => r.status != null).length;
  if (decisive > 0 && absentCount / decisive >= 0.2) return true;

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0;
  for (const r of sorted) {
    streak = r.status === 'absent' ? streak + 1 : 0;
    if (streak >= 3) return true;
  }
  return false;
}

export default function StudentLookup() {
  const { t, lang, dark, staff } = useApp();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [globalMatches, setGlobalMatches] = useState(null); // explicit full-school text search results
  const [sectionRoster, setSectionRoster] = useState(null); // cached roster for the selected class

  const [sections, setSections] = useState([]);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const location = useLocation();
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [sectionSel, setSectionSel] = useState(''); // section_id or '__ALL__'

  const [selected, setSelected] = useState(null); // student row
  const [history, setHistory] = useState([]); // all records for selected student
  const [historyLoading, setHistoryLoading] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // load sections once — a recorder (teacher) only sees the sections
  // they've been assigned by the admin (staff_sections), same as Attendance
  useEffect(() => {
    if (!staff) return;
    (async () => {
      const { data } = await supabase
        .from('sections')
        .select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
      let list = data || [];
      // a supervisor looks students up scoped to their own assigned sections too.
      if (staff.role === 'recorder' || staff.role === 'supervisor') {
        const { data: assigned } = await supabase.from('staff_sections').select('section_id').eq('staff_id', staff.id);
        const allowed = new Set((assigned || []).map((a) => a.section_id));
        list = list.filter((s) => allowed.has(s.id));
      }
      setSections(list);
      setSectionsLoaded(true);
    })();
  }, [staff]);

  // a search typed in the header box arrives here as location.state.q —
  // run it once the sections are known, since a teacher's search is scoped
  // to their own sections
  const incomingQ = location.state?.q;
  const ranIncomingRef = useRef(null);
  useEffect(() => {
    if (!incomingQ || !sectionsLoaded || ranIncomingRef.current === location.key) return;
    ranIncomingRef.current = location.key;
    setQuery(incomingQ);
    runSearch(incomingQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingQ, sectionsLoaded, location.key]);

  const activeSectionIds = useMemo(() => {
    if (!grade) return null;
    if (sectionSel && sectionSel !== '__ALL__') return [sectionSel];
    return sectionsFor(sections, grade, stream).map((s) => s.id);
  }, [sections, grade, stream, sectionSel]);

  const sectionFilterKey = activeSectionIds ? activeSectionIds.join(',') : null;

  // browsing by class: fetch the roster once whenever the class selection changes
  useEffect(() => {
    if (!sectionFilterKey) { setSectionRoster(null); return; }
    (async () => {
      setSearching(true);
      const { data } = await supabase
        .from('students')
        .select('id, sis_no, name_ar, name_en, section_id, email, parent_email, emirates_id, moe_username, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)')
        .in('section_id', sectionFilterKey.split(','))
        .order('name_ar', { ascending: true });
      setSectionRoster(data || []);
      setSearching(false);
    })();
  }, [sectionFilterKey]);

  // results: class roster (live-filtered by typed text, no refetch) takes
  // priority; otherwise fall back to the explicit full-school text search
  const results = useMemo(() => {
    const q = query.trim();
    if (sectionRoster !== null) {
      return q ? searchStudents(sectionRoster, q) : sectionRoster;
    }
    return globalMatches;
  }, [sectionRoster, globalMatches, query]);

  const runSearch = async (override) => {
    const q = (typeof override === 'string' ? override : query).trim();
    if (sectionRoster !== null) return; // already live-filtered above, nothing to fetch
    if (!q) { setGlobalMatches(null); return; }
    setSearching(true);
    const { data } = await fetchAllRows(() => supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, email, parent_email, emirates_id, moe_username, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)'));
    // a recorder (teacher) or supervisor only searches within their own
    // assigned sections — "sections" here is already pre-scoped to those for
    // that role (see above)
    const searchScope = (staff?.role === 'recorder' || staff?.role === 'supervisor') ? new Set(sections.map((s) => s.id)) : null;
    const matched = (data || [])
      .filter((s) => !searchScope || searchScope.has(s.section_id))
      .filter((s) => matchesStudentSearch(s, q));
    // first-name matches first, then by grade
    matched.sort((a, b) => studentMatchRank(a, q) - studentMatchRank(b, q) || (a.sections?.grade_order ?? 999) - (b.sections?.grade_order ?? 999));
    setGlobalMatches(matched);
    setSearching(false);
  };

  const clearSectionFilter = () => {
    setGrade('');
    setStream('');
    setSectionSel('');
  };

  const openProfile = async (student) => {
    setSelected(student);
    setFromDate('');
    setToDate('');
    setHistoryLoading(true);
    const { data } = await fetchAllRows(() => supabase
      .from('attendance_records')
      .select('id, date, status, period')
      .eq('student_id', student.id)
      .order('date', { ascending: false }));
    setHistory(deriveDayRecords(data || []));
    setHistoryLoading(false);
  };

  const filteredHistory = useMemo(() => {
    return history.filter((r) => (!fromDate || r.date >= fromDate) && (!toDate || r.date <= toDate));
  }, [history, fromDate, toDate]);

  const stats = useMemo(() => {
    // A day with no decisive status yet (attendanceDerive.js returned
    // status: null — nothing recorded, or too few periods recorded) has no
    // verdict, so it must not count toward the attendance-rate denominator.
    const total = filteredHistory.filter((r) => r.status != null).length;
    const present = filteredHistory.filter((r) => r.status === 'present').length;
    const absent = filteredHistory.filter((r) => r.status === 'absent').length;
    // Excused (like late) counts as attendance, not its own day-level
    // verdict — this is an informational count of days that included at
    // least one excused period, same as how "late" already works below.
    const excused = filteredHistory.filter((r) => r.excusedCount > 0).length;
    const late = filteredHistory.filter((r) => r.status === 'late' || r.lateCount > 0).length;
    // excused/late periods count as attendance, so every decisively
    // recorded day (present or absent) is ratable.
    const ratable = total;
    // null (not 100%) when there's no attendance data at all yet for this student in range
    const rate = ratable > 0 ? Math.round((present / ratable) * 100) : null;
    return { total, present, absent, excused, late, rate };
  }, [filteredHistory]);

  const flagged = isFrequentAbsence(filteredHistory);
  const rateColor = stats.rate == null ? (dark ? '#64748b' : '#94a3b8') : stats.rate >= 90 ? '#05cd99' : stats.rate >= 75 ? '#ffb800' : '#ee5d50';

  // printed / PDF version of the student's report (components/PrintSheet.jsx)
  const printSheet = (selected && !historyLoading) ? (() => {
    const nm = lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar);
    const periodList = (r, st) => Object.keys(r.periods || {}).filter((p) => r.periods[p] === st).sort((a, b) => a - b).join('، ');
    const noteOf = (r) => {
      const parts = [];
      if (periodList(r, 'absent')) parts.push(`${t.statusAbsent}: ${periodList(r, 'absent')}`);
      if (periodList(r, 'late')) parts.push(`${t.statusLate}: ${periodList(r, 'late')}`);
      return parts.join(' · ');
    };
    return (
      <PrintSheet
        t={t} lang={lang}
        title={`${t.studentReportTitle} — ${nm}`}
        stats={[
          { label: t.attendanceRate, value: stats.rate == null ? '—' : `${stats.rate}%`, color: rateColor },
          { label: t.daysPresent, value: stats.present, color: '#05cd99' },
          { label: t.daysAbsent, value: stats.absent, color: '#ee5d50' },
          { label: t.daysLate, value: stats.late, color: '#ffb800' },
          { label: t.daysExcused, value: stats.excused, color: '#8b5cf6' },
        ]}
        signatures={[t.signGuardian, t.signSchoolAdmin]}
      >
        <div className="ps-info">
          <div><span>{t.studentInfoName}</span><b>{nm}</b></div>
          <div><span>{t.sisNo}</span><b className="font-en">{selected.sis_no}</b></div>
          <div><span>{t.colGradeSection}</span><b>{fmtSectionLabel(selected.sections, lang)}</b></div>
          <div><span>{t.studentEmail}</span><b className="font-en">{selected.email || '—'}</b></div>
          <div><span>{t.parentEmail}</span><b className="font-en">{selected.parent_email || '—'}</b></div>
          <div><span>{t.fromDate} / {t.toDate}</span><b className="font-en">{rangeLabel(lang, fromDate, toDate) || '—'}</b></div>
        </div>
        {filteredHistory.length === 0 ? (
          <p>{t.noAttendanceRecords}</p>
        ) : (
          <PrintTable
            numbered={false}
            columns={[
              { label: t.recordDate, width: '84px', className: 'font-en', render: (r) => r.date },
              { label: t.recordDay, width: '80px', render: (r) => dayName(r.date, lang) },
              { label: t.recordStatus, width: '76px', align: 'center', render: (r) => { const meta = STATUS_META[r.status] || STATUS_META.not_recorded; return <StatusPill label={t[meta.key]} color={meta.color} />; } },
              { label: t.printNotes, render: noteOf },
            ]}
            groups={[{ rows: filteredHistory }]}
          />
        )}
      </PrintSheet>
    );
  })() : null;

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border font-en ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`print:hidden min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.lookupTitle}</h1>
          </motion.div>

          {!selected ? (
            <>
              <div className={cardFloating(dark, 'p-4 mb-5 space-y-3')}>
                <div className="flex gap-2">
                  <div className={`flex-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${dark ? 'bg-navy border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    <Search size={15} />
                    <input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        if (!e.target.value.trim() && sectionRoster === null) setGlobalMatches(null);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                      placeholder={t.lookupPlaceholder}
                      className="bg-transparent outline-none w-full text-sm placeholder:text-inherit"
                      style={{ color: dark ? '#e2e8f0' : '#334155' }}
                    />
                  </div>
                  <button
                    onClick={runSearch}
                    disabled={searching}
                    className="flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60"
                  >
                    <Search size={15} /> {lang === 'ar' ? 'بحث' : 'Search'}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex-1">
                    <SectionPicker
                      sections={sections}
                      lang={lang}
                      dark={dark}
                      grade={grade}
                      stream={stream}
                      sectionId={sectionSel}
                      allowAll
                      onGradeChange={(g) => { setGrade(g); setStream(''); setSectionSel(''); }}
                      onStreamChange={(s) => { setStream(s); setSectionSel(''); }}
                      onSectionChange={setSectionSel}
                      inputCls={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
                        dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    />
                  </div>
                  {sectionRoster !== null && (
                    <button
                      onClick={clearSectionFilter}
                      className={`text-xs font-medium px-4 py-2.5 rounded-lg border whitespace-nowrap ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      {t.clearClassFilter}
                    </button>
                  )}
                </div>
              </div>

              {results !== null && (
                <div className={cardFloating(dark, 'overflow-hidden')}>
                  {results.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.lookupNoResults}</p>
                    </div>
                  ) : (
                    <>
                      <div className={`px-4 py-2.5 text-xs border-b ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                        {t.lookupResultsCount.replace('{n}', results.length)}
                      </div>
                      <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                        {results.map((s) => {
                          const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                          return (
                            <li key={s.id}>
                              <button
                                onClick={() => openProfile(s)}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                              >
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold shrink-0">
                                  {initials(name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <div className="text-sm font-semibold truncate">{name}</div>
                                    {s.is_active === false && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${dark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                        {t.inactiveBadge}
                                      </span>
                                    )}
                                  </div>
                                  <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{lang === 'ar' ? 'رقم الطالب' : 'ID'}: {s.sis_no}</div>
                                </div>
                                <span className={`text-xs px-2.5 py-1 rounded-full shrink-0 ${dark ? 'bg-gold/10 text-gold' : 'bg-amber-50 text-amber-700'}`}>
                                  {fmtSectionLabel(s.sections, lang)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <StudentProfileCard
              student={selected}
              t={t} lang={lang} dark={dark} staff={staff}
              history={filteredHistory}
              historyLoading={historyLoading}
              stats={stats}
              rateColor={rateColor}
              flagged={flagged}
              fromDate={fromDate} toDate={toDate}
              setFromDate={setFromDate} setToDate={setToDate}
              inputCls={inputCls}
              onBack={() => setSelected(null)}
              onRefresh={() => openProfile(selected)}
            />
          )}
        </main>
      </div>

      {printSheet}
    </div>
  );
}

function StudentProfileCard({
  student, t, lang, dark, staff, history, historyLoading, stats, rateColor, flagged,
  fromDate, toDate, setFromDate, setToDate, inputCls, onBack, onRefresh,
}) {
  const name = lang === 'ar' ? (student.name_ar || student.name_en) : (student.name_en || student.name_ar);
  // Deleting attendance is permanent and there's no audit log yet, so it's
  // admin-only (the database only allows admins to delete attendance anyway).
  // "edari" corrects a wrong mark by editing its status instead.
  const canDeleteRecords = staff && staff.role === 'admin';

  const [expandedDates, setExpandedDates] = useState(new Set());
  const toggleExpandDate = (date) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={onBack} className={`flex items-center gap-1.5 text-xs font-medium mb-4 no-print ${dark ? 'text-slate-200 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
        <ArrowRight size={14} className={lang === 'ar' ? '' : 'rotate-180'} /> {t.backToResults}
      </button>

      <div className={cardFloating(dark, 'p-6 mb-5 print-area')}>
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-lg font-semibold">
              {initials(name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-navy'}`}>{name}</h2>
                {flagged && (
                  <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500">
                    <Flag size={11} /> {t.frequentAbsence}
                  </span>
                )}
              </div>
              <div className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                {fmtSectionLabel(student.sections, lang)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center text-sm font-bold border-4"
              style={{ borderColor: rateColor, color: rateColor }}
            >
              {stats.rate == null ? '—' : `${stats.rate}%`}
            </div>
            <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.attendanceRate}</div>
          </div>
        </div>

        {/* info grid */}
        <div className="grid gap-3 mt-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <InfoItem dark={dark} label={t.sisNo} value={student.sis_no} />
          <InfoItem dark={dark} label={t.studentEmail} value={student.email || '—'} />
          <InfoItem dark={dark} label={t.parentEmail} value={student.parent_email || '—'} />
          <InfoItem dark={dark} label={t.daysPresent} value={stats.present} valueColor="#05cd99" />
          <InfoItem dark={dark} label={t.daysAbsent} value={stats.absent} valueColor="#ee5d50" />
          <InfoItem dark={dark} label={t.daysLate} value={stats.late} valueColor="#ffb800" />
          <InfoItem dark={dark} label={t.daysExcused} value={stats.excused} valueColor="#8b5cf6" />
        </div>
      </div>

      {/* period filter */}
      <div className={cardFloating(dark, 'p-4 mb-5 flex flex-col sm:flex-row gap-3 sm:items-end no-print')}>
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.fromDate}</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.toDate}</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
        </div>
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(''); setToDate(''); onRefresh && onRefresh(); }} className={`text-xs font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            {t.showAll}
          </button>
        )}
        <button onClick={() => onRefresh && onRefresh()} className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
          <RefreshCw size={14} /> {t.refresh}
        </button>
        <button onClick={() => printWithTitle(reportName(name, student.sis_no, rangeLabel(lang, fromDate, toDate), (fromDate || toDate) ? '' : todayStr()))} className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
          <Printer size={14} /> {t.printReport}
        </button>
      </div>

      {staff?.role === 'recorder' ? (
        <div className="no-print">
          <ContactParentPanel
            student={student}
            name={name}
            sectionLabel={fmtSectionLabel(student.sections, lang)}
            defaultNote={lang === 'ar'
              ? `نسبة حضور الطالب حاليًا ${stats.rate == null ? '—' : `${stats.rate}%`} (${stats.absent} يوم غياب). نحب نلفت انتباه حضرتك لمتابعة الموضوع معاه.`
              : `The student's current attendance rate is ${stats.rate == null ? '—' : `${stats.rate}%`} (${stats.absent} day(s) absent). We'd like to bring this to your attention.`}
            mode="request"
            staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls}
          />
        </div>
      ) : (
        <div className="no-print">
          <WhatsAppShare student={student} name={name} stats={stats} history={history} sectionLabel={fmtSectionLabel(student.sections, lang)} fromDate={fromDate} toDate={toDate} t={t} lang={lang} dark={dark} inputCls={inputCls} />
        </div>
      )}

      {canDeleteRecords && (
        <div className="no-print">
          <DeleteRecordsPanel student={student} t={t} lang={lang} dark={dark} inputCls={inputCls} onDeleted={onRefresh} />
        </div>
      )}

      {/* history table */}
      <div className={cardFloating(dark, 'overflow-hidden')}>
        {historyLoading ? (
          <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className={skeleton(dark, 'h-10 w-full')} />)}</div>
        ) : history.length === 0 ? (
          <div className="p-10 text-center">
            <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noAttendanceRecords}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                <th className="text-start font-medium px-4 py-3">{t.recordDate}</th>
                <th className="text-start font-medium px-4 py-3">{t.recordDay}</th>
                <th className="text-start font-medium px-4 py-3">{t.recordStatus}</th>
                <th className="text-start font-medium px-4 py-3 no-print">{t.periodsCol}</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
              {history.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.present;
                const Icon = meta.icon;
                const hasNote = (r.absentCount > 0 || r.lateCount > 0) && r.status === 'present';
                const isExpanded = expandedDates.has(r.date);
                return (
                  <Fragment key={r.date}>
                    <tr>
                      <td className="px-4 py-2.5 font-en">{r.date}</td>
                      <td className="px-4 py-2.5">{dayName(r.date, lang)}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                          <Icon size={13} /> {t[meta.key]}
                        </span>
                        {hasNote && (
                          <span className={`ms-2 text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                            {t.periodNote
                              .replace('{absent}', r.absentCount || 0)
                              .replace('{late}', r.lateCount || 0)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 no-print">
                        <button
                          onClick={() => toggleExpandDate(r.date)}
                          className={`flex items-center gap-1 text-xs font-medium ${dark ? 'text-royal-light' : 'text-royal'}`}
                        >
                          {isExpanded ? t.hidePeriods : t.showPeriods}
                          <ChevronDown size={13} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="no-print">
                        <td colSpan={4} className={`px-4 pb-3 pt-0 ${dark ? 'bg-black/10' : 'bg-slate-50/60'}`}>
                          <PeriodBreakdown periods={r.periods} date={r.date} lang={lang} dark={dark} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function WhatsAppShare({ student, name, stats, history, sectionLabel, t, lang, dark, inputCls }) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(student.parent_email || '');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);
  const [attachPdf, setAttachPdf] = useState(true);

  const dayName = (dateStr) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { weekday: 'long' }).format(new Date(`${dateStr}T00:00:00`));
  const rowIcon = (status) => (status === 'present' ? '✅' : status === 'absent' ? '❌' : status === 'late' ? '⏰' : status === 'excused' ? '📝' : '❔');

  const MAX_RECORD_LINES = 30;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const truncated = sorted.length > MAX_RECORD_LINES;
  const recordLines = sorted
    .slice(0, MAX_RECORD_LINES)
    .map((r) => `${rowIcon(r.status)} ${r.date} (${dayName(r.date)}) — ${t[STATUS_META[r.status]?.key] || r.status}`)
    .join('\n') + (truncated ? `\n${lang === 'ar' ? `... و${sorted.length - MAX_RECORD_LINES} سجل أقدم` : `... and ${sorted.length - MAX_RECORD_LINES} older record(s)`}` : '');

  const rateText = stats.rate == null ? '—' : `${stats.rate}%`;
  const message = lang === 'ar'
    ? `📋 تقرير حضور الطالب - ${t.school} - ${t.schoolSub}\n━━━━━━━━━━━━━━━━━━\n👤 الاسم: ${name}\n🔢 رقم الطالب: ${student.sis_no}\n🏫 الصف - الشعبة: ${sectionLabel}\n━━━━━━━━━━━━━━━━━━\n📊 نسبة الحضور: ${rateText}\n✅ أيام الحضور: ${stats.present}   ❌ أيام الغياب: ${stats.absent}   ⏰ أيام التأخير: ${stats.late}\n━━━━━━━━━━━━━━━━━━\n📅 السجل الكامل:\n${recordLines || '—'}\n━━━━━━━━━━━━━━━━━━\nيرجى مراجعة سجل الحضور والغياب الخاص بالطالب مع إدارة المدرسة.`
    : `📋 Attendance Report - ${t.school} - ${t.schoolSub}\n━━━━━━━━━━━━━━━━━━\n👤 Name: ${name}\n🔢 Student ID: ${student.sis_no}\n🏫 Grade - Section: ${sectionLabel}\n━━━━━━━━━━━━━━━━━━\n📊 Attendance rate: ${rateText}\n✅ Days present: ${stats.present}   ❌ Days absent: ${stats.absent}   ⏰ Days late: ${stats.late}\n━━━━━━━━━━━━━━━━━━\n📅 Full record:\n${recordLines || '—'}\n━━━━━━━━━━━━━━━━━━\nPlease reach out to the school administration for more details.`;

  const pdfBody = t.emailPdfBody
    .replace('{name}', name)
    .replace('{rate}', rateText)
    .replace('{present}', stats.present)
    .replace('{absent}', stats.absent)
    .replace('{late}', stats.late);

  const link = buildWhatsAppLink(phone, message);

  const sendEmail = async () => {
    setSendingEmail(true);
    setEmailMsg(null);
    let attachment;
    if (attachPdf) {
      try {
        attachment = {
          filename: `${reportName(name, student.sis_no, todayStr())}.pdf`,
          contentBase64: await sheetToPdfBase64(document.querySelector('.ps-sheet')),
        };
      } catch {
        setSendingEmail(false);
        setEmailMsg({ type: 'err', text: t.emailPdfError });
        return;
      }
    }
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: { studentId: student.id, to: email.trim(), message: attachment ? pdfBody : message, attachment },
    });
    setSendingEmail(false);
    if (error || (data && data.error)) {
      setEmailMsg({ type: 'err', text: emailErrorText(data, t) });
    } else {
      setEmailMsg({ type: 'ok', text: t.emailSent });
    }
  };

  return (
    <div className={cardFloating(dark, 'p-4 mb-5 space-y-4')}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.parentPhone}</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.parentPhonePlaceholder}
            className={`${inputCls} font-en`}
            dir="ltr"
          />
        </div>
        <a
          href={link || undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { if (!link) e.preventDefault(); }}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors whitespace-nowrap ${
            link ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 cursor-not-allowed'
          }`}
        >
          <MessageCircle size={15} /> {t.sendWhatsApp}
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.parentEmail}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="parent@example.com"
            className={`${inputCls} font-en`}
            dir="ltr"
          />
        </div>
        <button
          onClick={sendEmail}
          disabled={sendingEmail || !email.trim()}
          className="flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors whitespace-nowrap bg-royal hover:bg-royal-light disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sendingEmail ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} {t.sendEmail}
        </button>
      </div>
      <label className={`flex items-center gap-2 text-xs cursor-pointer ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
        <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} className="h-4 w-4 accent-royal" />
        {t.attachPdf}
      </label>
      {emailMsg && <p className={`text-xs ${emailMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{emailMsg.text}</p>}
    </div>
  );
}

function DeleteRecordsPanel({ student, t, lang, dark, inputCls, onDeleted }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState(null);

  const runDelete = async () => {
    setDeleting(true);
    setMsg(null);
    let query = supabase.from('attendance_records').delete().eq('student_id', student.id);
    if (fromDate) query = query.gte('date', fromDate);
    if (toDate) query = query.lte('date', toDate);
    // .select() returns the rows actually deleted — a delete the database
    // refuses (row-level security) comes back with no error and 0 rows, and
    // used to be reported as a success
    const { data: deleted, error } = await query.select('id');
    setDeleting(false);
    setConfirming(false);
    if (error) {
      setMsg({ type: 'err', text: t.saveError });
    } else if (!deleted || deleted.length === 0) {
      setMsg({ type: 'err', text: t.noRecordsDeleted });
    } else {
      setMsg({ type: 'ok', text: t.recordsDeleted });
      onDeleted && onDeleted();
    }
  };

  return (
    <div className={cardFloating(dark, 'p-4 mb-5 border-2 border-dashed border-rose-300 dark:border-rose-900')}>
      <div className="flex items-center gap-2 mb-1">
        <Trash2 size={15} className="text-rose-500" />
        <h3 className="text-sm font-semibold text-rose-500">{t.deleteRecordsTitle}</h3>
      </div>
      <p className={`text-xs mb-3 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.deleteRecordsSub}</p>

      {!confirming ? (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.fromDate} ({t.showAll})</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} font-en`} />
          </div>
          <div className="flex-1">
            <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.toDate} ({t.showAll})</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${inputCls} font-en`} />
          </div>
          <button
            onClick={() => setConfirming(true)}
            className="text-sm font-medium px-4 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors whitespace-nowrap"
          >
            {t.deleteRecordsBtn}
          </button>
        </div>
      ) : (
        <div className={`rounded-lg p-3 ${dark ? 'bg-rose-500/10' : 'bg-rose-50'}`}>
          <p className="text-sm font-medium text-rose-600 mb-3">
            {fromDate || toDate ? t.confirmDeleteRange : t.confirmDeleteAll}
          </p>
          <div className="flex gap-2">
            <button onClick={runDelete} disabled={deleting} className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-60">
              {deleting && <Loader2 size={14} className="animate-spin" />} {t.confirmYesDelete}
            </button>
            <button onClick={() => setConfirming(false)} className={`text-sm font-medium px-4 py-2 rounded-lg border ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {msg && <p className={`text-xs mt-2 ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{msg.text}</p>}
    </div>
  );
}

function InfoItem({ dark, label, value, valueColor }) {
  return (
    <div className="min-w-0">
      <div className={`text-xs mb-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{label}</div>
      <div className="text-sm font-semibold break-words" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
    </div>
  );
}
