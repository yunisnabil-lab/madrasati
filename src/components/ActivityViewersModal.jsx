import { useState, useEffect, useMemo } from 'react';
import useEscape from '../lib/useEscape';
import { X, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { normalizeArabic } from '../lib/search';
import { useDialogs } from '../lib/Dialogs';

// Admin picks an "edari" (administrative) account, then ticks which staff
// members that person may see the activity of. Stored in activity_viewers;
// the database enforces it (see supabase/activity_viewers.sql).
export default function ActivityViewersModal({ staff, t, dark, inputCls, onClose, onSaved }) {
  useEscape(onClose);
  const { notify } = useDialogs();
  const [edaris, setEdaris] = useState(null);
  const [targets, setTargets] = useState([]);
  const [grants, setGrants] = useState([]); // { viewer_id, target_id }
  const [viewerId, setViewerId] = useState('');
  const [checked, setChecked] = useState(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    (async () => {
      const [ed, tg, gr] = await Promise.all([
        supabase.from('staff').select('id, full_name').eq('role', 'edari').eq('status', 'approved').order('full_name'),
        supabase.from('staff').select('id, full_name, role').in('role', ['recorder', 'supervisor']).eq('status', 'approved').order('full_name'),
        supabase.from('activity_viewers').select('viewer_id, target_id'),
      ]);
      if (gr.error) { setBroken(true); setEdaris([]); return; }
      setEdaris(ed.data || []);
      setTargets(tg.data || []);
      setGrants(gr.data || []);
      if ((ed.data || []).length > 0) {
        const first = ed.data[0].id;
        setViewerId(first);
        setChecked(new Set((gr.data || []).filter((g) => g.viewer_id === first).map((g) => g.target_id)));
      }
    })();
  }, []);

  const pickViewer = (id) => {
    setViewerId(id);
    setChecked(new Set(grants.filter((g) => g.viewer_id === id).map((g) => g.target_id)));
  };

  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const visible = useMemo(() => {
    const q = normalizeArabic(query.trim());
    return q ? targets.filter((x) => normalizeArabic(x.full_name).includes(q)) : targets;
  }, [targets, query]);

  const save = async () => {
    if (!viewerId) return;
    setSaving(true);
    const before = new Set(grants.filter((g) => g.viewer_id === viewerId).map((g) => g.target_id));
    const toAdd = [...checked].filter((id) => !before.has(id));
    const toRemove = [...before].filter((id) => !checked.has(id));
    let failed = false;
    if (toAdd.length) {
      const { error } = await supabase.from('activity_viewers').insert(
        toAdd.map((target_id) => ({ school_id: staff.school_id, viewer_id: viewerId, target_id }))
      );
      if (error) failed = true;
    }
    if (toRemove.length) {
      const { error } = await supabase.from('activity_viewers').delete().eq('viewer_id', viewerId).in('target_id', toRemove);
      if (error) failed = true;
    }
    setSaving(false);
    if (failed) { notify(t.saveError, 'error'); return; }
    setGrants((prev) => [
      ...prev.filter((g) => g.viewer_id !== viewerId),
      ...[...checked].map((target_id) => ({ viewer_id: viewerId, target_id })),
    ]);
    notify(t.activityViewersSaved, 'success');
    if (onSaved) onSaved();
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl border ${dark ? 'bg-navy-soft border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold">{t.activityViewersTitle}</h2>
          <button onClick={onClose} className={`h-8 w-8 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}><X size={16} /></button>
        </div>
        <p className={`px-5 text-xs mb-3 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.activityViewersHint}</p>

        {broken ? (
          <p className="px-5 pb-5 text-sm text-rose-500">{t.activityViewersNotReady}</p>
        ) : edaris === null ? (
          <div className="px-5 pb-6"><Loader2 size={18} className="animate-spin" /></div>
        ) : edaris.length === 0 ? (
          <p className={`px-5 pb-6 text-sm ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t.activityViewersNoEdari}</p>
        ) : (
          <>
            <div className="px-5 mb-3">
              <label className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.activityViewersPickEdari}</label>
              <select value={viewerId} onChange={(e) => pickViewer(e.target.value)} className={inputCls}>
                {edaris.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>

            <div className="px-5 mb-2">
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border ${dark ? 'bg-navy border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Search size={15} className={dark ? 'text-slate-300' : 'text-slate-500'} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.teacherSearchPlaceholder} className="bg-transparent outline-none w-full text-sm" />
              </div>
            </div>

            <ul className={`flex-1 overflow-y-auto px-5 divide-y ${dark ? 'divide-slate-800' : 'divide-slate-100'}`}>
              {visible.map((x) => (
                <li key={x.id}>
                  <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                    <input type="checkbox" checked={checked.has(x.id)} onChange={() => toggle(x.id)} className="h-4 w-4 accent-royal" />
                    <span className="text-sm flex-1 truncate">{x.full_name}</span>
                    <span className={`text-xs shrink-0 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{t.roleNames[x.role] || x.role}</span>
                  </label>
                </li>
              ))}
            </ul>

            <div className={`flex items-center justify-between gap-3 px-5 py-3 border-t ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
              <span className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{t.activityViewersCount.replace('{n}', checked.size)}</span>
              <div className="flex gap-2">
                <button onClick={onClose} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>{t.closeBtn}</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />} {t.save}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
