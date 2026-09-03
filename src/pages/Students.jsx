import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Pencil, Trash2, X, Loader2, FolderPlus } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';

const emptyForm = {
  id: null,
  sis_no: '',
  name_ar: '',
  name_en: '',
  section_id: '',
  emirates_id: '',
  id_4_digits: '',
  email: '',
  parent_email: '',
  moe_username: '',
};

export default function Students() {
  const { t, lang, dark, staff } = useApp();

  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showOptional, setShowOptional] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionForm, setSectionForm] = useState({ grade_name: '', section_name: '', grade_order: '' });
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [secRes, studRes] = await Promise.all([
      supabase.from('sections').select('id, grade_name, section_name, grade_order').order('grade_order', { ascending: true }),
      supabase.from('students').select('id, sis_no, name_ar, name_en, section_id, emirates_id, id_4_digits, email, parent_email, moe_username').order('name_ar', { ascending: true }),
    ]);
    setSections(secRes.data || []);
    setStudents(studRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const sectionLabel = (id) => {
    const s = sections.find((sec) => sec.id === id);
    return s ? `${s.grade_name} — ${s.section_name}` : '—';
  };

  const filtered = students.filter((s) => {
    const matchesSection = sectionFilter === 'ALL' || s.section_id === sectionFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || (s.name_ar || '').toLowerCase().includes(q) || (s.name_en || '').toLowerCase().includes(q) || (s.sis_no || '').toLowerCase().includes(q);
    return matchesSection && matchesSearch;
  });

  const openAdd = () => {
    setForm(emptyForm);
    setShowOptional(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setForm({
      id: s.id,
      sis_no: s.sis_no || '',
      name_ar: s.name_ar || '',
      name_en: s.name_en || '',
      section_id: s.section_id || '',
      emirates_id: s.emirates_id || '',
      id_4_digits: s.id_4_digits || '',
      email: s.email || '',
      parent_email: s.parent_email || '',
      moe_username: s.moe_username || '',
    });
    setShowOptional(false);
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.sis_no.trim() || !form.name_ar.trim() || !form.section_id) {
      setFormError(t.requiredFieldsMsg);
      return;
    }
    setSaving(true);
    setFormError('');

    const payload = {
      sis_no: form.sis_no.trim(),
      name_ar: form.name_ar.trim(),
      name_en: form.name_en.trim() || null,
      section_id: form.section_id,
      emirates_id: form.emirates_id.trim() || null,
      id_4_digits: form.id_4_digits.trim() || null,
      email: form.email.trim() || null,
      parent_email: form.parent_email.trim() || null,
      moe_username: form.moe_username.trim() || null,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from('students').update(payload).eq('id', form.id));
    } else {
      ({ error } = await supabase.from('students').insert({ ...payload, school_id: staff.school_id }));
    }

    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setModalOpen(false);
    loadAll();
  };

  const handleAddSection = async () => {
    if (!sectionForm.grade_name.trim() || !sectionForm.section_name.trim()) {
      setSectionError(t.requiredFieldsMsg);
      return;
    }
    setSectionSaving(true);
    setSectionError('');

    const { error } = await supabase.from('sections').insert({
      school_id: staff.school_id,
      grade_name: sectionForm.grade_name.trim(),
      section_name: sectionForm.section_name.trim(),
      grade_order: sectionForm.grade_order ? Number(sectionForm.grade_order) : null,
    });

    setSectionSaving(false);
    if (error) {
      setSectionError(error.message);
      return;
    }
    setSectionForm({ grade_name: '', section_name: '', grade_order: '' });
    setSectionModalOpen(false);
    loadAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('students').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (!error) {
      setDeleteTarget(null);
      loadAll();
    }
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;
  const labelCls = `block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <main className="max-w-6xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.studentsTitle}</h1>
              <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.studentsSub}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSectionModalOpen(true)}
                className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border transition-colors ${
                  dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <FolderPlus size={16} /> {t.addSection}
              </button>
              <button
                onClick={openAdd}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors"
              >
                <Plus size={16} /> {t.addStudent}
              </button>
            </div>
          </motion.div>

          {/* filters */}
          <div className={cardFloating(dark, 'p-4 mb-5 flex flex-col sm:flex-row gap-3')}>
            <div className={`flex-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${dark ? 'bg-navy border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchStudentPlaceholder}
                className="bg-transparent outline-none w-full text-sm placeholder:text-inherit"
                style={{ color: dark ? '#e2e8f0' : '#334155' }}
              />
            </div>
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className={`${inputCls} sm:w-64`}>
              <option value="ALL">{t.allSections}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.grade_name} — {s.section_name}</option>
              ))}
            </select>
          </div>

          {/* table */}
          <div className={cardFloating(dark, 'overflow-hidden')}>
            {loading ? (
              <div className="p-5 space-y-3">
                {[...Array(6)].map((_, i) => <div key={i} className={skeleton(dark, 'h-11 w-full')} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <p className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noStudentsFound}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                      <th className="text-start font-medium px-4 py-3">{t.sisNo}</th>
                      <th className="text-start font-medium px-4 py-3">{t.nameAr}</th>
                      <th className="text-start font-medium px-4 py-3 hidden sm:table-cell">{t.section}</th>
                      <th className="text-end font-medium px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                    {filtered.map((s) => (
                      <tr key={s.id} className={`transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50/70'}`}>
                        <td className="px-4 py-3 font-en">{s.sis_no || '—'}</td>
                        <td className="px-4 py-3 font-medium">{lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}</td>
                        <td className={`px-4 py-3 hidden sm:table-cell ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{sectionLabel(s.section_id)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openEdit(s)} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => setDeleteTarget(s)} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors text-rose-500 ${dark ? 'hover:bg-rose-500/10' : 'hover:bg-rose-50'}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add/Edit student modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              className={`w-full max-w-md rounded-2xl p-5 ${dark ? 'bg-navy-soft border border-slate-700' : 'bg-white border border-slate-100'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">{form.id ? t.editStudent : t.addStudent}</h2>
                <button onClick={() => setModalOpen(false)} className={`h-7 w-7 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={labelCls}>{t.sisNo}</label>
                  <input value={form.sis_no} onChange={(e) => setForm((f) => ({ ...f, sis_no: e.target.value }))} className={`${inputCls} font-en`} />
                </div>
                <div>
                  <label className={labelCls}>{t.nameAr}</label>
                  <input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t.nameEn}</label>
                  <input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} className={`${inputCls} font-en`} />
                </div>
                <div>
                  <label className={labelCls}>{t.section}</label>
                  <select value={form.section_id} onChange={(e) => setForm((f) => ({ ...f, section_id: e.target.value }))} className={inputCls}>
                    <option value="">{t.chooseSectionRequired}</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.grade_name} — {s.section_name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowOptional((v) => !v)}
                  className={`text-xs font-medium ${dark ? 'text-royal-light' : 'text-royal'}`}
                >
                  {t.optionalFields} {showOptional ? '▲' : '▼'}
                </button>

                {showOptional && (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className={labelCls}>{t.emiratesId}</label>
                      <input value={form.emirates_id} onChange={(e) => setForm((f) => ({ ...f, emirates_id: e.target.value }))} className={`${inputCls} font-en`} />
                    </div>
                    <div>
                      <label className={labelCls}>{t.id4Digits}</label>
                      <input value={form.id_4_digits} onChange={(e) => setForm((f) => ({ ...f, id_4_digits: e.target.value }))} className={`${inputCls} font-en`} maxLength={4} />
                    </div>
                    <div>
                      <label className={labelCls}>{t.studentEmail}</label>
                      <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={`${inputCls} font-en`} />
                    </div>
                    <div>
                      <label className={labelCls}>{t.parentEmail}</label>
                      <input value={form.parent_email} onChange={(e) => setForm((f) => ({ ...f, parent_email: e.target.value }))} className={`${inputCls} font-en`} />
                    </div>
                    <div>
                      <label className={labelCls}>{t.moeUsername}</label>
                      <input value={form.moe_username} onChange={(e) => setForm((f) => ({ ...f, moe_username: e.target.value }))} className={`${inputCls} font-en`} />
                    </div>
                  </div>
                )}

                {formError && <p className="text-xs text-rose-500">{formError}</p>}
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setModalOpen(false)} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t.cancel}
                </button>
                <button
                  onClick={handleSave}
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

      {/* Add section modal */}
      <AnimatePresence>
        {sectionModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              className={`w-full max-w-sm rounded-2xl p-5 ${dark ? 'bg-navy-soft border border-slate-700' : 'bg-white border border-slate-100'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold">{t.addSection}</h2>
                <button onClick={() => setSectionModalOpen(false)} className={`h-7 w-7 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                  <X size={15} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>{t.gradeName}</label>
                  <input value={sectionForm.grade_name} onChange={(e) => setSectionForm((f) => ({ ...f, grade_name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t.sectionName}</label>
                  <input value={sectionForm.section_name} onChange={(e) => setSectionForm((f) => ({ ...f, section_name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t.gradeOrder}</label>
                  <input type="number" value={sectionForm.grade_order} onChange={(e) => setSectionForm((f) => ({ ...f, grade_order: e.target.value }))} className={`${inputCls} font-en`} />
                </div>
                {sectionError && <p className="text-xs text-rose-500">{sectionError}</p>}
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setSectionModalOpen(false)} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t.cancel}
                </button>
                <button
                  onClick={handleAddSection}
                  disabled={sectionSaving}
                  className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white disabled:opacity-60"
                >
                  {sectionSaving && <Loader2 size={14} className="animate-spin" />}
                  {t.save}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              className={`w-full max-w-sm rounded-2xl p-5 ${dark ? 'bg-navy-soft border border-slate-700' : 'bg-white border border-slate-100'}`}
            >
              <p className="text-sm mb-5">{t.deleteStudentConfirm}</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeleteTarget(null)} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t.cancel}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-60"
                >
                  {deleting && <Loader2 size={14} className="animate-spin" />}
                  {t.delete}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
