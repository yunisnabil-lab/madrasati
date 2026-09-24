// A friendlier "nothing here" block than a bare grey line: an icon, the
// message, and an optional hint underneath.
export default function EmptyState({ icon: Icon, text, hint, dark, compact = false }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-5' : 'py-8'}`}>
      {Icon && (
        <div className={`h-11 w-11 rounded-full flex items-center justify-center mb-2.5 ${dark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-400'}`}>
          <Icon size={20} />
        </div>
      )}
      <p className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{text}</p>
      {hint && <p className={`text-xs mt-1 max-w-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</p>}
    </div>
  );
}
