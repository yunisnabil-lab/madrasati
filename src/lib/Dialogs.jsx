import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useApp } from './AppContext';

// In-app replacements for the browser's window.confirm / window.alert, so
// confirmations and messages look like the rest of the site.
//   const { confirm, notify } = useDialogs();
//   if (!(await confirm(t.confirmDeleteViolation))) return;
//   notify(t.saveError, 'error');
const DialogsCtx = createContext(null);

export function DialogsProvider({ children }) {
  const { t, dark } = useApp();
  const [confirmState, setConfirmState] = useState(null); // { message, resolve }
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const confirm = useCallback(
    (message) => new Promise((resolve) => setConfirmState({ message, resolve })),
    []
  );

  const closeConfirm = (answer) => {
    if (confirmState) confirmState.resolve(answer);
    setConfirmState(null);
  };

  const notify = useCallback((message, type = 'info') => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, message, type }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e) => { if (e.key === 'Escape') closeConfirm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState]);

  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tones = {
    success: 'text-emerald-500',
    error: 'text-rose-500',
    info: dark ? 'text-royal-light' : 'text-royal',
  };

  return (
    <DialogsCtx.Provider value={{ confirm, notify }}>
      {children}

      {confirmState && (
        <div className="no-print fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => closeConfirm(false)}>
          <div
            role="alertdialog"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl ${dark ? 'bg-navy-soft border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}
          >
            <p className="text-sm leading-relaxed mb-5">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => closeConfirm(false)}
                className={`text-sm font-medium px-4 py-2.5 rounded-lg border ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                {t.cancel}
              </button>
              <button
                autoFocus
                onClick={() => closeConfirm(true)}
                className="text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white"
              >
                {t.confirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="no-print fixed bottom-20 md:bottom-6 inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((x) => {
          const Icon = icons[x.type] || Info;
          return (
            <div
              key={x.id}
              className={`pointer-events-auto flex items-start gap-2.5 max-w-md w-full rounded-xl border px-4 py-3 shadow-xl text-sm ${dark ? 'bg-navy-soft border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}
            >
              <Icon size={17} className={`shrink-0 mt-0.5 ${tones[x.type] || tones.info}`} />
              <span className="flex-1">{x.message}</span>
              <button onClick={() => setToasts((list) => list.filter((y) => y.id !== x.id))} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </DialogsCtx.Provider>
  );
}

export function useDialogs() {
  const ctx = useContext(DialogsCtx);
  if (!ctx) throw new Error('useDialogs must be used inside DialogsProvider');
  return ctx;
}
