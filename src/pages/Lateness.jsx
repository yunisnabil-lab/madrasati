import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useEscape from '../lib/useEscape';
import { Search, Loader2, Trash2, Clock3, AlertTriangle, Check, MessageCircle, X, ClipboardPlus, ListFilter } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import EmptyState from '../components/EmptyState';
import { useDialogs } from '../lib/Dialogs';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { matchesStudentSearch, searchStudents, studentMatchRank } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import SectionPicker from '../components/SectionPicker';
import ContactParentPanel from '../components/ContactParentPanel';
import BulkContactModal from '../components/BulkContactModal';
import { RangeChips, useContactChannels, SentMarks, todayStr } from '../components/ListFilters';

const REPEAT_THRESHOLD = 3;

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// Morning lateness recorded here (morning_lateness table) is a manual entry
// made by the supervisor at the gate/entrance — it is entirely independent
// of the class-period attendance system (attendance_records / period 1).
//
// The page opens with a choice: "record lateness" (pick several students and
// record them in one go, then message their parents) or "look up lateness"
// (the list of late / repeat-late students with filters).
export default function Lateness() {
  const { t, lang, dark, staff } = useApp();
  const { confirm } = useDialogs();
  const canManage = staff && (staff.role === 'admin' || staff.role === 'supervisor' || staff.role === 'edari');

  // null = ask on entry; staff who can't record go straight to the list
  const [mode, setMode] = useState(() => (canManage ? null : 'inquiry'));
  // the choice popup can be dismissed (Esc, click outside, close button): that leaves the page
  const navigate = useNavigate();
  const leavePage = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  useEscape(leavePage, mode === null && !!canManage);

  const [sections, setSections] = useState([]);
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [sectionSel, setSectionSel] = useState('');
  const [sectionRoster, setSectionRoster] = useState(null);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState(null);
  const [selected, setSelected] = useState(null);

  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  // record mode: several students recorded in one go
  const [batch, setBatch] = useState(new Map()); // id -> student
  const [batchResult, setBatchResult] = useState(null); // { saved: [students], skipped: n }

  const [studentLateness, setStudentLateness] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [listFilter, setListFilter] = useState('');
  const [aggLoading, setAggLoading] = useState(true);
  const [aggRows, setAggRows] = useState([]);
  const [channels, reloadChannels] = useContactChannels('lateness', fromDate);

  const loadAggregate = useCallback(async (from, to) => {
    setAggLoading(true);
    const { data } = await fetchAllRows(() => {
      let q = supabase
        .from('morning_lateness')
        .select('id, student_id, date, students(name_ar, name_en, sis_no, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order))')
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
        if (r.date > existing.lastDate) existing.lastDate = r.date;
      } else {
        byStudent.set(r.student_id, { id: r.student_id, student: r.students, count: 1, lastDate: r.date });
      }
    });

    const list = Array.from(byStudent.values()).sort((a, b) => b.count - a.count || (b.lastDate > a.lastDate ? 1 : -1));
    setAggRows(list);
    setAggLoading(false);
  }, []);

  useEffect(() => { if (!selected && mode === 'inquiry') loadAggregate(fromDate, toDate); }, [fromDate, toDate, selected, loadAggregate, mode]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sections').select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number');
      setSections(data || []);
    })();
  }, []);

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

  const results = useMemo(() => {
    const q = query.trim();
    if (sectionRoster !== null) {
      return q ? searchStudents(sectionRoster, q) : sectionRoster;
    }
    return matches;
  }, [sectionRoster, matches, query]);

  const clearSectionFilter = () => {
    setGrade('');
    setStream('');
    setSectionSel('');
  };

  const loadStudentLateness = useCallback(async (studentId) => {
    const { data } = await supabase
      .from('morning_lateness')
      .select('id, date, description, created_at, staff(full_name)')
      .eq('student_id', studentId)
      .order('date', { ascending: false });
    setStudentLateness(data || []);
  }, []);

  // when a parent was last contacted about this student's lateness, so the
  // supervisor can tell at a glance whether it's already been sent
  const [lastContact, setLastContact] = useState(null);
  const loadLastContact = useCallback(async (studentId) => {
    // best-effort: without the parent_contacts table this just stays empty
    const { data } = await supabase
      .from('parent_contacts')
      .select('created_at, channel')
      .eq('student_id', studentId)
      .eq('context', 'lateness')
      .order('created_at', { ascending: false })
      .limit(1);
    setLastContact(data && data[0] ? data[0] : null);
  }, []);

  useEffect(() => {
    if (selected) { loadStudentLateness(selected.id); loadLastContact(selected.id); }
    else { setStudentLateness(null); setLastContact(null); }
  }, [selected, loadStudentLateness, loadLastContact]);

  const runSearch = async () => {
    const q = query.trim();
    if (sectionRoster !== null) return;
    if (!q) { setMatches(null); return; }
    setSearching(true);
    const { data } = await fetchAllRows(() => supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order)')
      .eq('is_active', true)
      .order('id'));
    const found = (data || []).filter((s) => matchesStudentSearch(s, q));
    found.sort((a, b) => studentMatchRank(a, q) - studentMatchRank(b, q) || (a.sections?.grade_order ?? 999) - (b.sections?.grade_order ?? 999));
    setMatches(found);
    setSearching(false);
  };

  const selectStudent = (student) => {
    setSelected(student);
    setSaveMsg(null);
    setDescription('');
    setDate(todayStr());
  };

  const reset = () => {
    setSelected(null);
    setSaveMsg(null);
  };

  const chooseMode = (m) => {
    setMode(m);
    setSelected(null);
    setQuery('');
    setMatches(null);
    setBatchResult(null);
    setSaveMsg(null);
  };

  // ---------- record mode ----------
  const toggleBatch = (s) => setBatch((prev) => {
    const next = new Map(prev);
    if (next.has(s.id)) next.delete(s.id); else next.set(s.id, s);
    return next;
  });

  const saveBatch = async () => {
    if (batch.size === 0) return;
    setSaving(true);
    setSaveMsg(null);
    const ids = [...batch.keys()];
    // skip students whose lateness for that day is already recorded
    const { data: existing } = await supabase.from('morning_lateness').select('student_id').eq('date', date).in('student_id', ids);
    const already = new Set((existing || []).map((r) => r.student_id));
    const toSave = [...batch.values()].filter((s) => !already.has(s.id));
    let error = null;
    if (toSave.length) {
      ({ error } = await supabase.from('morning_lateness').insert(toSave.map((s) => ({
        school_id: staff.school_id,
        student_id: s.id,
        staff_id: staff.id,
        description: description.trim() || null,
        date,
      }))));
    }
    setSaving(false);
    if (error) { setSaveMsg({ type: 'err', text: t.saveError }); return; }
    setBatchResult({ saved: toSave, skipped: already.size });
    setBatch(new Map());
    setDescription('');
  };

  // ---------- single student (from the inquiry list) ----------
  const save = async () => {
    if (!selected) return;
    if ((studentLateness || []).some((l) => l.date === date)) {
      if (!(await confirm(t.duplicateLatenessConfirm))) return;
    }
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase.from('morning_lateness').insert({
      school_id: staff.school_id,
      student_id: selected.id,
      staff_id: staff.id,
      description: description.trim() || null,
      date,
    });
    setSaving(false);
    if (error) {
      setSaveMsg({ type: 'err', text: t.saveError });
      return;
    }
    setSaveMsg({ type: 'ok', text: t.latenessSaved });
    setDescription('');
    loadStudentLateness(selected.id);
  };

  const removeLateness = async (id) => {
    if (!(await confirm(t.confirmDeleteLateness))) return;
    setDeletingId(id);
    const { error } = await supabase.from('morning_lateness').delete().eq('id', id);
    setDeletingId(null);
    if (!error) {
      if (selected) loadStudentLateness(selected.id);
      loadAggregate(fromDate, toDate);
    }
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;
  const labelCls = `block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`;
  const nameOf = (s) => (lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar));

  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-US') : '—');

  const filteredRows = useMemo(() => {
    const q = listFilter.trim();
    return q ? aggRows.filter((r) => matchesStudentSearch(r.student, q)) : aggRows;
  }, [aggRows, listFilter]);
  const repeated = filteredRows.filter((r) => r.count >= REPEAT_THRESHOLD);
  const rest = filteredRows.filter((r) => r.count < REPEAT_THRESHOLD);

  // "select several" mode: rows toggle a checkmark instead of opening the
  // student, and a bar at the bottom opens the bulk parent-contact window
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState(new Map()); // student id -> { id, name, sectionLabel }
  const [bulkStudents, setBulkStudents] = useState(null);
  const [bulkNote, setBulkNote] = useState('');
  const togglePick = (id, s) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, { id, name: nameOf(s), sectionLabel: s.sections ? fmtSectionLabel(s.sections, lang) : '' });
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setPicked(new Map()); };
  const pickMark = (on) => (
    <span className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${on ? 'bg-royal border-royal text-white' : (dark ? 'border-slate-500' : 'border-slate-300')}`}>
      {on && <Check size={13} />}
    </span>
  );

  const openBulk = (students, note) => { setBulkNote(note); setBulkStudents(students); };

  function AggRow({ r }) {
    const s = r.student;
    const name = nameOf(s);
    return (
      <li>
        <button onClick={() => (selectMode ? togglePick(r.id, s) : selectStudent({ id: r.id, ...s }))} className={`w-full flex items-center gap-3 py-3 text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
          {selectMode && pickMark(picked.has(r.id))}
          <div className="h-9 w-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 text-xs font-semibold">
            {initials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate flex items-center gap-2">{name} <SentMarks channels={channels.get(r.id)} t={t} /></div>
            <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
              {s.sections ? fmtSectionLabel(s.sections, lang) : '—'}
            </div>
          </div>
          <div className="text-end shrink-0">
            <div className="text-sm font-bold font-en" style={{ color: r.count >= REPEAT_THRESHOLD ? '#ee5d50' : undefined }}>{r.count}</div>
            <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.lastLateDate}: {fmtDate(r.lastDate)}</div>
          </div>
        </button>
      </li>
    );
  }

  // search block shared by both modes: section picker + name search + results
  const searchBlock = (onPick, isOn) => (
    <>
      <div className={cardFloating(dark, 'p-4 mb-4 space-y-3')}>
        <SectionPicker
          sections={sections} lang={lang} dark={dark}
          grade={grade} stream={stream} sectionId={sectionSel}
          allowAll
          onGradeChange={(g) => { setGrade(g); setStream(''); setSectionSel(''); }}
          onStreamChange={(s) => { setStream(s); setSectionSel(''); }}
          onSectionChange={setSectionSel}
          inputCls={inputCls}
        />
        <div className="flex gap-2">
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
        {sectionRoster !== null && (
          <button onClick={clearSectionFilter} className={`text-xs font-medium px-4 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            {t.clearClassFilter}
          </button>
        )}
      </div>

      {results !== null && (
        <div className={cardFloating(dark, 'overflow-hidden mb-5')}>
          {results.length === 0 ? (
            <div className="p-8 text-center"><p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.lookupNoResults}</p></div>
          ) : (
            <ul className={`divide-y max-h-[420px] overflow-y-auto ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
              {results.map((s) => {
                const name = nameOf(s);
                const on = isOn(s.id);
                return (
                  <li key={s.id}>
                    <button onClick={() => onPick(s)} className={`w-full flex items-center gap-3 px-4 py-3 text-start transition-colors ${on ? (dark ? 'bg-royal/15' : 'bg-royal/5') : ''} ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                      {mode === 'record' || selectMode ? pickMark(on) : null}
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold shrink-0">{initials(name)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{name}</div>
                        <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.sisNo}: {s.sis_no}</div>
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
    </>
  );

  const modeTabs = (
    <div className={`inline-flex rounded-xl p-1 mb-5 ${dark ? 'bg-black/20' : 'bg-slate-200/60'}`}>
      {[['record', t.latenessModeRecord, ClipboardPlus], ['inquiry', t.latenessModeInquiry, ListFilter]].map(([m, label, Icon]) => (
        <button
          key={m}
          onClick={() => chooseMode(m)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === m ? (dark ? 'bg-navy-soft text-white shadow' : 'bg-white text-navy shadow-sm') : (dark ? 'text-slate-200' : 'text-slate-600')}`}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.latenessTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.latenessSub}</p>
          </motion.div>

          {mode && !selected && canManage && modeTabs}

          {/* ---------------- record several students ---------------- */}
          {mode === 'record' && !selected && (
            batchResult ? (
              <div className={cardFloating(dark, 'p-6 text-center')}>
                <div className="h-12 w-12 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto mb-3"><Check size={22} /></div>
                <p className="text-sm font-semibold">{t.batchSaved.replace('{n}', batchResult.saved.length)}</p>
                {batchResult.skipped > 0 && <p className={`text-xs mt-1 ${dark ? 'text-amber-200' : 'text-amber-700'}`}>{t.batchSkipped.replace('{n}', batchResult.skipped)}</p>}
                <div className="flex flex-wrap justify-center gap-2.5 mt-5">
                  {canManage && batchResult.saved.length > 0 && (
                    <button
                      onClick={() => openBulk(batchResult.saved.map((s) => ({ id: s.id, name: nameOf(s), sectionLabel: s.sections ? fmtSectionLabel(s.sections, lang) : '' })), t.latenessTodayNote)}
                      className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white"
                    >
                      <MessageCircle size={15} /> {t.batchMessage}
                    </button>
                  )}
                  <button onClick={() => setBatchResult(null)} className={`text-sm font-medium px-5 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {t.batchNew}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {searchBlock(toggleBatch, (id) => batch.has(id))}

                <div className={cardFloating(dark, 'p-5 mb-5')}>
                  <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.batchTitle.replace('{n}', batch.size)}</h2>
                  {batch.size === 0 ? (
                    <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.batchEmpty}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {[...batch.values()].map((s) => (
                        <span key={s.id} className={`flex items-center gap-1.5 text-xs font-medium ps-3 pe-1.5 py-1.5 rounded-full ${dark ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
                          {nameOf(s)}
                          <button onClick={() => toggleBatch(s)} className="rounded-full p-0.5 hover:bg-black/10" aria-label="remove"><X size={13} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  {batch.size > 0 && (
                    <div className="space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>{t.latenessDate}</label>
                          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} className={inputCls + ' font-en'} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>{t.latenessDescription}</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} placeholder={t.latenessDescriptionPlaceholder} className={inputCls} />
                      </div>
                      {saveMsg && <p className={`text-xs ${saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{saveMsg.text}</p>}
                      <button onClick={saveBatch} disabled={saving} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />} {t.batchSave.replace('{n}', batch.size)}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )
          )}

          {/* ---------------- look up lateness ---------------- */}
          {mode === 'inquiry' && !selected && (
            <>
              <div className={cardFloating(dark, 'p-4 mb-5 space-y-3')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RangeChips from={fromDate} to={toDate} onChange={(f, tt) => { setFromDate(f); setToDate(tt); }} t={t} dark={dark} />
                  {canManage && (
                    <button
                      onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                      className={`text-xs font-medium px-4 py-2 rounded-lg border ${selectMode ? 'bg-royal text-white border-transparent' : (dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50')}`}
                    >
                      {selectMode ? t.cancelSelectBtn : t.selectManyBtn}
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>{t.fromDate}</label>
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls + ' font-en'} />
                  </div>
                  <div>
                    <label className={labelCls}>{t.toDate}</label>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls + ' font-en'} />
                  </div>
                  <div>
                    <label className={labelCls}>{t.filterListPlaceholder}</label>
                    <input value={listFilter} onChange={(e) => setListFilter(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <p className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{t.sentLegend}</p>
              </div>

              <div className={cardFloating(dark, 'p-5 mb-5')}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-rose-500" />
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.repeatedLatenessTitle}</h2>
                  {!aggLoading && <span className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>({repeated.length})</span>}
                </div>
                {aggLoading ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : repeated.length === 0 ? (
                  <EmptyState icon={Clock3} text={t.noLatenessRecords} dark={dark} compact />
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {repeated.map((r) => <AggRow key={r.id} r={r} />)}
                  </ul>
                )}
              </div>

              <div className={cardFloating(dark, 'p-5')}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock3 size={16} className={dark ? 'text-royal-light' : 'text-royal'} />
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.allLatenessTitle}</h2>
                  {!aggLoading && <span className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>({rest.length})</span>}
                </div>
                {aggLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : rest.length === 0 && repeated.length === 0 ? (
                  <EmptyState icon={Clock3} text={t.noLatenessRecords} dark={dark} compact />
                ) : rest.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>—</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {rest.map((r) => <AggRow key={r.id} r={r} />)}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* ---------------- one student ---------------- */}
          {selected && (
            <>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cardFloating(dark, 'p-5 mb-5')}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {initials(nameOf(selected))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{nameOf(selected)}</div>
                    <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{fmtSectionLabel(selected.sections, lang)}</div>
                  </div>
                  <button onClick={reset} className={`text-xs font-medium ${dark ? 'text-royal-light' : 'text-royal'}`}>{t.backToResults}</button>
                </div>

                {canManage && (
                  <div className="space-y-3 mb-2">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{t.latenessDate}</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + ' font-en'} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{t.latenessDescription}</label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} placeholder={t.latenessDescriptionPlaceholder} className={inputCls} />
                    </div>
                    {saveMsg && <p className={`text-xs ${saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{saveMsg.text}</p>}
                    <button onClick={save} disabled={saving} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60">
                      {saving && <Loader2 size={14} className="animate-spin" />} {t.addLateness}
                    </button>
                  </div>
                )}
              </motion.div>

              {canManage && lastContact && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-500 mb-3">
                  <Check size={13} /> {t.lastContactedLabel}: {fmtDate(lastContact.created_at.slice(0, 10))} ({lastContact.channel === 'whatsapp' ? 'WhatsApp' : 'Email'})
                </p>
              )}

              {canManage && (
                <ContactParentPanel
                  student={selected}
                  name={nameOf(selected)}
                  sectionLabel={fmtSectionLabel(selected.sections, lang)}
                  defaultNote={lang === 'ar'
                    ? 'لاحظنا تكرار تأخر هذا الطالب في الحضور الصباحي، ونرجو منكم متابعة الأمر معه.'
                    : "We've noticed repeated morning lateness for this student — we'd like to bring this to your attention."}
                  mode="direct"
                  contextType="lateness"
                  onSent={() => { loadLastContact(selected.id); reloadChannels(); }}
                  staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls}
                />
              )}

              <div className={cardFloating(dark, 'p-5')}>
                <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.latenessRecordsTitle}</h2>
                {studentLateness === null ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : studentLateness.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.noLatenessForStudent}</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {studentLateness.map((l) => (
                      <li key={l.id} className="flex items-start gap-3 py-3">
                        <div className="h-9 w-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                          <Clock3 size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{fmtDate(l.date)}</div>
                          <div className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
                            {l.staff?.full_name ? t.recordedBy + ' ' + l.staff.full_name : ''}
                          </div>
                          {l.description && <div className={`text-xs mt-1 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{l.description}</div>}
                        </div>
                        {canManage && (
                          <button onClick={() => removeLateness(l.id)} disabled={deletingId === l.id} className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg p-2 shrink-0">
                            {deletingId === l.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
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

      {/* the choice shown when the page opens */}
      {mode === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={(e) => e.target === e.currentTarget && leavePage()}>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${dark ? 'bg-navy-soft text-slate-100' : 'bg-white text-slate-800'}`}>
            <h2 className={`text-lg font-bold mb-4 text-center ${dark ? 'text-white' : 'text-navy'}`}>{t.chooseActionTitle}</h2>
            <div className="grid gap-3">
              {[['record', t.latenessModeRecord, t.latenessModeRecordHint, ClipboardPlus, 'bg-amber-500/15 text-amber-600'],
                ['inquiry', t.latenessModeInquiry, t.latenessModeInquiryHint, ListFilter, dark ? 'bg-royal/20 text-royal-light' : 'bg-royal/10 text-royal']].map(([m, title, hint, Icon, accent]) => (
                <button
                  key={m}
                  onClick={() => chooseMode(m)}
                  className={`flex items-center gap-4 rounded-xl border p-4 text-start transition-colors ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${accent}`}><Icon size={20} /></span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className={`block text-xs mt-0.5 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={leavePage} className={`mt-4 w-full text-sm font-medium py-2.5 rounded-lg ${dark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-50'}`}>{t.closeBtn}</button>
          </motion.div>
        </div>
      )}

      {mode === 'inquiry' && selectMode && picked.size > 0 && !selected && (
        <div className="no-print fixed bottom-16 md:bottom-4 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <button
            onClick={() => openBulk([...picked.values()], t.bulkContactDefaultNote)}
            className="pointer-events-auto flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-full bg-royal hover:bg-royal-light text-white shadow-xl"
          >
            <MessageCircle size={16} /> {t.sendToSelectedBtn.replace('{n}', picked.size)}
          </button>
        </div>
      )}

      {bulkStudents && (
        <BulkContactModal
          students={bulkStudents}
          contextType="lateness"
          defaultNote={bulkNote}
          staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls}
          onSent={reloadChannels}
          onClose={() => setBulkStudents(null)}
        />
      )}
    </div>
  );
}
