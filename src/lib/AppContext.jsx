import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from './supabase';
import { TEXT, VIOLATION_TYPE_KEYS } from './i18n';

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

  // violation types the admin added (supabase/violation_types.sql), merged into
  // the texts so every page that shows a type name or lists the types picks
  // them up: t.violationTypeNames gets their names, t.violationTypeKeys is the
  // list to offer (active types only). With none added, t is the plain text.
  const [customTypes, setCustomTypes] = useState([]);
  const t = useMemo(() => {
    const base = TEXT[lang];
    if (customTypes.length === 0) return base;
    const names = { ...base.violationTypeNames };
    customTypes.forEach((c) => { names[c.key] = (lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar)) || c.name_ar; });
    const fixed = VIOLATION_TYPE_KEYS.filter((k) => k !== 'other');
    const active = customTypes.filter((c) => c.is_active).map((c) => c.key);
    return { ...base, violationTypeNames: names, violationTypeKeys: [...fixed, ...active, 'other'] };
  }, [lang, customTypes]);

  const loadViolationTypes = useCallback(async () => {
    const { data, error } = await supabase.from('violation_types').select('id, key, name_ar, name_en, is_active').order('created_at');
    if (error) return; // the table isn't there yet: only the built-in types
    setCustomTypes((prev) => (JSON.stringify(prev) === JSON.stringify(data || []) ? prev : (data || [])));
  }, []);
  const staffId = staff ? staff.id : null;
  useEffect(() => { if (staffId) loadViolationTypes(); else setCustomTypes([]); }, [staffId, loadViolationTypes]);

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
    // keep the SAME object when nothing changed: pages list `staff` in their
    // effect dependencies, and a new (equal) object would make each of them
    // reload and wipe what the user was typing
    if (!error) {
      setStaff((prev) => (prev && data && JSON.stringify(prev) === JSON.stringify(data) ? prev : (data || null)));
    }
    setStaffLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      fetchStaff(data.session ? data.session.user.id : null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      // returning to the tab (screenshot, another tab) re-fires SIGNED_IN /
      // TOKEN_REFRESHED for the same user: nothing about the page changed
      const sameUser = newSession && loadedUserId.current === newSession.user.id;
      if (sameUser && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) return;
      setSession((prev) => (prev && newSession && prev.user.id === newSession.user.id ? prev : (newSession || null)));
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
    customTypes, loadViolationTypes,
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
