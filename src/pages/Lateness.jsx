import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Trash2, Clock3, AlertTriangle } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { matchesStudentSearch } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel } from '../lib/sections';

const REPEAT_THRESHOLD = 3;
const RANGE_OPTIONS = [7, 30, 90];

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// Morning lateness recorded here (morning_lateness table) is a manual entry
// made by the supervisor at the gate/entrance — it is entirely independent
// of the class-period attendance system (attendance_records / period 1).
export default function Lateness() {
  const { t, lang, dark, staff } = useApp();
  const canManage = staff && (staff.role === 'admin' || staff.role === 'supervisor');

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState(null);
  const [selected, setSelected] = useState(null);

  const [date, setDate] = useState(todayStr());
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const [studentLateness, setStudentLateness] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [rangeDays, setRangeDays] = useState(30);
  const [aggLoading, setAggLoading] = useState(true);
  const [aggRows, setAggRows] = useState([]);

  const loadAggregate = useCallback(async (days) => {
    setAggLoading(true);
    const from = daysAgoStr(days);
    const { data } = await fetchAllRows(() => supabase
      .from('morning_lateness')
      .select('id, student_id, date, students(name_ar, name_en, is_active, sections(grade_name, grade_name_en, section_name, stream, section_number, grade_order))')
      .gte('date', from));

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

    const list = Array.from(byStudent.values()).sort((a, b) => b.count - a.count);
    setAggRows(list);
    setAggLoading(false);
  }, []);

  useEffect(() => { if (!selected) loadAggregate(rangeDays); }, [rangeDays, selected, loadAggregate]);

  const loadStudentLateness = useCallback(async (studentId) => {
    const { data } = await supabase
      .from('morning_lateness')
      .select('id, date, description, created_at, staff(full_name)')
      .eq('student_id', studentId)
      .order('date', { ascending: false });
    setStudentLateness(data || []);
  }, []);

  useEffect(() => {
    if (selected) loadStudentLateness(selected.id);
    else setStudentLateness(null);
  }, [selected, loadStudentLateness]);

  const runSearch = async () => {
    const q = query.trim();
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
    if (!selected) return;
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
    setDeletingId(id);
    const { error } = await supabase.from('morning_lateness').delete().eq('id', id);
    setDeletingId(null);
    if (!error) {
      if (selected) loadStudentLateness(selected.id);
      loadAggregate(rangeDays);
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
          <div className="h-9 w-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 text-xs font-semibold">
            {initials(name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{name}</div>
            <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
              {s.sections ? fmtSectionLabel(s.sections, lang) : '—'}
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.latenessTitle}</h1>
              <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.latenessSub}</p>
            </div>
            {!selected && (
              <select
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value))}
                className={`text-sm rounded-lg px-3 py-2 border outline-none ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                {RANGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{t.latenessRangeLabel.replace('{n}', n)}</option>
                ))}
              </select>
            )}
          </motion.div>

          {!selected ? (
            <>
              <div className={cardFloating(dark, 'p-4 mb-5 flex gap-2')}>
                <div className={`flex-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${dark ? 'bg-navy border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setMatches(null); }}
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

              {matches !== null && (
                <div className={cardFloating(dark, 'overflow-hidden mb-5')}>
                  {matches.length === 0 ? (
                    <div className="p-8 text-center"><p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.lookupNoResults}</p></div>
                  ) : (
                    <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {matches.map((s) => {
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
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.repeatedLatenessTitle}</h2>
                </div>
                {aggLoading ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : repeated.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noLatenessRecords}</p>
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
                </div>
                {aggLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : rest.length === 0 && repeated.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noLatenessRecords}</p>
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
                        <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.latenessDate}</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + ' font-en'} />
                      </div>
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.latenessDescription}</label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t.latenessDescriptionPlaceholder} className={inputCls} />
                    </div>
                    {saveMsg && <p className={`text-xs ${saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{saveMsg.text}</p>}
                    <button onClick={save} disabled={saving} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60">
                      {saving && <Loader2 size={14} className="animate-spin" />} {t.addLateness}
                    </button>
                  </div>
                )}
              </motion.div>

              <div className={cardFloating(dark, 'p-5')}>
                <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-white' : 'text-slate-900'}`}>{t.latenessRecordsTitle}</h2>
                {studentLateness === null ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
                ) : studentLateness.length === 0 ? (
                  <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noLatenessForStudent}</p>
                ) : (
                  <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {studentLateness.map((l) => (
                      <li key={l.id} className="flex items-start gap-3 py-3">
                        <div className="h-9 w-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                          <Clock3 size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{fmtDate(l.date)}</div>
                          <div className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {l.staff?.full_name ? t.recordedBy + ' ' + l.staff.full_name : ''}
                          </div>
                          {l.description && <div className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>{l.description}</div>}
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
    </div>
  );
}
