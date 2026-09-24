import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { matchesStudentSearch } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import { VIOLATION_TYPE_KEYS } from '../lib/i18n';
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
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

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
        .select('id, student_id, violation_type, date, students(name_ar, name_en, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order))');
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

  useEffect(() => { if (!selected) loadAggregate(fromDate, toDate); }, [fromDate, toDate, selected, loadAggregate]);

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
      return q ? sectionRoster.filter((s) => matchesStudentSearch(s, q)) : sectionRoster;
    }
    return matches;
  }, [sectionRoster, matches, query]);

  const clearSectionFilter = () => {
    setGrade('');
    setStream('');
    setSectionSel('');
  };

  const loadStudentViolations = useCallback(async (studentId) => {
    const { data } = await supabase
      .from('behavior_violations')
      .select('id, violation_type, description, date, created_at, staff(full_name)')
      .eq('student_id', studentId)
      .order('date', { ascending: false });
    setStudentViolations(data || []);
  }, []);

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
  };

  const selectFromAgg = (r) => {
    selectStudent({ id: r.id, ...r.student });
  };

  const reset = () => {
    setSelected(null);
    setQuery('');
    setMatches(null);
    setSaveMsg(null);
  };

  const save = async () => {
    if (!selected || !violationType) return;
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase.from('behavior_violations').insert({
      school_id: staff.school_id,
      student_id: selected.id,
      staff_id: staff.id,
      violation_type: violationType,
      description: description.trim() || null,
      date,
    });
    setSaving(false);
    if (error) {
      setSaveMsg({ type: 'err', text: t.saveError });
      return;
    }
    setSaveMsg({ type: 'ok', text: t.violationSaved });
    setViolationType('');
    setDescription('');
    loadStudentViolations(selected.id);
    loadAggregate(fromDate, toDate);
  };

  const removeViolation = async (id) => {
    setDeletingId(id);
    const { error } = await supabase.from('behavior_violations').delete().eq('id', id);
    setDeletingId(null);
    if (!error) {
      if (selected) loadStudentViolations(selected.id);
      loadAggregate(fromDate, toDate);
    }
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—');

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
            <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
              {s.sections ? fmtSectionLabel(s.sections, lang) : '—'}{r.lastType ? ' · ' + (t.violationTypeNames[r.lastType] || r.lastType) : ''}
            </div>
          </div>
          <div className="text-end shrink-0">
            <div className="text-sm font-bold font-en" style={{ color: r.count >= REPEAT_THRESHOLD ? '#ee5d50' : undefined }}>{r.count}</div>
            <div className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.lastLateDate}: {fmtDate(r.lastDate)}</div>
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
              <div className={cardFloating(dark, 'p-4 mb-5 flex flex-col sm:flex-row gap-3 sm:items-end')}>
                <div className="flex-1">
                  <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.fromDate}</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls + ' font-en'} />
                </div>
                <div className="flex-1">
                  <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.toDate}</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls + ' font-en'} />
                </div>
                {(fromDate || toDate) && (
                  <button onClick={() => { setFromDate(''); setToDate(''); }} className={`text-xs font-medium px-4 py-2.5 rounded-lg border whitespace-nowrap ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {t.showAll}
                  </button>
                )}
              </div>

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
                    <div className="p-8 text-center"><p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.lookupNoResults}</p></div>
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
                                <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.sisNo}: {s.sis_no}</div>
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

              <div className={cardFloating(dark, 'p-5 mb-5')}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={16} className="text-rose-500" />
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.repeatedViolationsTitle}</h2>
                </div>
                {aggLoading ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : repeated.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noViolationsInPeriod}</p>
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
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noViolationsInPeriod}</p>
                ) : rest.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>—</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {rest.map((r) => <AggRow key={r.id} r={r} />)}
                  </ul>
                )}
              </div>
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
                    <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{fmtSectionLabel(selected.sections, lang)}</div>
                  </div>
                  <button onClick={reset} className={`text-xs font-medium ${dark ? 'text-royal-light' : 'text-royal'}`}>{t.backToResults}</button>
                </div>

                {canManage && (
                  <div className="space-y-3 mb-2">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.violationType}</label>
                        <select value={violationType} onChange={(e) => setViolationType(e.target.value)} className={inputCls}>
                          <option value="">{t.chooseViolationType}</option>
                          {VIOLATION_TYPE_KEYS.map((k) => <option key={k} value={k}>{t.violationTypeNames[k]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.violationDate}</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + ' font-en'} />
                      </div>
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.violationDescription}</label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t.violationDescriptionPlaceholder} className={inputCls} />
                    </div>
                    {saveMsg && <p className={`text-xs ${saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{saveMsg.text}</p>}
                    <button onClick={save} disabled={saving || !violationType} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-60">
                      {saving && <Loader2 size={14} className="animate-spin" />} {t.addViolation}
                    </button>
                  </div>
                )}
              </motion.div>

              {canManage && (
                <ContactParentPanel
                  student={selected}
                  name={lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar)}
                  sectionLabel={fmtSectionLabel(selected.sections, lang)}
                  defaultNote={lang === 'ar'
                    ? 'تم رصد مخالفة سلوكية لهذا الطالب، ونرجو منكم متابعة الأمر معه.'
                    : "A behavioral violation was recorded for this student — we'd like to bring this to your attention."}
                  mode="direct"
                  staff={staff} t={t} lang={lang} dark={dark} inputCls={inputCls}
                />
              )}

              <div className={cardFloating(dark, 'p-5')}>
                <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.violationsListTitle}</h2>
                {studentViolations === null ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : studentViolations.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noViolations}</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {studentViolations.map((v) => (
                      <li key={v.id} className="flex items-start gap-3 py-3">
                        <div className="h-9 w-9 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                          <AlertTriangle size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{t.violationTypeNames[v.violation_type] || v.violation_type}</div>
                          <div className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {fmtDate(v.date)}{v.staff?.full_name ? ' · ' + t.recordedBy + ' ' + v.staff.full_name : ''}
                          </div>
                          {v.description && <div className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>{v.description}</div>}
                        </div>
                        {canManage && (
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
