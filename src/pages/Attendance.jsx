import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, X, Clock3, FileWarning, Users, Loader2, Search } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { useDialogs } from '../lib/Dialogs';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { sectionsFor, sectionLabel } from '../lib/sections';
import { fetchAllRows } from '../lib/fetchAll';
import { periodsForDate } from '../lib/attendanceDerive';
import { searchStudents } from '../lib/search';
import { nonSchoolDay } from '../lib/schoolCalendar';
import SectionPicker from '../components/SectionPicker';

const STATUS_OPTIONS = [
  { value: 'present', key: 'statusPresent', icon: Check, color: 'emerald' },
  { value: 'absent', key: 'statusAbsent', icon: X, color: 'rose' },
  { value: 'late', key: 'statusLate', icon: Clock3, color: 'amber' },
  { value: 'excused', key: 'statusExcused', icon: FileWarning, color: 'violet' },
];

const STATUS_STYLES = {
  emerald: { onLight: 'bg-emerald-500 text-white', onDark: 'bg-emerald-500 text-white', off: '' },
  rose: { onLight: 'bg-rose-500 text-white', onDark: 'bg-rose-500 text-white', off: '' },
  amber: { onLight: 'bg-amber-500 text-white', onDark: 'bg-amber-500 text-white', off: '' },
  violet: { onLight: 'bg-violet-500 text-white', onDark: 'bg-violet-500 text-white', off: '' },
};

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// Marks that were not saved yet survive the page being reloaded or the browser
// discarding the tab (kept in sessionStorage, dropped when the user leaves).
const DRAFT_KEY = 'madrasati-attendance-draft';
function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || null; } catch { return null; }
}
function writeDraft(value) {
  try {
    if (value) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch { /* storage unavailable */ }
}

export default function Attendance() {
  const { t, lang, dark, staff, setHasUnsaved } = useApp();
  const { confirm } = useDialogs();
  const location = useLocation();
  // Coming from the recorder dashboard's "my sections" card (a specific
  // section's "Record attendance" button) hands us that section directly, so
  // the picker below can be pre-filled instead of making the teacher pick
  // the grade/stream/section all over again — they just choose the period.
  const incomingSectionId = location.state?.sectionId;
  const appliedIncomingRef = useRef(false);

  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [draft] = useState(() => (incomingSectionId ? null : readDraft()));
  const [grade, setGrade] = useState(draft?.grade ?? '');
  const [stream, setStream] = useState(draft?.stream ?? '');
  const [sectionSel, setSectionSel] = useState(draft?.sectionSel ?? ''); // section_id or '__ALL__'
  const [date, setDate] = useState(draft?.date ?? todayStr());
  const [period, setPeriod] = useState(draft?.period ?? '');

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [statusMap, setStatusMap] = useState({}); // student_id -> status
  const [savedStatusMap, setSavedStatusMap] = useState({}); // last-saved snapshot, for dirty check
  const [recordMap, setRecordMap] = useState({}); // student_id -> attendance_records.id

  const draftRef = useRef(draft);
  // for one chosen section: which periods of the day are already fully recorded
  const [periodDone, setPeriodDone] = useState({});
  const [saving, setSaving] = useState(false);
  // find one student quickly in a long list — display only, it never changes what is saved
  const [rosterQuery, setRosterQuery] = useState('');
  useEffect(() => { setRosterQuery(''); }, [sectionSel, period, date]); // a new list starts unfiltered
  const [saveMsg, setSaveMsg] = useState(null); // { type: 'ok' | 'err', text }

  // load sections once — a recorder (teacher) only sees the sections
  // they've been assigned by the admin (staff_sections)
  useEffect(() => {
    if (!staff) return;
    (async () => {
      setSectionsLoading(true);
      const { data } = await supabase
        .from('sections')
        .select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
      let list = data || [];
      // a supervisor now also takes attendance, scoped to the sections
      // they've been assigned — same mechanism as a recorder (teacher).
      if (staff.role === 'recorder' || staff.role === 'supervisor' || staff.role === 'edari') {
        const { data: assigned } = await supabase.from('staff_sections').select('section_id').eq('staff_id', staff.id);
        const allowed = new Set((assigned || []).map((a) => a.section_id));
        list = list.filter((s) => allowed.has(s.id));
      }
      setSections(list);
      setSectionsLoading(false);
    })();
  }, [staff?.id, staff?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply the section handed to us from the recorder dashboard, once —
  // after that the picker is fully under the teacher's own control again.
  useEffect(() => {
    if (appliedIncomingRef.current || sectionsLoading || !incomingSectionId) return;
    const target = sections.find((s) => s.id === incomingSectionId);
    if (target) {
      setGrade(target.grade_name);
      setStream(target.stream || '');
      setSectionSel(target.id);
    }
    appliedIncomingRef.current = true;
  }, [sectionsLoading, incomingSectionId, sections]);

  // resolved list of section ids to load students/attendance for
  const activeSectionIds = useMemo(() => {
    if (!grade) return [];
    if (sectionSel && sectionSel !== '__ALL__') return [sectionSel];
    return sectionsFor(sections, grade, stream).map((s) => s.id);
  }, [sections, grade, stream, sectionSel]);

  const sectionMap = useMemo(() => {
    const m = {};
    sections.forEach((s) => { m[s.id] = s; });
    return m;
  }, [sections]);

  // period buttons: a period counts as recorded once every student of the
  // section has a record for it that day
  const singleSectionId = sectionSel && sectionSel !== '__ALL__' ? sectionSel : null;
  const [periodsReload, setPeriodsReload] = useState(0);
  useEffect(() => {
    if (!singleSectionId) { setPeriodDone({}); return undefined; }
    let cancelled = false;
    (async () => {
      const { data: studs } = await supabase.from('students').select('id').eq('section_id', singleSectionId).eq('is_active', true);
      const ids = (studs || []).map((x) => x.id);
      if (ids.length === 0) { if (!cancelled) setPeriodDone({}); return; }
      const { data: recs } = await fetchAllRows(() => supabase
        .from('attendance_records').select('id, student_id, period').eq('date', date).in('student_id', ids).order('id'));
      const per = {};
      (recs || []).forEach((r) => {
        if (r.period == null) return;
        if (!per[r.period]) per[r.period] = new Set();
        per[r.period].add(r.student_id);
      });
      const done = {};
      Object.keys(per).forEach((p) => { done[p] = per[p].size >= ids.length ? 'done' : 'partial'; });
      if (!cancelled) setPeriodDone(done);
    })();
    return () => { cancelled = true; };
  }, [singleSectionId, date, periodsReload]);

  // load students + existing attendance whenever section(s), date, or period changes
  const loadRoster = useCallback(async () => {
    if (activeSectionIds.length === 0 || !period) {
      setStudents([]);
      setStatusMap({});
      setRecordMap({});
      return;
    }
    setStudentsLoading(true);
    setSaveMsg(null);

    // Fetch the roster and that day/period's existing records in parallel
    // instead of one after the other — the records query doesn't actually
    // need the roster's student ids first, since it's already scoped by
    // date + period + school, so there's no reason to wait on the roster
    // query before starting it. This was the main cause of "opening a saved
    // section to edit it takes a while": two sequential round trips where
    // one is enough.
    const [{ data: studs }, { data: existing }] = await Promise.all([
      supabase
        .from('students')
        .select('id, sis_no, name_ar, name_en, section_id')
        .in('section_id', activeSectionIds)
        .eq('is_active', true)
        .order('name_ar', { ascending: true }),
      // school-wide for this date/period — in a school with more than 1000
      // students a single request is silently cut off at the row cap, which
      // made some already-saved students look "present" and get inserted
      // again on save. Page through all of them instead.
      fetchAllRows(() => supabase
        .from('attendance_records')
        .select('id, student_id, status')
        .eq('date', date)
        .eq('period', period)
        .eq('school_id', staff.school_id)
        .order('id')),
    ]);

    const list = studs || [];
    setStudents(list);

    if (list.length > 0) {
      const idSet = new Set(list.map((s) => s.id));
      const sMap = {};
      const rMap = {};
      list.forEach((s) => { sMap[s.id] = 'present'; });
      // existing records are for the whole school on this date/period, so
      // keep only the ones that belong to a student actually in this roster
      (existing || []).filter((rec) => idSet.has(rec.student_id)).forEach((rec) => {
        sMap[rec.student_id] = rec.status;
        rMap[rec.student_id] = rec.id;
      });
      // put back marks that were not saved when the page was reloaded
      const d = draftRef.current;
      draftRef.current = null;
      let shown = sMap;
      if (d && d.statusMap && d.key === `${date}|${period}|${activeSectionIds.join(',')}`) {
        shown = { ...sMap };
        Object.keys(d.statusMap).forEach((id) => { if (idSet.has(Number(id)) || idSet.has(id)) shown[id] = d.statusMap[id]; });
      }
      setStatusMap(shown);
      setSavedStatusMap(sMap);
      setRecordMap(rMap);
    } else {
      setStatusMap({});
      setSavedStatusMap({});
      setRecordMap({});
    }
    setStudentsLoading(false);
  }, [activeSectionIds, date, period, staff]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  // warn before closing/refreshing the tab with unsaved changes
  const isDirty = JSON.stringify(statusMap) !== JSON.stringify(savedStatusMap);
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // keep the draft current (filters always, marks only while unsaved)
  useEffect(() => {
    if (sectionsLoading) return;
    writeDraft({
      grade, stream, sectionSel, date, period,
      key: `${date}|${period}|${activeSectionIds.join(',')}`,
      statusMap: isDirty ? statusMap : null,
    });
  }, [grade, stream, sectionSel, date, period, activeSectionIds, statusMap, isDirty, sectionsLoading]);
  // leaving the page on purpose (already confirmed) drops the draft
  useEffect(() => () => writeDraft(null), []);

  // let the sidebar/header links ask before leaving the page with unsaved edits
  useEffect(() => {
    setHasUnsaved(isDirty);
  }, [isDirty, setHasUnsaved]);
  useEffect(() => () => setHasUnsaved(false), [setHasUnsaved]);

  // changing the section, period or date reloads the roster and drops any
  // unsaved marks — ask first instead of losing them silently. Once the user
  // agrees, the edits are treated as discarded, so a follow-up automatic
  // change (the picker auto-selecting a grade's only stream) doesn't ask twice.
  const guarded = (fn) => async (...args) => {
    if (isDirty) {
      if (!(await confirm(t.unsavedLeaveConfirm))) return;
      setSavedStatusMap(statusMap);
      setHasUnsaved(false);
    }
    fn(...args);
  };

  const setStatus = (studentId, status) => {
    setStatusMap((m) => ({ ...m, [studentId]: status }));
  };

  const markAllAs = (status) => {
    setStatusMap((m) => {
      const next = { ...m };
      students.forEach((s) => { next[s.id] = status; });
      return next;
    });
  };

  const handleSave = async () => {
    if (!students.length || !staff) return;
    setSaving(true);
    setSaveMsg(null);

    const toInsert = [];
    const toUpdate = [];

    students.forEach((s) => {
      const status = statusMap[s.id] || 'present';
      const existingId = recordMap[s.id];
      if (existingId) {
        toUpdate.push({ id: existingId, student_id: s.id, status });
      } else {
        toInsert.push({
          school_id: staff.school_id,
          student_id: s.id,
          date,
          period: Number(period),
          status,
          recorded_by: staff.id,
        });
      }
    });

    let hadError = false;
    let debugMsg = '';

    if (toInsert.length) {
      const { error } = await supabase.from('attendance_records').insert(toInsert);
      if (error) { hadError = true; debugMsg = `INSERT: ${error.message} (code: ${error.code || '—'})`; }
    }

    // only rows whose status actually changed, grouped by status — one
    // request per status (at most 4) instead of one request per student
    const changedByStatus = {};
    toUpdate
      .filter((u) => u.status !== savedStatusMap[u.student_id])
      .forEach((u) => {
        if (!changedByStatus[u.status]) changedByStatus[u.status] = [];
        changedByStatus[u.status].push(u.id);
      });
    for (const [status, ids] of Object.entries(changedByStatus)) {
      const { error } = await supabase
        .from('attendance_records')
        .update({ status })
        .in('id', ids);
      if (error) { hadError = true; debugMsg = `UPDATE: ${error.message} (code: ${error.code || '—'})`; }
    }

    setSaving(false);
    if (hadError) {
      console.error('Attendance save error:', debugMsg);
      setSaveMsg({ type: 'err', text: t.saveError });
    } else {
      setSaveMsg({ type: 'ok', text: t.savedSuccess });
      setPeriodsReload((n) => n + 1);
      loadRoster();
    }
  };

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.attendanceTitle}</h1>
          </motion.div>

          {/* controls */}
          <div className={cardFloating(dark, 'p-5 mb-6 space-y-4')}>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                {t.chooseSection}
              </label>
              <SectionPicker
                sections={sections}
                lang={lang}
                dark={dark}
                grade={grade}
                stream={stream}
                sectionId={sectionSel}
                allowAll
                onGradeChange={guarded((g) => { setGrade(g); setStream(''); setSectionSel(''); })}
                onStreamChange={guarded((s) => { setStream(s); setSectionSel(''); })}
                onSectionChange={guarded(setSectionSel)}
                inputCls={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
                  dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <div className="sm:w-40">
                <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                  {t.periodLabel}
                </label>
                <select
                  value={period}
                  onChange={(e) => guarded(setPeriod)(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border font-en ${
                    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <option value="">{t.choosePeriod}</option>
                  {[...Array(periodsForDate(date))].map((_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>{t.periodN.replace('{n}', p)}</option>
                  ))}
                </select>
              </div>

              <div className="sm:w-56">
                <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                  {t.dateLabel}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => guarded((d) => { setDate(d); if (period && Number(period) > periodsForDate(d)) setPeriod(''); })(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border font-en ${
                    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                />
              </div>

              {nonSchoolDay(date, lang) && (
                <p className={`text-xs rounded-lg px-3 py-2 self-center ${dark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
                  {t.notSchoolDayNote.replace('{name}', nonSchoolDay(date, lang).name)}
                </p>
              )}

              {students.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => markAllAs('present')}
                    className="text-xs font-medium px-4 py-2.5 rounded-lg border border-transparent bg-emerald-500 hover:bg-emerald-600 text-white transition-colors whitespace-nowrap"
                  >
                    {t.markAllPresent}
                  </button>
                  <button
                    onClick={() => markAllAs('absent')}
                    className="text-xs font-medium px-4 py-2.5 rounded-lg border border-transparent bg-rose-500 hover:bg-rose-600 text-white transition-colors whitespace-nowrap"
                  >
                    {t.markAllAbsent}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-royal hover:bg-royal-light text-white text-xs font-medium px-4 py-2.5 transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {saving ? t.saving : t.saveAttendance}
                  </button>
                  {saveMsg && (
                    <span className={`text-xs ${saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {saveMsg.text}
                    </span>
                  )}
                  {!saveMsg && isDirty && (
                    <span className={`text-xs ${dark ? 'text-amber-400' : 'text-amber-600'}`}>{t.unsavedChanges}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* one tap on the period: shown as soon as a single section is chosen */}
          {singleSectionId && (
            <div className={cardFloating(dark, 'p-4 mb-6')}>
              <div className={`text-xs font-medium mb-2.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.quickPeriodTitle}</div>
              <div className="flex flex-wrap gap-2">
                {[...Array(periodsForDate(date))].map((_, i) => i + 1).map((p) => {
                  const state = periodDone[p];
                  const on = String(period) === String(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => { if (!on) guarded(setPeriod)(String(p)); }}
                      className={`h-11 min-w-[3.25rem] px-3 rounded-xl border text-sm font-semibold font-en flex items-center justify-center gap-1.5 transition-colors ${
                        on
                          ? 'bg-royal border-royal text-white'
                          : state === 'done'
                            ? (dark ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700')
                            : state === 'partial'
                              ? (dark ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-amber-300 bg-amber-50 text-amber-700')
                              : (dark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-50')
                      }`}
                    >
                      {state === 'done' && !on && <Check size={14} />}
                      {p}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[11px] mt-2 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{t.quickPeriodHint}</p>
            </div>
          )}

          {/* roster */}
          {activeSectionIds.length === 0 || !period ? (
            <div className={cardFloating(dark, 'p-10 text-center')}>
              <Users size={28} className={`mx-auto mb-3 ${dark ? 'text-slate-200' : 'text-slate-300'}`} />
              <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                {activeSectionIds.length === 0 ? t.chooseSectionPrompt : t.choosePeriodPrompt}
              </p>
            </div>
          ) : studentsLoading || sectionsLoading ? (
            <div className={cardFloating(dark, 'p-5 space-y-3')}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className={skeleton(dark, 'h-12 w-full')} />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className={cardFloating(dark, 'p-10 text-center')}>
              <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noStudentsInSection}</p>
            </div>
          ) : (
            <div className={cardFloating(dark, 'overflow-hidden')}>
              <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
                <Search size={16} className={dark ? 'text-royal-light' : 'text-royal'} />
                <input
                  type="search"
                  value={rosterQuery}
                  onChange={(e) => setRosterQuery(e.target.value)}
                  placeholder={t.attendanceSearchPlaceholder}
                  className={`flex-1 bg-transparent outline-none text-sm py-1 ${dark ? 'text-slate-100 placeholder:text-slate-400' : 'text-slate-800 placeholder:text-slate-400'}`}
                />
                {rosterQuery.trim() && (
                  <button type="button" onClick={() => setRosterQuery('')} className={`text-xs font-medium ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.closeBtn}</button>
                )}
              </div>
              {rosterQuery.trim() && searchStudents(students, rosterQuery).length === 0 && (
                <p className={`px-4 py-6 text-center text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.attendanceNoMatch}</p>
              )}
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {/* Students already saved as absent/late/excused float to the top, so a
                    late arrival can be found and corrected without scrolling through
                    everyone who's simply present. Sorted by the last-saved status, not
                    the live one — otherwise a row jumps to the top the moment it's
                    tapped and the teacher's next tap lands on the wrong student.
                    While a search is typed, only the matching students are listed
                    (best matches first); the other students keep their status. */}
                {(rosterQuery.trim() ? searchStudents(students, rosterQuery) : [...students].sort((a, b) => {
                  const aFlagged = (savedStatusMap[a.id] || 'present') !== 'present';
                  const bFlagged = (savedStatusMap[b.id] || 'present') !== 'present';
                  return aFlagged === bFlagged ? 0 : aFlagged ? -1 : 1;
                })).map((s) => {
                  const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                  const current = statusMap[s.id] || 'present';
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold shrink-0">
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{name}</div>
                        {sectionSel === '__ALL__' && (
                          <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                            {sectionLabel(sectionMap[s.section_id], lang)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {STATUS_OPTIONS.map((opt) => {
                          const Icon = opt.icon;
                          const active = current === opt.value;
                          const styles = STATUS_STYLES[opt.color];
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setStatus(s.id, opt.value)}
                              className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg transition-colors border text-xs font-medium ${
                                active
                                  ? `${dark ? styles.onDark : styles.onLight} border-transparent`
                                  : dark
                                  ? 'border-slate-700 text-slate-500 hover:bg-white/5'
                                  : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                              }`}
                            >
                              <Icon size={13} />
                              <span className="hidden sm:inline">{t[opt.key]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className={`flex items-center justify-between gap-4 px-4 py-3.5 border-t ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className="flex items-center gap-3">
                <div className="text-xs">
                  {saveMsg && (
                    <span className={saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}>
                      {saveMsg.text}
                    </span>
                  )}
                  {!saveMsg && isDirty && (
                    <span className={dark ? 'text-amber-400' : 'text-amber-600'}>{t.unsavedChanges}</span>
                  )}
                </div>
              </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-royal hover:bg-royal-light text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
                >
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {saving ? t.saving : t.saveAttendance}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
