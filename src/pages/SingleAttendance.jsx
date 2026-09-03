import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Check } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { matchesStudentSearch } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import { STATUS_META, STATUS_LIST } from '../lib/status';
import SectionPicker from '../components/SectionPicker';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function SingleAttendance() {
  const { t, lang, dark, staff } = useApp();

  const [date, setDate] = useState(todayStr());
  const [period, setPeriod] = useState('');

  const [sections, setSections] = useState([]);
  const [grade, setGrade] = useState('');
  const [stream, setStream] = useState('');
  const [sectionSel, setSectionSel] = useState(''); // section_id or '__ALL__'

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [globalMatches, setGlobalMatches] = useState(null);
  const [sectionRoster, setSectionRoster] = useState(null);

  const [selected, setSelected] = useState(null);
  const [existingId, setExistingId] = useState(null);
  const [status, setStatus] = useState('present');
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const [sessionLog, setSessionLog] = useState([]); // [{name, status}]

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sections').select('id, grade_name, section_name, grade_order, stream, section_number');
      setSections(data || []);
    })();
  }, []);

  const activeSectionIds = useMemo(() => {
    if (!grade || !sectionSel) return null;
    if (sectionSel === '__ALL__') return sectionsFor(sections, grade, stream).map((s) => s.id);
    return [sectionSel];
  }, [sections, grade, stream, sectionSel]);

  const sectionFilterKey = activeSectionIds ? activeSectionIds.join(',') : null;

  // browsing by class: fetch the roster once whenever the class selection changes
  useEffect(() => {
    if (!sectionFilterKey) { setSectionRoster(null); return; }
    (async () => {
      setSearching(true);
      const { data } = await supabase
        .from('students')
        .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, section_name, stream, section_number, grade_order)')
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
    return globalMatches;
  }, [sectionRoster, globalMatches, query]);

  const runSearch = async () => {
    const q = query.trim();
    if (sectionRoster !== null) return;
    if (!q) { setGlobalMatches(null); return; }
    setSearching(true);
    const { data } = await fetchAllRows(() => supabase
      .from('students')
      .select('id, sis_no, name_ar, name_en, section_id, is_active, sections(grade_name, section_name, stream, section_number, grade_order)')
      .eq('is_active', true));
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

  const selectStudent = (student) => {
    setSelected(student);
    setSaveMsg(null);
  };

  // re-check the existing record whenever the selected student, date, or
  // period changes — avoids acting on a stale date/period from a closure.
  useEffect(() => {
    if (!selected || !period) {
      setStatus('present');
      setExistingId(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    (async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('id, status')
        .eq('student_id', selected.id)
        .eq('date', date)
        .eq('period', period)
        .maybeSingle();
      if (cancelled) return;
      setStatus(data ? data.status : 'present');
      setExistingId(data ? data.id : null);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [selected, date, period]);

  const save = async () => {
    if (!selected || !period) return;
    setSaving(true);
    setSaveMsg(null);

    let error;
    if (existingId) {
      ({ error } = await supabase.from('attendance_records').update({ status }).eq('id', existingId));
    } else {
      ({ error } = await supabase.from('attendance_records').insert({
        school_id: staff.school_id,
        student_id: selected.id,
        date,
        period,
        status,
        recorded_by: staff.id,
      }));
    }

    setSaving(false);
    if (error) {
      setSaveMsg({ type: 'err', text: t.saveError });
      return;
    }
    const name = lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar);
    setSessionLog((log) => [{ id: selected.id, name, status }, ...log.filter((l) => l.id !== selected.id)]);
    setSaveMsg({ type: 'ok', text: t.savedForToday });
  };

  const reset = () => {
    setSelected(null);
    setExistingId(null);
    setQuery('');
    setGlobalMatches(null);
    setSaveMsg(null);
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border font-en ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <main className="max-w-3xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.singleAttTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.singleAttSub}</p>
          </motion.div>

          {/* date + period */}
          <div className={cardFloating(dark, 'p-4 mb-5 grid grid-cols-2 gap-3 sm:w-80')}>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.dateLabel}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.periodLabel}</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls}>
                <option value="">{t.choosePeriod}</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                  <option key={p} value={p}>{t.periodN.replace('{n}', p)}</option>
                ))}
              </select>
            </div>
          </div>

          {!period ? (
            <div className={cardFloating(dark, 'p-10 text-center')}>
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.choosePeriodPrompt}</p>
            </div>
          ) : !selected ? (
            <>
              <div className={cardFloating(dark, 'p-4 mb-5 space-y-3')}>
                <SectionPicker
                  sections={sections} lang={lang} dark={dark}
                  grade={grade} stream={stream} sectionId={sectionSel}
                  allowAll
                  onGradeChange={(g) => { setGrade(g); setStream(''); setSectionSel(''); }}
                  onStreamChange={(s) => { setStream(s); setSectionSel(''); }}
                  onSectionChange={setSectionSel}
                  inputCls={inputCls.replace(' font-en', '')}
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
                    onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim() && sectionRoster === null) setGlobalMatches(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
                    placeholder={t.lookupPlaceholder}
                    className="bg-transparent outline-none w-full text-sm placeholder:text-inherit"
                    style={{ color: dark ? '#e2e8f0' : '#334155' }}
                  />
                </div>
                <button onClick={runSearch} disabled={searching} className="flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60">
                  <Search size={15} /> {lang === 'ar' ? 'بحث' : 'Search'}
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
            </>
          ) : (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cardFloating(dark, 'p-5 mb-5')}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-11 w-11 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {initials(lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{lang === 'ar' ? (selected.name_ar || selected.name_en) : (selected.name_en || selected.name_ar)}</div>
                  <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{fmtSectionLabel(selected.sections, lang)} — {t.periodN.replace('{n}', period)}</div>
                </div>
                <button onClick={reset} className={`text-xs font-medium ${dark ? 'text-royal-light' : 'text-royal'}`}>{t.backToResults}</button>
              </div>

              {checking ? (
                <div className={skeleton(dark, 'h-10 w-full')} />
              ) : (
                <div className="flex flex-wrap gap-2 mb-4">
                  {STATUS_LIST.map((key) => {
                    const meta = STATUS_META[key];
                    const Icon = meta.icon;
                    const active = status === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setStatus(key)}
                        className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border transition-colors"
                        style={active ? { background: meta.color, borderColor: 'transparent', color: '#fff' } : { borderColor: dark ? '#334155' : '#e2e8f0', color: dark ? '#94a3b8' : '#64748b' }}
                      >
                        <Icon size={15} /> {t[meta.key]}
                      </button>
                    );
                  })}
                </div>
              )}

              {saveMsg && (
                <p className={`text-xs mb-3 ${saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{saveMsg.text}</p>
              )}

              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />} {t.save}
                </button>
                {saveMsg?.type === 'ok' && (
                  <button onClick={reset} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    {t.addAnother}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {sessionLog.length > 0 && (
            <div className={cardFloating(dark, 'p-4')}>
              <h3 className={`text-xs font-semibold mb-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.recordedSoFar}</h3>
              <ul className="space-y-1.5">
                {sessionLog.map((l) => {
                  const meta = STATUS_META[l.status];
                  const Icon = meta.icon;
                  return (
                    <li key={l.id} className="flex items-center gap-2 text-sm">
                      <Check size={13} className="text-emerald-500 shrink-0" />
                      <span className="flex-1 truncate">{l.name}</span>
                      <span className="flex items-center gap-1 text-xs font-medium" style={{ color: meta.color }}>
                        <Icon size={12} /> {t[meta.key]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
