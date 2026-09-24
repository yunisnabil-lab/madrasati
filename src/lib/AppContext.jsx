import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { TEXT } from './i18n';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('madrasati-lang') || 'ar');
  const [dark, setDark] = useState(() => localStorage.getItem('madrasati-theme') === 'dark');
  const [session, setSession] = useState(undefined); // undefined = not checked yet
  const [staff, setStaff] = useState(null);
  const [staffLoading, setStaffLoading] = useState(true);
  // set by a page (Attendance) while it holds unsaved edits, so navigation
  // links elsewhere in the layout can ask before throwing them away
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const t = TEXT[lang];

  // true = OK to leave; asks first when the current page has unsaved edits
  const confirmLeave = useCallback(
    () => !hasUnsaved || window.confirm(TEXT[lang].unsavedLeaveConfirm),
    [hasUnsaved, lang]
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
  }, [lang, t.dir]);

  useEffect(() => {
    localStorage.setItem('madrasati-theme', dark ? 'dark' : 'light');
    // Tell the browser itself (not just our own Tailwind classes) which
    // theme is active. Two things depend on this:
    // 1) native controls (date pickers, <select> popups, scrollbars) are
    //    drawn by the OS/browser using its own light/dark chrome, entirely
    //    outside our CSS — without this they stay light even on a dark
    //    page, e.g. a near-black calendar icon on a navy input.
    // 2) tailwind.config.js uses `darkMode: 'class'`, so any `dark:` utility
    //    class in the app only ever activates while this class is present.
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('madrasati-lang', lang);
  }, [lang]);

  // whose staff row is currently loaded; Supabase re-fires auth events
  // (token refresh, SIGNED_IN) whenever the tab regains focus, and showing
  // the loading screen then would unmount the open page and lose its state
  const loadedUserId = useRef(null);

  const fetchStaff = useCallback(async (userId) => {
    if (!userId) { loadedUserId.current = null; setStaff(null); setStaffLoading(false); return; }
    // same user again: refresh quietly in the background
    if (loadedUserId.current !== userId) setStaffLoading(true);
    loadedUserId.current = userId;
    const { data, error } = await supabase
      .from('staff')
      // '*' so newer columns (cycles, subjects) load when present without
      // breaking sign-in on a database that doesn't have them yet
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    // a failed background refresh (e.g. a network blip) keeps the old row
    // instead of signing the user out of every page
    if (!error) setStaff(data || null);
    setStaffLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      fetchStaff(data.session ? data.session.user.id : null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
      fetchStaff(newSession ? newSession.user.id : null);
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchStaff]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStaff(null);
  }, []);

  const refreshStaff = useCallback(() => {
    return fetchStaff(session ? session.user.id : null);
  }, [fetchStaff, session]);

  const value = {
    lang, setLang, t,
    dark, setDark,
    session, staff, staffLoading,
    refreshStaff,
    fetchStaff,
    signOut,
    setHasUnsaved,
    confirmLeave,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
