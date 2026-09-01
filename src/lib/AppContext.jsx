import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { TEXT } from './i18n';

const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [lang, setLang] = useState('ar');
  const [dark, setDark] = useState(() => localStorage.getItem('madrasati-theme') === 'dark');
  const [session, setSession] = useState(undefined); // undefined = not checked yet
  const [staff, setStaff] = useState(null);
  const [staffLoading, setStaffLoading] = useState(true);

  const t = TEXT[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
  }, [lang, t.dir]);

  useEffect(() => {
    localStorage.setItem('madrasati-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const fetchStaff = useCallback(async (userId) => {
    if (!userId) { setStaff(null); setStaffLoading(false); return; }
    setStaffLoading(true);
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, role, status, school_id, avatar_url, email')
      .eq('id', userId)
      .maybeSingle();
    setStaff(data || null);
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

  const value = {
    lang, setLang, t,
    dark, setDark,
    session, staff, staffLoading,
    refreshStaff: () => fetchStaff(session ? session.user.id : null),
    signOut,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
