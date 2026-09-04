import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, Flag, Printer, Check, X, Clock3, FileWarning, ShieldCheck, MessageCircle, Trash2, Loader2, Mail, RefreshCw } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { matchesStudentSearch } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import { buildWhatsAppLink } from '../lib/whatsapp';
import SectionPicker from '../components/SectionPicker';

const STATUS_META = {
  present: { key: 'statusPresent', icon: Check, color: '#05cd99' },
  absent: { key: 'statusAbsent', icon: X, color: '#ee5d50' },
  late: { key: 'statusLate', icon: Clock3, color: '#ffb800' },
  excused: { key: 'statusExcused', icon: FileWarning, color: '#8b5cf6' },
};

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function dayName(dateStr, lang) {
  const d = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { weekday: 'long' }).format(d);
}

// group raw period-level attendance rows into one derived status per day.
// Rule: 3+ periods marked absent on a date => the whole day counts as absent.
// Lateness never affects the day-level status. Legacy rows (period is null,
// from before per-period recording existed) are used as-is.
function deriveDayRecords(rawRecords) {
  const byDate = new Map();
  rawRecords.forEach((r) => {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  });

  const days = [];
  byDate.forEach((rows, date) => {
    const legacy = rows.find((r) => r.period == null);
    if (legacy) {
      days.push({ date, status: legacy.status, periods: rows });
      return;
    }
    const absentCount = rows.filter((r) => r.status === 'absent').length;
    const lateCount = rows.filter((r) => r.status === 'late').length;
    const status = absentCount >= 3 ? 'absent' : 'present';
    days.push({ date, status, absentCount, lateCount, periods: rows });
  });

  return days.sort((a, b) => b.date.localeCompare(a.date));
}

// red-flag: >=20% absence, or 3+ consecutive absent days (by chronological order)
function isFrequentAbsence(records) {
  if (!records.length) return false;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  if (absentCount / records.length >= 0.2) return true;

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
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [sectionSel, setSectionSel] = useState(''); // section_id or '__ALL__'

  const [selected, setSelected] = useState(null); // student row
  const [history, setHistory] = useState([]); // all records for selected student
  const [historyLoading, setHistoryLoading] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('sections')
        .select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
      setSections(data || []);
    })();
  }, []);

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
      return q ? sectionRoster.filter((s) => matchesStudentSearch(s, q)) : sectionRoster;
    }
    return globalMatches;
  }, [sectionRoster, globalMatches, query]);

  const runSearch = async () => {
    const q = query.trim();
    if (sectionRoster !== null) return; // already live-filtered above, nothing to fetch
    if (!q) { setGlobalMatches(null); return; }
    setSearching(true);
    const { data } = await fetchAllRows(() => supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, email, parent_email, emirates_id, moe_username, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)'));
    const matched = (data || []).filter((s) => matchesStudentSearch(s, q));
    matched.sort((a, b) => (a.sections?.grade_order ?? 999) - (b.sections?.grade_order ?? 999));
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
    const total = filteredHistory.length;
    const present = filteredHistory.filter((r) => r.status === 'present').length;
    const absent = filteredHistory.filter((r) => r.status === 'absent').length;
    const excused = filteredHistory.filter((r) => r.status === 'excused').length;
    const late = filteredHistory.filter((r) => r.status === 'late' || r.lateCount > 0).length;
    // excused days don't count against the attendance rate, same as most school policies
    const ratable = total - excused;
    const rate = ratable > 0 ? Math.round((present / ratable) * 100) : 100;
    return { total, present, absent, excused, late, rate };
  }, [filteredHistory]);

  const flagged = isFrequentAbsence(filteredHistory);
  const rateColor = stats.rate >= 90 ? '#05cd99' : stats.rate >= 75 ? '#ffb800' : '#ee5d50';

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border font-en ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-4xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.lookupTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.lookupSub}</p>
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
                      <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.lookupNoResults}</p>
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
                                  <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{lang === 'ar' ? 'رقم الطالب' : 'ID'}: {s.sis_no}</div>
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
              onOverrideSaved={() => openProfile(selected)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function StudentProfileCard({
  student, t, lang, dark, staff, history, historyLoading, stats, rateColor, flagged,
  fromDate, toDate, setFromDate, setToDate, inputCls, onBack, onOverrideSaved,
}) {
  const name = lang === 'ar' ? (student.name_ar || student.name_en) : (student.name_en || student.name_ar);
  const canOverride = staff && (staff.role === 'admin' || staff.role === 'viewer');
  const isAdmin = staff && staff.role === 'admin';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={onBack} className={`flex items-center gap-1.5 text-xs font-medium mb-4 no-print ${dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
        <ArrowRight size={14} className={lang === 'ar' ? '' : 'rotate-180'} /> {t.backToResults}
      </button>

      <div className="print-only mb-4 text-black">
        <h1 className="text-lg font-bold">{t.school} — {t.schoolSub}</h1>
        <h2 className="text-base font-semibold mt-0.5">{t.lookupTitle}</h2>
      </div>

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
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500">
                    <Flag size={11} /> {t.frequentAbsence}
                  </span>
                )}
              </div>
              <div className={`text-xs mt-0.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {fmtSectionLabel(student.sections, lang)}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center text-sm font-bold border-4"
              style={{ borderColor: rateColor, color: rateColor }}
            >
              {stats.rate}%
            </div>
            <div className={`text-[11px] mt-1 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.attendanceRate}</div>
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

      {canOverride && (
        <div className="no-print">
          <OverridePanel student={student} staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls} onSaved={onOverrideSaved} />
        </div>
      )}

      {/* period filter */}
      <div className={cardFloating(dark, 'p-4 mb-5 flex flex-col sm:flex-row gap-3 sm:items-end no-print')}>
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.fromDate}</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.toDate}</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
        </div>
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(''); setToDate(''); onOverrideSaved && onOverrideSaved(); }} className={`text-xs font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            {t.showAll}
          </button>
        )}
        <button onClick={() => onOverrideSaved && onOverrideSaved()} className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
          <RefreshCw size={14} /> {t.refresh}
        </button>
        <button onClick={() => window.print()} className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
          <Printer size={14} /> {t.printReport}
        </button>
      </div>

      <div className="no-print">
        <WhatsAppShare student={student} name={name} stats={stats} history={history} sectionLabel={fmtSectionLabel(student.sections, lang)} fromDate={fromDate} toDate={toDate} t={t} lang={lang} dark={dark} inputCls={inputCls} />
      </div>

      {isAdmin && (
        <div className="no-print">
          <DeleteRecordsPanel student={student} t={t} lang={lang} dark={dark} inputCls={inputCls} onDeleted={onOverrideSaved} />
        </div>
      )}

      {/* history table */}
      <div className={cardFloating(dark, 'overflow-hidden')}>
        {historyLoading ? (
          <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className={skeleton(dark, 'h-10 w-full')} />)}</div>
        ) : history.length === 0 ? (
          <div className="p-10 text-center">
            <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noAttendanceRecords}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                <th className="text-start font-medium px-4 py-3">{t.recordDate}</th>
                <th className="text-start font-medium px-4 py-3">{t.recordDay}</th>
                <th className="text-start font-medium px-4 py-3">{t.recordStatus}</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
              {history.map((r) => {
                const meta = STATUS_META[r.status] || STATUS_META.present;
                const Icon = meta.icon;
                const hasNote = (r.absentCount > 0 || r.lateCount > 0) && r.status === 'present';
                return (
                  <tr key={r.date}>
                    <td className="px-4 py-2.5 font-en">{r.date}</td>
                    <td className="px-4 py-2.5">{dayName(r.date, lang)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                        <Icon size={13} /> {t[meta.key]}
                      </span>
                      {hasNote && (
                        <span className={`ms-2 text-[11px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {t.periodNote
                            .replace('{absent}', r.absentCount || 0)
                            .replace('{late}', r.lateCount || 0)}
                        </span>
                      )}
                    </td>
                  </tr>
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

function OverridePanel({ student, staff, t, lang, dark, inputCls, onSaved }) {
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [existingOverride, setExistingOverride] = useState(undefined); // undefined = unchecked, null = none, object = found

  useEffect(() => {
    let cancelled = false;
    setExistingOverride(undefined);
    (async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('id, status')
        .eq('student_id', student.id)
        .eq('date', date)
        .is('period', null)
        .maybeSingle();
      if (!cancelled) setExistingOverride(data || null);
    })();
    return () => { cancelled = true; };
  }, [student.id, date]);

  const setFinal = async (status) => {
    setSaving(true);
    setMsg(null);

    let error;
    if (existingOverride) {
      ({ error } = await supabase.from('attendance_records').update({ status }).eq('id', existingOverride.id));
    } else {
      ({ error } = await supabase.from('attendance_records').insert({
        school_id: staff.school_id,
        student_id: student.id,
        date,
        period: null,
        status,
        recorded_by: staff.id,
      }));
    }

    setSaving(false);
    if (error) {
      console.error('Override/record save error:', error); setMsg({ type: 'err', text: 'DEBUG: ' + error.message + ' (code: ' + (error.code || '—') + ')' });
    } else {
      setMsg({ type: 'ok', text: t.overrideSaved });
      setExistingOverride({ status });
      onSaved && onSaved();
    }
  };

  const removeOverride = async () => {
    if (!existingOverride) return;
    setSaving(true);
    setMsg(null);
    const { error } = await supabase.from('attendance_records').delete().eq('id', existingOverride.id);
    setSaving(false);
    if (error) {
      console.error('Override/record save error:', error); setMsg({ type: 'err', text: 'DEBUG: ' + error.message + ' (code: ' + (error.code || '—') + ')' });
    } else {
      setMsg({ type: 'ok', text: t.overrideRemoved });
      setExistingOverride(null);
      onSaved && onSaved();
    }
  };

  return (
    <div className={cardFloating(dark, 'p-4 mb-5 border-2 border-dashed')}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={15} className={dark ? 'text-gold' : 'text-amber-600'} />
        <h3 className="text-sm font-semibold">{t.overrideTitle}</h3>
      </div>
      <p className={`text-xs mb-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.overrideSub}</p>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="sm:w-48">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.dateLabel}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <button
          onClick={() => setFinal('absent')}
          disabled={saving}
          className="text-sm font-medium px-4 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-60"
        >
          {t.markFinalAbsent}
        </button>
        <button
          onClick={() => setFinal('present')}
          disabled={saving}
          className="text-sm font-medium px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-60"
        >
          {t.markFinalPresent}
        </button>
        {existingOverride && (
          <button
            onClick={removeOverride}
            disabled={saving}
            className={`text-sm font-medium px-4 py-2.5 rounded-lg border transition-colors disabled:opacity-60 ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
          >
            {t.removeOverride}
          </button>
        )}
      </div>
      {existingOverride && (
        <p className={`text-xs mt-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          {t.currentOverrideIs} <strong>{t[STATUS_META[existingOverride.status]?.key]}</strong>
        </p>
      )}
      {msg && (
        <p className={`text-xs mt-2 ${msg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{msg.text}</p>
      )}
    </div>
  );
}

function WhatsAppShare({ student, name, stats, history, sectionLabel, t, lang, dark, inputCls }) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(student.parent_email || '');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  const dayName = (dateStr) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { weekday: 'long' }).format(new Date(`${dateStr}T00:00:00`));
  const rowIcon = (status) => (status === 'present' ? '✅' : status === 'absent' ? '❌' : status === 'late' ? '⏰' : status === 'excused' ? '📝' : '❔');

  const MAX_RECORD_LINES = 30;
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const truncated = sorted.length > MAX_RECORD_LINES;
  const recordLines = sorted
    .slice(0, MAX_RECORD_LINES)
    .map((r) => `${rowIcon(r.status)} ${r.date} (${dayName(r.date)}) — ${t[STATUS_META[r.status]?.key] || r.status}`)
    .join('\n') + (truncated ? `\n${lang === 'ar' ? `... و${sorted.length - MAX_RECORD_LINES} سجل أقدم` : `... and ${sorted.length - MAX_RECORD_LINES} older record(s)`}` : '');

  const message = lang === 'ar'
    ? `📋 تقرير حضور الطالب - ${t.school} - ${t.schoolSub}\n━━━━━━━━━━━━━━━━━━\n👤 الاسم: ${name}\n🔢 رقم الطالب: ${student.sis_no}\n🏫 الصف - الشعبة: ${sectionLabel}\n━━━━━━━━━━━━━━━━━━\n📊 نسبة الحضور: ${stats.rate}%\n✅ أيام الحضور: ${stats.present}   ❌ أيام الغياب: ${stats.absent}   ⏰ أيام التأخير: ${stats.late}\n━━━━━━━━━━━━━━━━━━\n📅 السجل الكامل:\n${recordLines || '—'}\n━━━━━━━━━━━━━━━━━━\nيرجى مراجعة سجل الحضور والغياب الخاص بالطالب مع إدارة المدرسة.`
    : `📋 Attendance Report - ${t.school} - ${t.schoolSub}\n━━━━━━━━━━━━━━━━━━\n👤 Name: ${name}\n🔢 Student ID: ${student.sis_no}\n🏫 Grade - Section: ${sectionLabel}\n━━━━━━━━━━━━━━━━━━\n📊 Attendance rate: ${stats.rate}%\n✅ Days present: ${stats.present}   ❌ Days absent: ${stats.absent}   ⏰ Days late: ${stats.late}\n━━━━━━━━━━━━━━━━━━\n📅 Full record:\n${recordLines || '—'}\n━━━━━━━━━━━━━━━━━━\nPlease reach out to the school administration for more details.`;

  const link = buildWhatsAppLink(phone, message);

  const sendEmail = async () => {
    setSendingEmail(true);
    setEmailMsg(null);
    const { data, error } = await supabase.functions.invoke('send-report-email', {
      body: { studentId: student.id, to: email.trim(), message },
    });
    setSendingEmail(false);
    if (error || (data && data.error)) {
      setEmailMsg({ type: 'err', text: t.emailSendError });
    } else {
      setEmailMsg({ type: 'ok', text: t.emailSent });
    }
  };

  return (
    <div className={cardFloating(dark, 'p-4 mb-5 space-y-4')}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.parentPhone}</label>
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
          <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.parentEmail}</label>
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
    const { error } = await query;
    setDeleting(false);
    setConfirming(false);
    if (error) {
      setMsg({ type: 'err', text: t.saveError });
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
      <p className={`text-xs mb-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.deleteRecordsSub}</p>

      {!confirming ? (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.fromDate} ({t.showAll})</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} font-en`} />
          </div>
          <div className="flex-1">
            <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.toDate} ({t.showAll})</label>
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
      <div className={`text-[11px] mb-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{label}</div>
      <div className="text-sm font-semibold break-words" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
    </div>
  );
}
