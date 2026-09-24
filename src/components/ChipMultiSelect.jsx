// Pick any number of options by tapping chips — used for a staff member's
// cycles and subjects, which can each have more than one value.
export default function ChipMultiSelect({ options, value, onChange, dark = false, disabled = false }) {
  const selected = new Set(value || []);
  const toggle = (v) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    // keep the options' own order rather than the order they were tapped in
    onChange(options.map((o) => o.value).filter((o) => next.has(o)));
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => toggle(o.value)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
              active
                ? 'bg-royal text-white border-transparent'
                : dark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
