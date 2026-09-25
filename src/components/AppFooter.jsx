// The last line of every page: copyright of the school and the developer credit,
// small and quiet (the usual place for it on the web).
export default function AppFooter({ t, dark, className = '' }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`no-print text-center text-xs leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-500'} ${className}`}>
      <span className="font-en">©&nbsp;{year}</span> {t.school} — {t.schoolSub}
      <span className="mx-2 opacity-50">·</span>
      {t.developedBy} <span className={`font-semibold tracking-wide ${dark ? 'text-slate-100' : 'text-slate-700'}`}>{t.developerName}</span>
    </footer>
  );
}
