import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Users2, Search } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { sortSections, sectionLabel as fmtSectionLabel } from '../lib/sections';
import { normalizeArabic } from '../lib/search';

export default function StaffAssignments() {
  const { t, lang, dark, staff } = useApp();

  const [teachers, setTeachers] = useState([]);
  const [sections, setSections] = useState([]);
  const [assignments, setAssignments] = useState([]); // {staff_id, section_id}
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(null); // teacher row being edited
  const [checked, setChecked] = useState(new Set());
  const [saving, setSaving] = useState(false);

  // Search + filters — needed once a school has many teachers, so finding
  // "who teaches this section/subject/cycle" doesn't mean scrolling a flat list.
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [cycleFilter, setCycleFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [teachRes, secRes, asgRes] = await Promise.all([
      supabase.from('staff').select('id, full_name, email, cycle, subject').eq('role', 'recorder').eq('status', 'approved').order('full_name'),
      supabase.from('sections').select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number'),
      supabase.from('staff_sections').select('staff_id, section_id'),
    ]);
    setTeachers(teachRes.data || []);
    setSections(sortSections(secRes.data || []));
    setAssignments(asgRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const sectionCountFor = (teacherId) => assignments.filter((a) => a.staff_id === teacherId).length;

  const subjectsInUse = useMemo(() => [...new Set(teachers.map((tc) => tc.subject).filter(Boolean))], [teachers]);
  const cyclesInUse = useMemo(() => [...new Set(teachers.map((tc) => tc.cycle).filter(Boolean))], [teachers]);

  const filteredTeachers = useMemo(() => {
    const q = normalizeArabic(query.trim().toLowerCase());
    return teachers.filter((tc) => {
      if (q) {
        const hay = normalizeArabic(`${tc.full_name || ''} ${tc.email || ''}`.toLowerCase());
        if (!hay.includes(q)) return false;
      }
      if (subjectFilter && tc.subject !== subjectFilter) return false;
      if (cycleFilter && tc.cycle !== cycleFilter) return false;
      if (sectionFilter) {
        const has = assignments.some((a) => a.staff_id === tc.id && a.section_id === sectionFilter);
        if (!has) return false;
      }
      return true;
    });
  }, [teachers, query, subjectFilter, cycleFilter, sectionFilter, assignments]);

  const openEdit = (teacher) => {
    setEditing(teacher);
    const current = new Set(assignments.filter((a) => a.staff_id === teacher.id).map((a) => a.section_id));
    setChecked(current);
  };

  const toggleSection = (sectionId) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
      return next;
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const before = new Set(assignments.filter((a) => a.staff_id === editing.id).map((a) => a.section_id));
    const toAdd = [...checked].filter((id) => !before.has(id));
    const toRemove = [...before].filter((id) => !checked.has(id));

    let failed = false;

    if (toAdd.length) {
      const { error } = await supabase.from('staff_sections').insert(
        toAdd.map((section_id) => ({ school_id: staff.school_id, staff_id: editing.id, section_id }))
      );
      if (error) { console.error('Assign sections (insert) error:', error); failed = true; }
    }
    for (const section_id of toRemove) {
      const { error } = await supabase.from('staff_sections').delete().eq('staff_id', editing.id).eq('section_id', section_id);
      if (error) { console.error('Assign sections (remove) error:', error); failed = true; }
    }

    setSaving(false);
    if (failed) {
      window.alert(lang === 'ar' ? 'تعذّر حفظ بعض التعديلات، حاول مرة أخرى.' : 'Could not save some changes. Please try again.');
      loadAll();
      return;
    }
    setEditing(null);
    loadAll();
  };

  // group sections by grade for the checklist modal
  const grouped = [];
  sections.forEach((s) => {
    let g = grouped.find((x) => x.grade_name === s.grade_name);
    if (!g) { g = { grade_name: s.grade_name, items: [] }; grouped.push(g); }
    g.items.push(s);
  });

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-3xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.assignmentsTitle}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.assignmentsSub}</p>
          </motion.div>

          {!loading && teachers.length > 0 && (
            <div className={cardFloating(dark, 'p-4 mb-5 space-y-3')}>
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${dark ? 'bg-navy border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.teacherSearchPlaceholder}
                  className="bg-transparent outline-none w-full text-sm placeholder:text-inherit"
                  style={{ color: dark ? '#e2e8f0' : '#334155' }}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                  <option value="">{t.allSubjects}</option>
                  {subjectsInUse.map((sub) => <option key={sub} value={sub}>{t.subjectNames[sub] || sub}</option>)}
                </select>
                <select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value)} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                  <option value="">{t.allCycles}</option>
                  {cyclesInUse.map((cyc) => <option key={cyc} value={cyc}>{t.cycleNames[cyc] || cyc}</option>)}
                </select>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                  <option value="">{t.allSections}</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{fmtSectionLabel(s, lang)}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className={cardFloating(dark, 'overflow-hidden')}>
            {loading ? (
              <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className={skeleton(dark, 'h-12 w-full')} />)}</div>
            ) : teachers.length === 0 ? (
              <div className="p-10 text-center">
                <Users2 size={26} className={`mx-auto mb-3 ${dark ? 'text-slate-600' : 'text-slate-300'}`} />
                <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noTeachersYet}</p>
              </div>
            ) : filteredTeachers.length === 0 ? (
              <div className="p-10 text-center">
                <Search size={26} className={`mx-auto mb-3 ${dark ? 'text-slate-600' : 'text-slate-300'}`} />
                <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noTeachersMatch}</p>
              </div>
            ) : (
              <ul className={`divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {filteredTeachers.map((tch) => (
                  <li key={tch.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{tch.full_name}</div>
                      <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{tch.email}</div>
                    </div>
                    <button
                      onClick={() => openEdit(tch)}
                      className={`shrink-0 text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      {t.assignedSectionsCount.replace('{n}', sectionCountFor(tch.id))}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              className={`w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl p-5 ${dark ? 'bg-navy-soft border border-slate-700' : 'bg-white border border-slate-100'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold">{editing.full_name}</h2>
                <button onClick={() => setEditing(null)} className={`h-7 w-7 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                  <X size={15} />
                </button>
              </div>
              <p className={`text-xs mb-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.assignSectionsHint}</p>

              <div className="flex-1 overflow-y-auto space-y-4 pe-1">
                {grouped.map((g) => (
                  <div key={g.grade_name}>
                    <div className={`text-xs font-semibold mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{g.grade_name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((s) => {
                        const active = checked.has(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleSection(s.id)}
                            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                              active
                                ? 'bg-royal text-white border-transparent'
                                : dark ? 'border-slate-700 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {s.section_name ?? '—'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-inherit">
                <button onClick={() => setEditing(null)} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t.cancel}
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white disabled:opacity-60"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {t.save}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
