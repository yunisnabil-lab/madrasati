import { useState } from 'react';
import { X } from 'lucide-react';
import { sortSections, gradeLabel } from '../lib/sections';
import { cycleForGradeOrder } from '../lib/staffInfo';

// Pick the sections a teacher/supervisor works with. When `cycles` is given
// (the cycles they chose at registration), only sections in those cycles are
// listed at first, with a toggle to show every grade.
export default function SectionChecklistModal({ title, hint, sections, initial, cycles, onDone, onClose, t, lang, dark }) {
  const [checked, setChecked] = useState(() => new Set(initial || []));
  const [showAll, setShowAll] = useState(!cycles || cycles.length === 0);

  const visible = sortSections(sections).filter(
    (s) => showAll || checked.has(s.id) || cycles.includes(cycleForGradeOrder(s.grade_order))
  );
  const grouped = [];
  visible.forEach((s) => {
    let g = grouped.find((x) => x.grade_name === s.grade_name);
    if (!g) { g = { grade_name: s.grade_name, grade_name_en: s.grade_name_en, items: [] }; grouped.push(g); }
    g.items.push(s);
  });

  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className={`w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl p-5 ${dark ? 'bg-navy-soft border border-slate-700 text-slate-100' : 'bg-white border border-slate-100 text-slate-800'}`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className={`h-7 w-7 rounded-full flex items-center justify-center ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
            <X size={15} />
          </button>
        </div>
        {hint && <p className={`text-xs mb-2 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{hint}</p>}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setChecked(new Set(sections.map((s) => s.id)))}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
          >
            {t.selectAllSections}
          </button>
          <button
            type="button"
            onClick={() => setChecked(new Set())}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
          >
            {t.clearAllSections}
          </button>
        </div>
        {cycles && cycles.length > 0 && (
          <label className={`flex items-center gap-2 text-xs font-medium mb-3 w-fit cursor-pointer ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-royal" />
            {t.showAllGrades}
          </label>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 pe-1">
          {grouped.map((g) => (
            <div key={g.grade_name}>
              <div className={`text-xs font-semibold mb-1.5 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{gradeLabel(g.grade_name, g.grade_name_en, lang)}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((s) => {
                  const active = checked.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                        active
                          ? 'bg-royal text-white border-transparent'
                          : dark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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

        <div className={`flex justify-end gap-2 mt-4 pt-3 border-t ${dark ? 'border-slate-700' : 'border-slate-100'}`}>
          <button onClick={onClose} className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
            {t.cancel}
          </button>
          <button onClick={() => onDone([...checked])} className="text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white">
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
