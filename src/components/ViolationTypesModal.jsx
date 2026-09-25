import { useState } from 'react';
import { X, Plus, Loader2, Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { VIOLATION_TYPE_KEYS } from '../lib/i18n';
import useEscape from '../lib/useEscape';

// Admin: add your own violation types to the list, rename them, or hide them.
// The built-in types stay as they are. A hidden type is no longer offered when
// recording a violation, but old violations keep showing its name.
export default function ViolationTypesModal({ customTypes, schoolId, t, dark, inputCls, onClose, onChanged }) {
  useEscape(onClose);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // { id, name_ar, name_en }

  const fail = () => setErr(t.violationTypesError);

  const add = async () => {
    const ar = nameAr.trim();
    if (!ar) { setErr(t.violationTypeNameRequired); return; }
    setBusy(true); setErr('');
    const key = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const { error } = await supabase.from('violation_types').insert({ school_id: schoolId, key, name_ar: ar, name_en: nameEn.trim() || null });
    setBusy(false);
    if (error) { fail(); return; }
    setNameAr(''); setNameEn('');
    onChanged();
  };

  const toggle = async (c) => {
    setBusy(true); setErr('');
    const { error } = await supabase.from('violation_types').update({ is_active: !c.is_active }).eq('id', c.id);
    setBusy(false);
    if (error) { fail(); return; }
    onChanged();
  };

  const saveEdit = async () => {
    const ar = editing.name_ar.trim();
    if (!ar) { setErr(t.violationTypeNameRequired); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.from('violation_types').update({ name_ar: ar, name_en: editing.name_en.trim() || null }).eq('id', editing.id);
    setBusy(false);
    if (error) { fail(); return; }
    setEditing(null);
    onChanged();
  };

  const card = `w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl border ${dark ? 'bg-navy-soft border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`;
  const muted = dark ? 'text-slate-200' : 'text-slate-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={card}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold">{t.violationTypesTitle}</h2>
          <button onClick={onClose} className={`h-8 w-8 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}><X size={16} /></button>
        </div>
        <p className={`px-5 text-xs mb-3 ${muted}`}>{t.violationTypesHint}</p>

        <div className="px-5 pb-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} maxLength={60} placeholder={t.violationTypeNameArPlaceholder} className={inputCls} />
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} dir="ltr" placeholder={t.violationTypeNameEnPlaceholder} className={`${inputCls} font-en`} />
          </div>
          <button onClick={add} disabled={busy} className="flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {t.violationTypeAddBtn}
          </button>
          {err && <p className="text-xs text-rose-500">{err}</p>}
        </div>

        <div className="px-5 pb-5 overflow-y-auto">
          <div className={`text-xs font-semibold mb-2 ${muted}`}>{t.violationTypesAdded}</div>
          {customTypes.length === 0 ? (
            <p className={`text-xs mb-4 ${muted}`}>{t.violationTypesNone}</p>
          ) : (
            <ul className={`divide-y rounded-lg border mb-4 ${dark ? 'divide-slate-800 border-slate-700' : 'divide-slate-100 border-slate-200'}`}>
              {customTypes.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2.5">
                  {editing && editing.id === c.id ? (
                    <>
                      <input value={editing.name_ar} onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })} maxLength={60} className={`${inputCls} flex-1`} />
                      <input value={editing.name_en} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} maxLength={60} dir="ltr" className={`${inputCls} flex-1 font-en`} />
                      <button onClick={saveEdit} disabled={busy} className="h-9 w-9 rounded-lg flex items-center justify-center bg-emerald-500 text-white shrink-0"><Check size={15} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditing({ id: c.id, name_ar: c.name_ar, name_en: c.name_en || '' })} className={`flex-1 text-start text-sm ${c.is_active ? '' : 'line-through opacity-60'}`}>
                        {c.name_ar}{c.name_en ? <span className={`text-xs font-en ${muted}`}> · {c.name_en}</span> : null}
                      </button>
                      <button onClick={() => toggle(c)} disabled={busy} title={c.is_active ? t.violationTypeHide : t.violationTypeShow} className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                        {c.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className={`text-xs font-semibold mb-2 ${muted}`}>{t.violationTypesBuiltin}</div>
          <div className="flex flex-wrap gap-1.5">
            {VIOLATION_TYPE_KEYS.map((k) => (
              <span key={k} className={`text-xs px-2.5 py-1 rounded-full ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>{t.violationTypeNames[k]}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
