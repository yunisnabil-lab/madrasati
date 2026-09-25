// The last lines of every page: the school's copyright, and under it, lighter,
// the developer credit — small and quiet, with a thin gold rule above.
export default function AppFooter({ t, dark, className = '' }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`no-print text-center leading-relaxed ${className}`}>
      <div className="mx-auto mb-3 h-px w-16 bg-gold/60" />
      <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
        <span className="font-en">©&nbsp;{year}</span> {t.rightsReserved} — {t.school} - {t.schoolSub}
      </div>
      <div className={`text-[11px] mt-0.5 ${dark ? 'text-slate-300' : 'text-slate-500'}`}>
        {t.developedBy}: <span className={`font-semibold tracking-wide ${dark ? 'text-slate-100' : 'text-slate-700'}`}>{t.developerName}</span>
      </div>
    </footer>
  );
}
