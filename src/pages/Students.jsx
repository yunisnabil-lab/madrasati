import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Pencil, Trash2, X, Loader2, FolderPlus, Users, Upload, PlusCircle, Trash } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { sectionLabel as fmtSectionLabel, sectionsFor } from '../lib/sections';
import { matchesStudentSearch } from '../lib/search';
import { fetchAllRows } from '../lib/fetchAll';
import * as XLSX from 'xlsx';
import SectionPicker from '../components/SectionPicker';

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
  const isAdmin = staff && staff.role === 'admin';

  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterStream, setFilterStream] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formGrade, setFormGrade] = useState('');
  const [formStream, setFormStream] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionForm, setSectionForm] = useState({ grade_name: '', stream: '', section_number: '', grade_order: '' });
  const [sectionSaving, setSectionSaving] = useState(false);
  const [sectionError, setSectionError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectLimitMsg, setSelectLimitMsg] = useState('');
  const [bulkDeactivating, setBulkDeactivating] = useState(false);
  const [confirmBulkDeactivate, setConfirmBulkDeactivate] = useState(false);
  const MAX_BULK_SELECT = 15;

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkGrade, setBulkGrade] = useState('');
  const [bulkStream, setBulkStream] = useState('');
  const [bulkSectionId, setBulkSectionId] = useState('');
  const emptyBulkRow = () => ({ sis_no: '', name_ar: '', name_en: '' });
  const [bulkRows, setBulkRows] = useState([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
  const [bulkError, setBulkError] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkFileRef = useRef(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [secRes, studRes] = await Promise.all([
      supabase.from('sections').select('id, grade_name, grade_name_en, section_name, grade_order, stream, section_number'),
      fetchAllRows(() => supabase.from('students').select('id, sis_no, name_ar, name_en, section_id, emirates_id, id_4_digits, email, parent_email, moe_username, is_active').order('name_ar', { ascending: true })),
    ]);
    setSections(secRes.data || []);
    setStudents(studRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const sectionMap = {};
  sections.forEach((s) => { sectionMap[s.id] = s; });

  const activeFilterSectionIds = filterGrade
    ? (filterSection === '__ALL__'
        ? sectionsFor(sections, filterGrade, filterStream).map((s) => s.id)
        : (filterSection ? [filterSection] : []))
    : null;

  const filtered = students.filter((s) => {
    const matchesSection = !filterGrade || (activeFilterSectionIds && activeFilterSectionIds.includes(s.section_id));
    const matchesActive = showInactive ? s.is_active === false : s.is_active !== false;
    return matchesSection && matchesActive && matchesStudentSearch(s, search);
  });

  const openAdd = () => {
    setForm(emptyForm);
    setFormGrade('');
    setFormStream('');
    setShowOptional(false);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (s) => {
    const sec = sectionMap[s.section_id];
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
    setFormGrade(sec ? sec.grade_name : '');
    setFormStream(sec ? sec.stream || '' : '');
    setShowOptional(false);
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    if (!form.sis_no.trim() || !form.name_ar.trim() || !form.section_id) {
      setFormError(t.requiredFieldsMsg);
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (form.email.trim() && !emailPattern.test(form.email.trim())) {
      setFormError(t.invalidEmail);
      return;
    }
    if (form.parent_email.trim() && !emailPattern.test(form.parent_email.trim())) {
      setFormError(t.invalidParentEmail);
      return;
    }
    setSaving(true);
    setFormError('');

    const sisNo = form.sis_no.trim();
    const dupCheck = students.find((s) => s.sis_no === sisNo && s.id !== form.id);
    if (dupCheck) {
      setSaving(false);
      setFormError(t.duplicateSisNo);
      return;
    }

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

  const updateBulkRow = (i, field, value) => {
    setBulkRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const addBulkRow = () => setBulkRows((rows) => [...rows, emptyBulkRow()]);
  const removeBulkRow = (i) => setBulkRows((rows) => rows.filter((_, idx) => idx !== i));

  const resetBulk = () => {
    setBulkGrade('');
    setBulkStream('');
    setBulkSectionId('');
    setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
    setBulkError('');
    setBulkResult(null);
  };

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkError('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // first row is assumed to be a header row and is skipped
      const parsed = rows.slice(1)
        .filter((r) => r.some((c) => String(c).trim()))
        .map((r) => ({
          sis_no: String(r[0] ?? '').trim(),
          name_ar: String(r[1] ?? '').trim(),
          name_en: String(r[2] ?? '').trim(),
        }));
      if (parsed.length === 0) {
        setBulkError(t.excelEmptyError);
        return;
      }
      setBulkRows(parsed);
    } catch {
      setBulkError(t.excelReadError);
    }
    e.target.value = '';
  };

  const saveBulk = async () => {
    if (!isAdmin) return;
    setBulkError('');
    setBulkResult(null);

    if (!bulkSectionId) {
      setBulkError(t.bulkSectionRequired);
      return;
    }
    const cleanRows = bulkRows
      .map((r) => ({ sis_no: r.sis_no.trim(), name_ar: r.name_ar.trim(), name_en: r.name_en.trim() }))
      .filter((r) => r.sis_no || r.name_ar);

    if (cleanRows.length === 0) {
      setBulkError(t.requiredFieldsMsg);
      return;
    }
    const invalidRow = cleanRows.find((r) => !r.sis_no || !r.name_ar);
    if (invalidRow) {
      setBulkError(t.bulkRowIncomplete);
      return;
    }

    // duplicates within the batch itself
    const seen = new Set();
    for (const r of cleanRows) {
      if (seen.has(r.sis_no)) {
        setBulkError(t.bulkDuplicateInBatch.replace('{no}', r.sis_no));
        return;
      }
      seen.add(r.sis_no);
    }
    // duplicates against already-existing students
    const existingDup = cleanRows.find((r) => students.some((s) => s.sis_no === r.sis_no));
    if (existingDup) {
      setBulkError(t.duplicateSisNo + ` (${existingDup.sis_no})`);
      return;
    }

    setBulkSaving(true);
    const payload = cleanRows.map((r) => ({
      school_id: staff.school_id,
      section_id: bulkSectionId,
      sis_no: r.sis_no,
      name_ar: r.name_ar,
      name_en: r.name_en || null,
    }));
    const { error } = await supabase.from('students').insert(payload);
    setBulkSaving(false);

    if (error) {
      setBulkError(error.message);
      return;
    }
    setBulkResult(cleanRows.length);
    setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
    loadAll();
  };

  const toggleSelect = (id) => {
    setSelectLimitMsg('');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_BULK_SELECT) {
          setSelectLimitMsg(t.bulkSelectLimitMsg.replace('{max}', MAX_BULK_SELECT));
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => { setSelectedIds(new Set()); setSelectLimitMsg(''); };

  const bulkDeactivate = async () => {
    if (!isAdmin || selectedIds.size === 0) return;
    setBulkDeactivating(true);
    const { error } = await supabase.from('students').update({ is_active: false }).in('id', [...selectedIds]);
    setBulkDeactivating(false);
    setConfirmBulkDeactivate(false);
    if (!error) {
      clearSelection();
      loadAll();
    }
  };

  const handleAddSection = async () => {
    if (!isAdmin) return;
    if (!sectionForm.grade_name.trim() || !sectionForm.section_number) {
      setSectionError(t.requiredFieldsMsg);
      return;
    }

    const dupSection = sections.find((s) =>
      s.grade_name === sectionForm.grade_name.trim()
      && (s.stream || null) === (sectionForm.stream.trim() || null)
      && s.section_number === Number(sectionForm.section_number)
    );
    if (dupSection) {
      setSectionError(t.duplicateSection);
      return;
    }

    setSectionSaving(true);
    setSectionError('');

    const { error } = await supabase.from('sections').insert({
      school_id: staff.school_id,
      grade_name: sectionForm.grade_name.trim(),
      section_name: sectionForm.section_number.trim(),
      stream: sectionForm.stream.trim() || null,
      section_number: Number(sectionForm.section_number),
      grade_order: sectionForm.grade_order ? Number(sectionForm.grade_order) : null,
    });

    setSectionSaving(false);
    if (error) {
      setSectionError(error.message);
      return;
    }
    setSectionForm({ grade_name: '', stream: '', section_number: '', grade_order: '' });
    setSectionModalOpen(false);
    loadAll();
  };

  const handleDelete = async () => {
    if (!isAdmin || !deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('students').update({ is_active: false }).eq('id', deleteTarget.id);
    setDeleting(false);
    if (!error) {
      setDeleteTarget(null);
      loadAll();
    }
  };

  const handleRestore = async (student) => {
    if (!isAdmin) return;
    await supabase.from('students').update({ is_active: true }).eq('id', student.id);
    loadAll();
  };

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${
    dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
  }`;
  const labelCls = `block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-6xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.studentsTitle}</h1>
              <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.studentsSub}</p>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <>
                  <button
                    onClick={() => setSectionModalOpen(true)}
                    className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border transition-colors ${
                      dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <FolderPlus size={16} /> {t.addSection}
                  </button>
                  <button
                    onClick={() => setBulkModalOpen(true)}
                    className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border transition-colors ${
                      dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Users size={16} /> {t.bulkAddStudents}
                  </button>
                  <button
                    onClick={openAdd}
                    className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors"
                  >
                    <Plus size={16} /> {t.addStudent}
                  </button>
                </>
              )}
            </div>
          </motion.div>

          {/* filters */}
          <div className={cardFloating(dark, 'p-4 mb-5 space-y-3')}>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${dark ? 'bg-navy border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchStudentPlaceholder}
                className="bg-transparent outline-none w-full text-sm placeholder:text-inherit"
                style={{ color: dark ? '#e2e8f0' : '#334155' }}
              />
            </div>
            <SectionPicker
              sections={sections}
              lang={lang}
              dark={dark}
              grade={filterGrade}
              stream={filterStream}
              sectionId={filterSection}
              allowAll
              onGradeChange={(g) => { setFilterGrade(g); setFilterStream(''); setFilterSection(g ? '__ALL__' : ''); }}
              onStreamChange={(s) => { setFilterStream(s); setFilterSection('__ALL__'); }}
              onSectionChange={setFilterSection}
              inputCls={inputCls}
            />
            {isAdmin && (
              <label className={`flex items-center gap-2 text-xs font-medium w-fit cursor-pointer ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                <input type="checkbox" checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); clearSelection(); }} className="accent-royal" />
                {t.showInactiveStudents}
              </label>
            )}
          </div>

          {isAdmin && selectedIds.size > 0 && !showInactive && (
            <div className={cardFloating(dark, 'p-3.5 mb-4 flex flex-wrap items-center gap-3')}>
              <span className="text-sm font-medium">{t.selectedCount.replace('{n}', selectedIds.size).replace('{max}', MAX_BULK_SELECT)}</span>
              {!confirmBulkDeactivate ? (
                <>
                  <button
                    onClick={() => setConfirmBulkDeactivate(true)}
                    className="text-xs font-medium px-3.5 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white"
                  >
                    {t.deactivateSelected}
                  </button>
                  <button onClick={clearSelection} className={`text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                    {t.clearSelection}
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-rose-500 font-medium">{t.confirmBulkDeactivateMsg}</span>
                  <button onClick={bulkDeactivate} disabled={bulkDeactivating} className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-60">
                    {bulkDeactivating && <Loader2 size={13} className="animate-spin" />} {t.confirmYesDelete}
                  </button>
                  <button onClick={() => setConfirmBulkDeactivate(false)} className={`text-xs font-medium px-3.5 py-2 rounded-lg border ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                    {t.cancel}
                  </button>
                </div>
              )}
            </div>
          )}
          {selectLimitMsg && <p className="text-xs text-rose-500 mb-3">{selectLimitMsg}</p>}

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
                      {isAdmin && !showInactive && <th className="w-10 px-4 py-3"></th>}
                      <th className="text-start font-medium px-4 py-3">{t.sisNo}</th>
                      <th className="text-start font-medium px-4 py-3">{t.nameAr}</th>
                      <th className="text-start font-medium px-4 py-3 hidden sm:table-cell">{t.section}</th>
                      <th className="text-end font-medium px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                    {filtered.map((s) => (
                      <tr key={s.id} className={`transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50/70'}`}>
                        {isAdmin && !showInactive && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(s.id)}
                              onChange={() => toggleSelect(s.id)}
                              className="accent-royal"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 font-en">{s.sis_no || '—'}</td>
                        <td className="px-4 py-3 font-medium">{lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}</td>
                        <td className={`px-4 py-3 hidden sm:table-cell ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{fmtSectionLabel(sectionMap[s.section_id], lang)}</td>
                        <td className="px-4 py-3">
                          {isAdmin && (
                            <div className="flex items-center gap-1 justify-end">
                              {showInactive ? (
                                <button onClick={() => handleRestore(s)} className={`text-xs font-medium px-3 py-1.5 rounded-lg ${dark ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                                  {t.restoreStudent}
                                </button>
                              ) : (
                                <>
                                  <button onClick={() => openEdit(s)} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => setDeleteTarget(s)} className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors text-rose-500 ${dark ? 'hover:bg-rose-500/10' : 'hover:bg-rose-50'}`}>
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
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
                  <SectionPicker
                    sections={sections}
                    lang={lang}
                    dark={dark}
                    grade={formGrade}
                    stream={formStream}
                    sectionId={form.section_id}
                    onGradeChange={(g) => { setFormGrade(g); setFormStream(''); setForm((f) => ({ ...f, section_id: '' })); }}
                    onStreamChange={(s) => { setFormStream(s); setForm((f) => ({ ...f, section_id: '' })); }}
                    onSectionChange={(id) => setForm((f) => ({ ...f, section_id: id }))}
                    inputCls={inputCls}
                  />
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
                      <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={`${inputCls} font-en`} />
                    </div>
                    <div>
                      <label className={labelCls}>{t.parentEmail}</label>
                      <input type="email" value={form.parent_email} onChange={(e) => setForm((f) => ({ ...f, parent_email: e.target.value }))} className={`${inputCls} font-en`} />
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

      {/* Bulk add students modal */}
      <AnimatePresence>
        {bulkModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl p-5 ${dark ? 'bg-navy-soft border border-slate-700' : 'bg-white border border-slate-100'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-semibold">{t.bulkAddStudents}</h2>
                <button onClick={() => { setBulkModalOpen(false); resetBulk(); }} className={`h-7 w-7 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                  <X size={15} />
                </button>
              </div>
              <p className={`text-xs mb-4 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.bulkAddHint}</p>

              <div className="mb-4">
                <label className={labelCls}>{t.section} ({lang === 'ar' ? 'للدفعة كلها' : 'for the whole batch'})</label>
                <SectionPicker
                  sections={sections} lang={lang} dark={dark}
                  grade={bulkGrade} stream={bulkStream} sectionId={bulkSectionId}
                  onGradeChange={(g) => { setBulkGrade(g); setBulkStream(''); setBulkSectionId(''); }}
                  onStreamChange={(s) => { setBulkStream(s); setBulkSectionId(''); }}
                  onSectionChange={setBulkSectionId}
                  inputCls={inputCls}
                />
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.bulkRowsLabel}</span>
                <button
                  onClick={() => bulkFileRef.current && bulkFileRef.current.click()}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <Upload size={13} /> {t.uploadExcelBtn}
                </button>
                <input ref={bulkFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelUpload} />
              </div>
              <p className={`text-[11px] mb-3 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.excelFormatHint}</p>

              <div className="flex-1 overflow-y-auto space-y-2 pe-1 mb-3">
                {bulkRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      value={row.sis_no}
                      onChange={(e) => updateBulkRow(i, 'sis_no', e.target.value)}
                      placeholder={t.sisNo}
                      className={`${inputCls} font-en w-28 shrink-0`}
                    />
                    <input
                      value={row.name_ar}
                      onChange={(e) => updateBulkRow(i, 'name_ar', e.target.value)}
                      placeholder={t.nameAr}
                      className={`${inputCls} flex-1 min-w-0`}
                    />
                    <input
                      value={row.name_en}
                      onChange={(e) => updateBulkRow(i, 'name_en', e.target.value)}
                      placeholder={t.nameEn}
                      className={`${inputCls} font-en flex-1 min-w-0`}
                    />
                    <button onClick={() => removeBulkRow(i)} className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${dark ? 'hover:bg-rose-500/10 text-rose-400' : 'hover:bg-rose-50 text-rose-500'}`}>
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addBulkRow}
                className={`flex items-center gap-1.5 text-xs font-medium mb-3 ${dark ? 'text-royal-light' : 'text-royal'}`}
              >
                <PlusCircle size={14} /> {t.addAnotherRow}
              </button>

              {bulkError && <p className="text-xs text-rose-500 mb-2">{bulkError}</p>}
              {bulkResult && <p className="text-xs text-emerald-500 mb-2">{t.bulkSavedMsg.replace('{n}', bulkResult)}</p>}

              <div className="flex justify-end gap-2 pt-3 border-t border-inherit">
                <button onClick={() => { setBulkModalOpen(false); resetBulk(); }} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                  {t.cancel}
                </button>
                <button
                  onClick={saveBulk}
                  disabled={bulkSaving}
                  className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white disabled:opacity-60"
                >
                  {bulkSaving && <Loader2 size={14} className="animate-spin" />}
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
                  <label className={labelCls}>{t.streamLabel}</label>
                  <input value={sectionForm.stream} onChange={(e) => setSectionForm((f) => ({ ...f, stream: e.target.value }))} placeholder={t.streamPlaceholder} className={`${inputCls} font-en`} />
                </div>
                <div>
                  <label className={labelCls}>{t.sectionNumberLabel}</label>
                  <input type="number" value={sectionForm.section_number} onChange={(e) => setSectionForm((f) => ({ ...f, section_number: e.target.value }))} className={`${inputCls} font-en`} />
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
                  {t.deactivateStudent}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
