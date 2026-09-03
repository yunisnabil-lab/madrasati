import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Clock3, FileWarning, Users, Loader2 } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';

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

export default function Attendance() {
  const { t, lang, dark, staff } = useApp();

  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(todayStr());

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [statusMap, setStatusMap] = useState({}); // student_id -> status
  const [recordMap, setRecordMap] = useState({}); // student_id -> attendance_records.id

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { type: 'ok' | 'err', text }

  // load sections once
  useEffect(() => {
    (async () => {
      setSectionsLoading(true);
      const { data } = await supabase
        .from('sections')
        .select('id, grade_name, section_name, grade_order')
        .order('grade_order', { ascending: true });
      setSections(data || []);
      setSectionsLoading(false);
    })();
  }, []);

  // load students + existing attendance whenever section or date changes
  const loadRoster = useCallback(async () => {
    if (!sectionId) {
      setStudents([]);
      setStatusMap({});
      setRecordMap({});
      return;
    }
    setStudentsLoading(true);
    setSaveMsg(null);

    const { data: studs } = await supabase
      .from('students')
      .select('id, name_ar, name_en')
      .eq('section_id', sectionId)
      .order('name_ar', { ascending: true });

    const list = studs || [];
    setStudents(list);

    if (list.length > 0) {
      const ids = list.map((s) => s.id);
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id, student_id, status')
        .eq('date', date)
        .in('student_id', ids);

      const sMap = {};
      const rMap = {};
      list.forEach((s) => { sMap[s.id] = 'present'; });
      (existing || []).forEach((rec) => {
        sMap[rec.student_id] = rec.status;
        rMap[rec.student_id] = rec.id;
      });
      setStatusMap(sMap);
      setRecordMap(rMap);
    } else {
      setStatusMap({});
      setRecordMap({});
    }
    setStudentsLoading(false);
  }, [sectionId, date]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

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
        toUpdate.push({ id: existingId, status });
      } else {
        toInsert.push({
          school_id: staff.school_id,
          student_id: s.id,
          date,
          status,
          recorded_by: staff.id,
        });
      }
    });

    let hadError = false;

    if (toInsert.length) {
      const { error } = await supabase.from('attendance_records').insert(toInsert);
      if (error) hadError = true;
    }

    for (const u of toUpdate) {
      const { error } = await supabase
        .from('attendance_records')
        .update({ status: u.status })
        .eq('id', u.id);
      if (error) hadError = true;
    }

    setSaving(false);
    if (hadError) {
      setSaveMsg({ type: 'err', text: t.saveError });
    } else {
      setSaveMsg({ type: 'ok', text: t.savedSuccess });
      loadRoster();
    }
  };

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <main className="max-w-5xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.attendanceTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.attendanceSub}</p>
          </motion.div>

          {/* controls */}
          <div className={cardFloating(dark, 'p-5 mb-6 flex flex-col sm:flex-row gap-4 sm:items-end')}>
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t.chooseSection}
              </label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
                  dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <option value="">{t.chooseSectionPlaceholder}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.grade_name} — {s.section_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:w-56">
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t.dateLabel}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border font-en ${
                  dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              />
            </div>

            {students.length > 0 && (
              <div className="flex gap-2">
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
              </div>
            )}
          </div>

          {/* roster */}
          {!sectionId ? (
            <div className={cardFloating(dark, 'p-10 text-center')}>
              <Users size={28} className={`mx-auto mb-3 ${dark ? 'text-slate-600' : 'text-slate-300'}`} />
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.chooseSectionPrompt}</p>
            </div>
          ) : studentsLoading || sectionsLoading ? (
            <div className={cardFloating(dark, 'p-5 space-y-3')}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className={skeleton(dark, 'h-12 w-full')} />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className={cardFloating(dark, 'p-10 text-center')}>
              <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noStudentsInSection}</p>
            </div>
          ) : (
            <div className={cardFloating(dark, 'overflow-hidden')}>
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {students.map((s) => {
                  const name = lang === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar);
                  const current = statusMap[s.id] || 'present';
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-[11px] font-semibold shrink-0">
                        {initials(name)}
                      </div>
                      <div className="flex-1 min-w-0 text-sm font-medium truncate">{name}</div>
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
                <div className="text-xs">
                  {saveMsg && (
                    <span className={saveMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}>
                      {saveMsg.text}
                    </span>
                  )}
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
