import { useEffect, useRef } from 'react';

// Runs `onEscape` when Esc is pressed while `active` is true (a popup is open).
// Every popup in the app uses this so Esc always closes it.
export default function useEscape(onEscape, active = true) {
  const ref = useRef(onEscape);
  useEffect(() => { ref.current = onEscape; });
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
