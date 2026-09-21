import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Sun, Moon, LogOut, Camera, UserCircle2, GraduationCap } from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function useLiveNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function Header() {
  const navigate = useNavigate();
  const { t, lang, setLang, dark, setDark, staff, signOut, refreshStaff } = useApp();
  const isAdmin = staff && staff.role === 'admin';
  const now = useLiveNow();
  const dateTimeStr = new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(now);

  const [requests, setRequests] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const loadRequests = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, email, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setRequests(data || []);
  }, [isAdmin]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file || !staff) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${staff.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (upErr) {
      console.error('Avatar upload error:', upErr);
      window.alert(lang === 'ar' ? 'تعذّر رفع الصورة، حاول مرة أخرى.' : 'Could not upload photo. Please try again.');
      setUploading(false);
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updErr } = await supabase.from('staff').update({ avatar_url: pub.publicUrl + '?t=' + Date.now() }).eq('id', staff.id);
    if (updErr) {
      console.error('Avatar save error:', updErr);
      window.alert(lang === 'ar' ? 'تعذّر حفظ الصورة، حاول مرة أخرى.' : 'Could not save photo. Please try again.');
      setUploading(false);
      return;
    }
    await refreshStaff();
    setUploading(false);
  }

  return (
    <header className="no-print sticky top-0 z-20 shadow-lg border-b border-slate-400/30 bg-gradient-to-l from-slate-700 via-slate-600 to-slate-500">
      {(profileOpen || notifOpen) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => { setProfileOpen(false); setNotifOpen(false); }}
        />
      )}
      <div className="max-w-7xl mx-auto px-7 py-5 flex items-center gap-6 text-white">

        {/* Profile — first in DOM so it renders at the visual end (right in RTL) */}
        <div className="relative">
          <button onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }} className="flex items-center gap-3">
            <div className="text-end hidden md:block">
              <div className="text-sm font-semibold leading-tight text-white">{staff ? staff.full_name : '...'}</div>
              <div className="text-[11px] leading-tight text-slate-300/70">{staff ? t.roleNames[staff.role] : ''}</div>
            </div>
            <div className="relative h-11 w-11 rounded-full ring-2 ring-white/20">
              {staff && staff.avatar_url ? (
                <img src={staff.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="h-11 w-11 rounded-full bg-gradient-to-br from-gold to-gold-light flex items-center justify-center text-navy text-sm font-bold">
                  {staff ? initials(staff.full_name) : '--'}
                </div>
              )}
            </div>
          </button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className={`absolute end-0 mt-2 w-52 rounded-xl border shadow-xl py-1.5 z-30 ${dark ? 'bg-navy-soft border-slate-700 text-slate-200' : 'bg-white border-slate-100 text-slate-700'}`}
              >
                <button
                  onClick={() => { navigate('/profile'); setProfileOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                >
                  <UserCircle2 size={14} /> {t.viewProfile}
                </button>
                <button
                  onClick={() => { fileRef.current && fileRef.current.click(); setProfileOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                >
                  <Camera size={14} /> {t.uploadPhoto}{uploading ? '…' : ''}
                </button>
                <button
                  onClick={() => setDark((d) => !d)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                >
                  {dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? (lang === 'ar' ? 'الوضع الفاتح' : 'Light mode') : (lang === 'ar' ? 'الوضع الغامق' : 'Dark mode')}
                </button>
                <button
                  onClick={signOut}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                >
                  <LogOut size={14} /> {t.signOut}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
            className="relative h-11 w-11 rounded-full flex items-center justify-center bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <Bell size={20} />
            {isAdmin && requests.length > 0 && (
              <span className="absolute -top-0.5 -end-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full bg-gold text-navy text-[10px] font-extrabold ring-2 ring-slate-600">
                {requests.length}
              </span>
            )}
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className={`absolute end-0 mt-2 w-72 rounded-xl border shadow-xl py-2 z-30 ${dark ? 'bg-navy-soft border-slate-700 text-slate-200' : 'bg-white border-slate-100 text-slate-700'}`}
              >
                <div className="px-3.5 py-1.5 text-xs font-semibold">{t.notifications}</div>
                {isAdmin && requests.length > 0 ? (
                  requests.map((r) => (
                    <div key={r.id} className="px-3.5 py-2 text-xs">
                      <span className={dark ? 'text-slate-400' : 'text-slate-500'}>{t.newRequestNotif}</span>{' '}
                      <span className="font-medium">{r.full_name}</span>
                    </div>
                  ))
                ) : (
                  <div className={`px-3.5 py-2 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noNotifications}</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Language */}
        <button
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="hidden sm:flex items-center justify-center rounded-full px-3.5 py-2 text-xs font-extrabold tracking-wide bg-gold text-navy transition-colors hover:bg-gold-light"
        >
          AR/EN
        </button>

        {/* Live date/time */}
        <div className="hidden lg:flex items-center gap-1 rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap bg-white/10 text-slate-200">
          {dateTimeStr}
        </div>

        {/* Prominent sign-out */}
        <button
          onClick={signOut}
          title={t.signOut}
          className="h-11 w-11 rounded-full flex items-center justify-center shrink-0 bg-rose-500/20 text-rose-300 transition-colors hover:bg-rose-500/30"
        >
          <LogOut size={20} />
        </button>

        {/* Search */}
        <div className="flex-1 flex items-center gap-2.5 rounded-full px-5 py-3 text-sm max-w-xs border border-white/10 bg-white/10 text-slate-200 transition-colors focus-within:bg-white/15 focus-within:border-white/30">
          <Search size={18} className="text-gold-light" />
          <input placeholder={t.search} className="bg-transparent outline-none placeholder:text-slate-300/70 w-full text-sm text-white" />
        </div>

        {/* School branding — logo + name, anchored at the visual start (left) */}
        <div className="hidden sm:flex items-center gap-3 ps-5 border-s border-white/15">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden bg-white/15 ring-1 ring-white/20">
            {staff && staff.school_logo_url ? (
              <img src={staff.school_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <GraduationCap size={24} className="text-gold-light" />
            )}
          </div>
          <div className="hidden md:block leading-tight">
            <div className="text-base font-extrabold text-white">{t.school}</div>
            <div className="text-[11px] text-slate-300/70">{lang === 'ar' ? 'مدرستي' : 'Madrasati'}</div>
          </div>
        </div>

      </div>
    </header>
  );
}
