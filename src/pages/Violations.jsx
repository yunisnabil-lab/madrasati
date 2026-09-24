import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Trash2, AlertTriangle, Inbox, Check, X } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { matchesStudentSearch } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import { VIOLATION_TYPE_KEYS } from '../lib/i18n';
import { shownSubjects, namesOf } from '../lib/staffInfo';
import SectionPicker from '../components/SectionPicker';
import ContactParentPanel from '../components/ContactParentPanel';

const REPEAT_THRESHOLD = 3;

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

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

export default function Violations() {
  const { t, lang, dark, staff } = useApp();
  const canManage = staff && (staff.role === 'admin' || staff.role === 'supervisor' || staff.role === 'edari');
  // A teacher (recorder) reports violations for students in their own
  // sections; each report waits as "pending" until the supervisor (or the
  // admin) approves it — only then does it count in lists and reports and
  // can the parent be contacted about it.
  const isRecorder = staff?.role === 'recorder';
  const canReview = staff && (staff.role === 'admin' || staff.role === 'supervisor');
  const canReport = canManage || isRecorder;

  const [pendingList, setPendingList] = useState(null); // reports awaiting review
  const [reviewingId, setReviewingId] = useState(null);
  const [myReports, setMyReports] = useState(null); // recorder: what I reported
  const [approvedViolation, setApprovedViolation] = useState(null); // just approved -> prefill parent message
  // admin/supervisor land on the contact panel first; the "report a
  // violation" form stays folded behind a button unless they ask for it.
  // A recorder came here specifically to report, so it starts open for them.
  const [showReportForm, setShowReportForm] = useState(false);
  const [editingActionId, setEditingActionId] = useState(null);
  const [actionDraft, setActionDraft] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  const [sections, setSections] = useState([]);
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [sectionSel, setSectionSel] = useState('');
  const [sectionRoster, setSectionRoster] = useState(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState(null);
  const [selected, setSelected] = useState(null);

  const [violationType, setViolationType] = useState('');
  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState('');
  const [affectedQuery, setAffectedQuery] = useState('');
  const [affectedMatches, setAffectedMatches] = useState([]);
  const [affectedStudent, setAffectedStudent] = useState(null);
  const [teacherAction, setTeacherAction] = useState('');
  const [supervisorAction, setSupervisorAction] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const allStudentsRef = useRef(null);

  const [studentViolations, setStudentViolations] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Filterable-by-day list with a per-student repeat count, so repeat
  // offenders surface at the top instead of being buried in a flat feed —
  // mirrors the same pattern already used on the Lateness page.
  const [fromDate, setFromDate] = useState(daysAgoStr(30));
  const [toDate, setToDate] = useState(todayStr());
  const [aggLoading, setAggLoading] = useState(true);
  const [aggRows, setAggRows] = useState([]);

  const loadAggregate = useCallback(async (from, to) => {
    setAggLoading(true);
    const { data } = await fetchAllRows(() => {
      let q = supabase
        .from('behavior_violations')
        // qualified with the explicit FK name: behavior_violations now has a
        // second FK to students (affected_student_id), so an unqualified
        // "students(...)" embed is ambiguous to PostgREST.
        .select('id, student_id, violation_type, date, students!behavior_violations_student_id_fkey(name_ar, name_en, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order))')
        // pending (not yet reviewed) and rejected teacher reports don't count
        .eq('status', 'approved')
        .order('id');
      if (from) q = q.gte('date', from);
      if (to) q = q.lte('date', to);
      return q;
    });

    const byStudent = new Map();
    (data || []).forEach((r) => {
      if (!r.students) return;
      const existing = byStudent.get(r.student_id);
      if (existing) {
        existing.count += 1;
        if (r.date >= existing.lastDate) { existing.lastDate = r.date; existing.lastType = r.violation_type; }
      } else {
        byStudent.set(r.student_id, { id: r.student_id, student: r.students, count: 1, lastDate: r.date, lastType: r.violation_type });
      }
    });

    const list = Array.from(byStudent.values()).sort((a, b) => b.count - a.count);
    setAggRows(list);
    setAggLoading(false);
  }, []);

  useEffect(() => { if (!selected && canManage) loadAggregate(fromDate, toDate); }, [fromDate, toDate, selected, loadAggregate, canManage]);

  const STUDENT_EMBED = 'students!behavior_violations_student_id_fkey(id, sis_no, name_ar, name_en, section_id, is_active, parent_email, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order))';

  const loadPending = useCallback(async () => {
    if (!canReview) return;
    const { data } = await supabase
      .from('behavior_violations')
      .select(`id, student_id, violation_type, description, date, period, teacher_action, created_at, ${STUDENT_EMBED}, staff(full_name), affected_student:students!behavior_violations_affected_student_id_fkey(name_ar, name_en)`)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    setPendingList(data || []);
  }, [canReview]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMyReports = useCallback(async () => {
    if (!isRecorder || !staff) return;
    const { data } = await supabase
      .from('behavior_violations')
      .select(`id, student_id, violation_type, date, status, created_at, ${STUDENT_EMBED}`)
      .eq('staff_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setMyReports(data || []);
  }, [isRecorder, staff]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!selected) { loadPending(); loadMyReports(); } }, [selected, loadPending, loadMyReports]);

  useEffect(() => {
    if (!staff) return;
    (async () => {
      const { data } = await supabase.from('sections').select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
      let list = data || [];
      // a teacher only picks from the sections they've been assigned
      if (isRecorder) {
        const { data: assigned } = await supabase.from('staff_sections').select('section_id').eq('staff_id', staff.id);
        const allowed = new Set((assigned || []).map((a) => a.section_id));
        list = list.filter((s) => allowed.has(s.id));
      }
      setSections(list);
    })();
  }, [staff, isRecorder]);

  const reviewViolation = async (v, approve) => {
    setReviewingId(v.id);
    const { error } = await supabase
      .from('behavior_violations')
      .update({ status: approve ? 'approved' : 'rejected', reviewed_by: staff.id, reviewed_at: new Date().toISOString() })
      .eq('id', v.id);
    setReviewingId(null);
    if (error) { window.alert(t.saveError); return; }
    if (approve && v.students) {
      // go straight to the student so the supervisor can add their action
      // and contact the parent, with the message already about this violation
      setApprovedViolation(v);
      selectStudent({ ...v.students, id: v.student_id });
    } else {
      loadPending();
    }
  };

  const activeSectionIds = useMemo(() => {
    if (!grade) return null;
    if (sectionSel && sectionSel !== '__ALL__') return [sectionSel];
    return sectionsFor(sections, grade, stream).map((s) => s.id);
  }, [sections, grade, stream, sectionSel]);

  const sectionFilterKey = activeSectionIds ? activeSectionIds.join(',') : null;

  useEffect(() => {
    if (!sectionFilterKey) { setSectionRoster(null); return; }
    (async () => {
      setSearching(true);
      const { data } = await supabase
        .from('students')
        .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)')
        .in('section_id', sectionFilterKey.split(','))
        .eq('is_active', true)
        .order('name_ar', { ascending: true });
      setSectionRoster(data || []);
      setSearching(false);
    })();
  }, [sectionFilterKey]);

  // Full active-student roster for the "affected student" picker, fetched
  // lazily and cached — it's a separate, ad hoc search independent of the
  // section filter / main lookup above.
  const ensureAllStudents = useCallback(async () => {
    if (allStudentsRef.current) return allStudentsRef.current;
    const { data } = await fetchAllRows(() => supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)')
      .eq('is_active', true));
    allStudentsRef.current = data || [];
    return allStudentsRef.current;
  }, []);

  useEffect(() => {
    const q = affectedQuery.trim();
    if (!q) { setAffectedMatches([]); return; }
    let cancelled = false;
    (async () => {
      const list = await ensureAllStudents();
      if (cancelled) return;
      const found = list.filter((s) => s.id !== selected?.id && matchesStudentSearch(s, q)).slice(0, 6);
      setAffectedMatches(found);
    })();
    return () => { cancelled = true; };
  }, [affectedQuery, selected, ensureAllStudents]);

  const results = useMemo(() => {
    const q = query.trim();
    if (sectionRoster !== null) {
      return q ? sectionRoster.filter((s) => matchesStudentSearch(s, q)) : sectionRoster;
    }
    return matches;
  }, [sectionRoster, matches, query]);

  const clearSectionFilter = () => {
    setGrade('');
    setStream('');
    setSectionSel('');
  };

  const [contactedViolationIds, setContactedViolationIds] = useState(new Set());

  const loadContactedIds = useCallback(async (violationIds) => {
    if (!violationIds.length) { setContactedViolationIds(new Set()); return; }
    // best-effort: an older database without this table just shows no badges
    const { data } = await supabase
      .from('parent_contacts')
      .select('context_id')
      .eq('context', 'violation')
      .in('context_id', violationIds);
    setContactedViolationIds(new Set((data || []).map((r) => r.context_id)));
  }, []);

  const loadStudentViolations = useCallback(async (studentId) => {
    const { data } = await supabase
      .from('behavior_violations')
      .select(`
        id, violation_type, description, date, period, teacher_action, supervisor_action, created_at, status, staff_id,
        staff(full_name),
        affected_student:students!behavior_violations_affected_student_id_fkey(name_ar, name_en)
      `)
      .eq('student_id', studentId)
      // rejected reports are kept for the teacher who sent them, but they're
      // not part of the student's record
      .neq('status', 'rejected')
      .order('date', { ascending: false });
    setStudentViolations(data || []);
    loadContactedIds((data || []).map((v) => v.id));
  }, [loadContactedIds]);

  const saveSupervisorAction = async (id) => {
    setSavingAction(true);
    const { error } = await supabase.from('behavior_violations').update({ supervisor_action: actionDraft.trim() || null }).eq('id', id);
    setSavingAction(false);
    if (error) { window.alert(t.saveError); return; }
    setEditingActionId(null);
    loadStudentViolations(selected.id);
  };

  useEffect(() => {
    if (selected) loadStudentViolations(selected.id);
    else setStudentViolations(null);
  }, [selected, loadStudentViolations]);

  const runSearch = async () => {
    const q = query.trim();
    if (sectionRoster !== null) return;
    if (!q) { setMatches(null); return; }
    setSearching(true);
    const { data } = await fetchAllRows(() => supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)')
      .eq('is_active', true));
    const found = (data || []).filter((s) => matchesStudentSearch(s, q));
    found.sort((a, b) => (a.sections?.grade_order ?? 999) - (b.sections?.grade_order ?? 999));
    setMatches(found);
    setSearching(false);
  };

  const selectStudent = (student) => {
    setSelected(student);
    setSaveMsg(null);
    setViolationType('');
    setDescription('');
    setDate(todayStr());
    setPeriod('');
    setAffectedQuery('');
    setAffectedMatches([]);
    setAffectedStudent(null);
    setTeacherAction('');
    setSupervisorAction('');
    setShowReportForm(isRecorder);
  };

  const selectFromAgg = (r) => {
    selectStudent({ id: r.id, ...r.student });
  };

  const reset = () => {
    setSelected(null);
    setQuery('');
    setMatches(null);
    setSaveMsg(null);
    setApprovedViolation(null);
    setEditingActionId(null);
  };

  const save = async () => {
    if (!selected || !violationType) return;
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase.from('behavior_violations').insert({
      // a teacher's report waits for the supervisor; staff who manage
      // violations record them as already approved
      status: isRecorder ? 'pending' : 'approved',
      school_id: staff.school_id,
      student_id: selected.id,
      staff_id: staff.id,
      violation_type: violationType,
      description: description.trim() || null,
      date,
      period: period ? Number(period) : null,
      affected_student_id: affectedStudent?.id || null,
      teacher_action: teacherAction.trim() || null,
      supervisor_action: isRecorder ? null : (supervisorAction.trim() || null),
    });
    setSaving(false);
    if (error) {
      setSaveMsg({ type: 'err', text: t.saveError });
      return;
    }
    setSaveMsg({ type: 'ok', text: isRecorder ? t.violationSentForReview : t.violationSaved });
    setViolationType('');
    setDescription('');
    setPeriod('');
    setAffectedQuery('');
    setAffectedMatches([]);
    setAffectedStudent(null);
    setTeacherAction('');
    setSupervisorAction('');
    loadStudentViolations(selected.id);
    if (canManage) loadAggregate(fromDate, toDate);
  };

  // deleting is permanent, so it asks first (it used to delete on one tap)
  const removeViolation = async (id) => {
    if (!window.confirm(t.confirmDeleteViolation)) return;
    setDeletingId(id);
    const { error } = await supabase.from('behavior_violations').delete().eq('id', id);
    setDeletingId(null);
    if (!error) {
      if (selected) loadStudentViolations(selected.id);
      if (canManage) loadAggregate(fromDate, toDate);
      loadMyReports();
    }
  };

  // who may delete a given entry: staff who manage violations, or the teacher
  // who reported it while it's still waiting for review
  const canDeleteViolation = (v) => canManage || (isRecorder && v.staff_id === staff.id && v.status === 'pending');

  const statusChip = (status) => {
    if (!status || status === 'approved') return null;
    const cls = status === 'pending'
      ? (dark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700')
      : (dark ? 'bg-rose-500/15 text-rose-300' : 'bg-rose-50 text-rose-600');
    return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{status === 'pending' ? t.violationStatusPending : t.violationStatusRejected}</span>;
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—');
  const dayName = (d) => (d ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { weekday: 'long' }).format(new Date(d + 'T00:00:00')) : '');
  const affectedStudentName = (s) => (s ? (lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)) : '');

  const repeated = aggRows.filter((r) => r.count >= REPEAT_THRESHOLD);
  const rest = aggRows.filter((r) => r.count < REPEAT_THRESHOLD);

  function AggRow({ r }) {
    const s = r.student;
    const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
    return (
      <li>
        <button onClick={() => selectFromAgg(r)} className={`w-full flex items-center gap-3 py-3 text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
          <div className="h-9 w-9 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 text-xs font-semibold">
            {initials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{name}</div>
            <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-400'}`}>
              {s.sections ? fmtSectionLabel(s.sections, lang) : '—'}{r.lastType ? ' · ' + (t.violationTypeNames[r.lastType] || r.lastType) : ''}
            </div>
          </div>
          <div className="text-end shrink-0">
            <div className="text-sm font-bold font-en" style={{ color: r.count >= REPEAT_THRESHOLD ? '#ee5d50' : undefined }}>{r.count}</div>
            <div className={`text-[11px] ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.lastLateDate}: {fmtDate(r.lastDate)}</div>
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-3xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.violationsTitle}</h1>
          </motion.div>

          {!selected ? (
            <>
              {canReview && (
                <div className={cardFloating(dark, 'p-5 mb-5 border-2 border-amber-300/70')}>
                  <div className="flex items-center gap-2 mb-1">
                    <Inbox size={16} className="text-amber-500" />
                    <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>
                      {t.pendingViolationsTitle}{pendingList && pendingList.length > 0 ? ` (${pendingList.length})` : ''}
                    </h2>
                  </div>
                  {pendingList === null ? (
                    <div className="space-y-2 mt-3">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-16 w-full')} />)}</div>
                  ) : pendingList.length === 0 ? (
                    <p className={`text-sm mt-2 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noPendingViolations}</p>
                  ) : (
                    <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {pendingList.map((v) => {
                        const s = v.students || {};
                        const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                        return (
                          <li key={v.id} className="py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">{name}</span>
                              {s.sections && (
                                <span className={`text-[11px] px-2 py-0.5 rounded-full ${dark ? 'bg-gold/10 text-gold' : 'bg-amber-50 text-amber-700'}`}>{fmtSectionLabel(s.sections, lang)}</span>
                              )}
                              <span className="text-xs font-semibold text-rose-500">{t.violationTypeNames[v.violation_type] || v.violation_type}</span>
                            </div>
                            <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                              {fmtDate(v.date)} · {dayName(v.date)}{v.period ? ' · ' + t.periodN.replace('{n}', v.period) : ''}{v.staff?.full_name ? ' · ' + t.recordedBy + ' ' + v.staff.full_name : ''}
                            </div>
                            {v.description && <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{v.description}</div>}
                            {v.affected_student && (
                              <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t.affectedStudentDisplayLabel}: {affectedStudentName(v.affected_student)}</div>
                            )}
                            {v.teacher_action && (
                              <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t.teacherActionDisplayLabel}: {v.teacher_action}</div>
                            )}
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => reviewViolation(v, true)}
                                disabled={reviewingId === v.id}
                                className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-60"
                              >
                                {reviewingId === v.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t.approveViolation}
                              </button>
                              <button
                                onClick={() => reviewViolation(v, false)}
                                disabled={reviewingId === v.id}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg border disabled:opacity-60 ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                              >
                                <X size={13} /> {t.rejectViolation}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {isRecorder && (
                <div className={cardFloating(dark, 'p-4 mb-5')}>
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t.reportViolationHint}</p>
                </div>
              )}

              {canManage && (
              <div className={cardFloating(dark, 'p-4 mb-5 flex flex-col sm:flex-row gap-3 sm:items-end')}>
                <div className="flex-1">
                  <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.fromDate}</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls + ' font-en'} />
                </div>
                <div className="flex-1">
                  <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.toDate}</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls + ' font-en'} />
                </div>
                {(fromDate || toDate) && (
                  <button onClick={() => { setFromDate(''); setToDate(''); }} className={`text-xs font-medium px-4 py-2.5 rounded-lg border whitespace-nowrap ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {t.showAll}
                  </button>
                )}
              </div>
              )}

              <div className={cardFloating(dark, 'p-4 mb-5 space-y-3')}>
                <SectionPicker
                  sections={sections} lang={lang} dark={dark}
                  grade={grade} stream={stream} sectionId={sectionSel}
                  allowAll
                  onGradeChange={(g) => { setGrade(g); setStream(''); setSectionSel(''); }}
                  onStreamChange={(s) => { setStream(s); setSectionSel(''); }}
                  onSectionChange={setSectionSel}
                  inputCls={inputCls}
                />
                {sectionRoster !== null && (
                  <button onClick={clearSectionFilter} className={`text-xs font-medium px-4 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {t.clearClassFilter}
                  </button>
                )}
              </div>

              <div className={cardFloating(dark, 'p-4 mb-5 flex gap-2')}>
                <div className={`flex-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${dark ? 'bg-navy border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim() && sectionRoster === null) setMatches(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                    placeholder={t.lookupPlaceholder}
                    className="bg-transparent outline-none w-full text-sm placeholder:text-inherit"
                    style={{ color: dark ? '#e2e8f0' : '#334155' }}
                  />
                </div>
                <button onClick={runSearch} disabled={searching} className="flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60">
                  {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} {lang === 'ar' ? 'بحث' : 'Search'}
                </button>
              </div>

              {results !== null && (
                <div className={cardFloating(dark, 'overflow-hidden mb-5')}>
                  {results.length === 0 ? (
                    <div className="p-8 text-center"><p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.lookupNoResults}</p></div>
                  ) : (
                    <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {results.map((s) => {
                        const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                        return (
                          <li key={s.id}>
                            <button onClick={() => selectStudent(s)} className={`w-full flex items-center gap-3 px-4 py-3 text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold shrink-0">{initials(name)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold truncate">{name}</div>
                                <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.sisNo}: {s.sis_no}</div>
                              </div>
                              <span className={`text-xs px-2.5 py-1 rounded-full shrink-0 ${dark ? 'bg-gold/10 text-gold' : 'bg-amber-50 text-amber-700'}`}>{fmtSectionLabel(s.sections, lang)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {isRecorder && (
                <div className={cardFloating(dark, 'p-5')}>
                  <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.myReportedViolationsTitle}</h2>
                  {myReports === null ? (
                    <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                  ) : myReports.length === 0 ? (
                    <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noReportedViolations}</p>
                  ) : (
                    <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {myReports.map((v) => {
                        const s = v.students || {};
                        const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                        const approvedChip = v.status === 'approved'
                          ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${dark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>{t.violationStatusApproved}</span>
                          : statusChip(v.status);
                        return (
                          <li key={v.id}>
                            <button onClick={() => v.students && selectStudent({ ...v.students, id: v.student_id })} className={`w-full flex items-center gap-3 py-3 text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{name || '—'}</div>
                                <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                                  {t.violationTypeNames[v.violation_type] || v.violation_type} · {fmtDate(v.date)}
                                </div>
                              </div>
                              {approvedChip}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {canManage && (
              <>
              <div className={cardFloating(dark, 'p-5 mb-5')}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-rose-500" />
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.repeatedViolationsTitle}</h2>
                </div>
                {aggLoading ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : repeated.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.noViolationsInPeriod}</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {repeated.map((r) => <AggRow key={r.id} r={r} />)}
                  </ul>
                )}
              </div>

              <div className={cardFloating(dark, 'p-5')}>
                <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.allViolationsTitle}</h2>
                {aggLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : rest.length === 0 && repeated.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.noViolationsInPeriod}</p>
                ) : rest.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-400'}`}>—</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {rest.map((r) => <AggRow key={r.id} r={r} />)}
                  </ul>
                )}
              </div>
              </>
              )}
            </>
          ) : (
            <>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cardFloating(dark, 'p-5 mb-5')}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {initials(lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar)}</div>
                    <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{fmtSectionLabel(selected.sections, lang)}</div>
                  </div>
                  <button onClick={reset} className={`text-xs font-medium ${dark ? 'text-royal-light' : 'text-royal'}`}>{t.backToResults}</button>
                </div>

                {canReport && !isRecorder && !showReportForm && (
                  <button
                    onClick={() => setShowReportForm(true)}
                    className={`text-xs font-medium px-3 py-2 rounded-lg border mb-2 ${dark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {t.addViolationDetailsBtn}
                  </button>
                )}

                {canReport && showReportForm && (
                  <div className="space-y-3 mb-2">
                    {isRecorder && (
                      <p className={`text-xs rounded-lg px-3 py-2 ${dark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>{t.reportGoesToSupervisor}</p>
                    )}
                    <div className={`text-xs rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 ${dark ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                      <span>{t.violationTeacherNameLabel}: <span className="font-medium">{staff.full_name}</span></span>
                      {shownSubjects(staff).length > 0 && (
                        <span>{t.subjectsShort}: <span className="font-medium">{namesOf(shownSubjects(staff), t.subjectNames, lang)}</span></span>
                      )}
                      <span>{t.violationDayLabel}: <span className="font-medium">{dayName(date)}</span></span>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.violationType}</label>
                        <select value={violationType} onChange={(e) => setViolationType(e.target.value)} className={inputCls}>
                          <option value="">{t.chooseViolationType}</option>
                          {VIOLATION_TYPE_KEYS.map((k) => <option key={k} value={k}>{t.violationTypeNames[k]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.violationDate}</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + ' font-en'} />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.violationPeriodOptionalLabel}</label>
                        <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls + ' font-en'}>
                          <option value="">{t.choosePeriod}</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                            <option key={p} value={p}>{t.periodN.replace('{n}', p)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.affectedStudentLabel}</label>
                      {affectedStudent ? (
                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                          <span className="flex-1 truncate">{affectedStudentName(affectedStudent)}</span>
                          <button onClick={() => { setAffectedStudent(null); setAffectedQuery(''); }} className="text-xs font-medium text-rose-500 shrink-0">
                            {t.affectedStudentClear}
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            value={affectedQuery}
                            onChange={(e) => setAffectedQuery(e.target.value)}
                            placeholder={t.affectedStudentPlaceholder}
                            className={inputCls}
                          />
                          {affectedMatches.length > 0 && (
                            <ul className={`absolute z-10 mt-1 w-full rounded-lg border shadow-lg overflow-hidden ${dark ? 'bg-navy border-slate-700' : 'bg-white border-slate-200'}`}>
                              {affectedMatches.map((s) => (
                                <li key={s.id}>
                                  <button
                                    onClick={() => { setAffectedStudent(s); setAffectedQuery(''); setAffectedMatches([]); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-start text-sm ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                                  >
                                    <span className="flex-1 truncate">{affectedStudentName(s)}</span>
                                    <span className={`text-[11px] shrink-0 ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{s.sections ? fmtSectionLabel(s.sections, lang) : ''}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.violationDescription}</label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t.violationDescriptionPlaceholder} className={inputCls} />
                    </div>

                    <div className={`grid gap-3 ${isRecorder ? '' : 'sm:grid-cols-2'}`}>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.teacherActionLabel}</label>
                        <textarea value={teacherAction} onChange={(e) => setTeacherAction(e.target.value)} rows={2} placeholder={t.teacherActionPlaceholder} className={inputCls} />
                      </div>
                      {!isRecorder && (
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.supervisorActionLabel}</label>
                        <textarea value={supervisorAction} onChange={(e) => setSupervisorAction(e.target.value)} rows={2} placeholder={t.supervisorActionPlaceholder} className={inputCls} />
                      </div>
                      )}
                    </div>

                    {saveMsg && <p className={`text-xs ${saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{saveMsg.text}</p>}
                    <button onClick={save} disabled={saving || !violationType} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-60">
                      {saving && <Loader2 size={14} className="animate-spin" />} {isRecorder ? t.sendViolationToSupervisor : t.addViolation}
                    </button>
                  </div>
                )}
              </motion.div>

              {canManage && (
                <ContactParentPanel
                  key={`${selected.id}-${approvedViolation?.id || ''}`}
                  student={selected}
                  name={lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar)}
                  sectionLabel={fmtSectionLabel(selected.sections, lang)}
                  defaultNote={approvedViolation
                    ? (lang === 'ar'
                      ? `تم رصد مخالفة سلوكية لهذا الطالب (${t.violationTypeNames[approvedViolation.violation_type] || approvedViolation.violation_type}) بتاريخ ${approvedViolation.date}، ونرجو منكم متابعة الأمر معه.`
                      : `A behavioral violation (${t.violationTypeNames[approvedViolation.violation_type] || approvedViolation.violation_type}) was recorded for this student on ${approvedViolation.date} — we'd like to bring this to your attention.`)
                    : (lang === 'ar'
                      ? 'تم رصد مخالفة سلوكية لهذا الطالب، ونرجو منكم متابعة الأمر معه.'
                      : "A behavioral violation was recorded for this student — we'd like to bring this to your attention.")}
                  mode="direct"
                  contextType="violation"
                  contextId={approvedViolation?.id || null}
                  onSent={() => loadStudentViolations(selected.id)}
                  staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls}
                />
              )}

              <div className={cardFloating(dark, 'p-5')}>
                <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.violationsListTitle}</h2>
                {studentViolations === null ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : studentViolations.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-400'}`}>{t.noViolations}</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {studentViolations.map((v) => (
                      <li key={v.id} className="flex items-start gap-3 py-3">
                        <div className="h-9 w-9 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                          <AlertTriangle size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium flex flex-wrap items-center gap-2">{t.violationTypeNames[v.violation_type] || v.violation_type}{statusChip(v.status)}{contactedViolationIds.has(v.id) && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                              <Check size={11} /> {t.parentContactedBadge}
                            </span>
                          )}</div>
                          <div className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-400'}`}>
                            {fmtDate(v.date)} · {dayName(v.date)}{v.period ? ' · ' + t.periodN.replace('{n}', v.period) : ''}{v.staff?.full_name ? ' · ' + t.recordedBy + ' ' + v.staff.full_name : ''}
                          </div>
                          {v.description && <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{v.description}</div>}
                          {v.affected_student && (
                            <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
                              {t.affectedStudentDisplayLabel}: {affectedStudentName(v.affected_student)}
                            </div>
                          )}
                          {v.teacher_action && (
                            <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
                              {t.teacherActionDisplayLabel}: {v.teacher_action}
                            </div>
                          )}
                          {editingActionId === v.id ? (
                            <div className="mt-2 space-y-2">
                              <textarea value={actionDraft} onChange={(e) => setActionDraft(e.target.value)} rows={2} placeholder={t.supervisorActionPlaceholder} className={inputCls} autoFocus />
                              <div className="flex gap-2">
                                <button onClick={() => saveSupervisorAction(v.id)} disabled={savingAction} className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-royal hover:bg-royal-light text-white disabled:opacity-60">
                                  {savingAction && <Loader2 size={13} className="animate-spin" />} {t.save}
                                </button>
                                <button onClick={() => setEditingActionId(null)} className={`text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700' : 'border-slate-200'}`}>{t.cancel}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {v.supervisor_action && (
                                <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
                                  {t.supervisorActionDisplayLabel}: {v.supervisor_action}
                                </div>
                              )}
                              {canManage && v.status !== 'pending' && (
                                <button
                                  onClick={() => { setEditingActionId(v.id); setActionDraft(v.supervisor_action || ''); }}
                                  className={`text-xs font-medium mt-1.5 ${dark ? 'text-royal-light' : 'text-royal'}`}
                                >
                                  {v.supervisor_action ? t.editSupervisorAction : t.addSupervisorAction}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        {canDeleteViolation(v) && (
                          <button onClick={() => removeViolation(v.id)} disabled={deletingId === v.id} className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg p-2 shrink-0">
                            {deletingId === v.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
