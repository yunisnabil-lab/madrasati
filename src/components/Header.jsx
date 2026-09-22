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
    <header className={`no-print sticky top-0 z-20 backdrop-blur-md border-b shadow-lg transition-colors duration-300 ${dark ? 'bg-gradient-to-b from-navy-soft to-navy/80 border-royal/20' : 'bg-gradient-to-b from-white to-pearl-soft/70 border-royal/10'}`}>
      {(profileOpen || notifOpen) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => { setProfileOpen(false); setNotifOpen(false); }}
        />
      )}
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-5">

        {/* Profile — first in DOM so it renders at the visual end (right in RTL) */}
        <div className="relative">
          <button onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }} className="flex items-center gap-2.5">
            <div className="text-end hidden md:block">
              <div className="text-xs font-medium leading-tight">{staff ? staff.full_name : '...'}</div>
              <div className={`text-[11px] leading-tight ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{staff ? t.roleNames[staff.role] : ''}</div>
            </div>
            <div className="relative h-10 w-10 rounded-full">
              {staff && staff.avatar_url ? (
                <img src={staff.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold">
                  {staff ? initials(staff.full_name) : '--'}
                </div>
              )}
            </div>
          </button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className={`absolute end-0 mt-2 w-52 rounded-xl border shadow-xl py-1.5 z-30 ${dark ? 'bg-navy-soft border-slate-700' : 'bg-white border-slate-100'}`}
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
            className={`relative h-10 w-10 rounded-full flex items-center justify-center transition-colors ${dark ? 'bg-royal/15 text-royal-light hover:bg-royal/25' : 'bg-royal/10 text-royal hover:bg-royal/20'}`}
          >
            <Bell size={18} />
            {isAdmin && requests.length > 0 && (
              <span className={`absolute -top-0.5 -end-0.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-gold text-white text-[9px] font-bold ring-2 ${dark ? 'ring-navy' : 'ring-white'}`}>
                {requests.length}
              </span>
            )}
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className={`absolute end-0 mt-2 w-72 rounded-xl border shadow-xl py-2 z-30 ${dark ? 'bg-navy-soft border-slate-700' : 'bg-white border-slate-100'}`}
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

        {/* Language — shows the language you'll SWITCH TO, not a static "AR/EN" */}
        <button
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className={`hidden sm:flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${dark ? 'bg-gold/15 text-gold-light hover:bg-gold/25' : 'bg-gold/10 text-gold hover:bg-gold/20'}`}
        >
          {lang === 'ar' ? 'English' : 'عربي'}
        </button>

        {/* Live date/time */}
        <div className={`hidden lg:flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${dark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
          {dateTimeStr}
        </div>

        {/* Prominent sign-out */}
        <button
          onClick={signOut}
          title={t.signOut}
          className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${dark ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}
        >
          <LogOut size={18} />
        </button>

        {/* Search */}
        <div className={`flex-1 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm max-w-xs border transition-colors focus-within:border-royal ${dark ? 'bg-white/5 border-transparent text-slate-400 focus-within:bg-white/10' : 'bg-slate-100 border-transparent text-slate-500 focus-within:bg-white focus-within:shadow-sm'}`}>
          <Search size={17} className={dark ? 'text-royal-light' : 'text-royal'} />
          <input placeholder={t.search} className="bg-transparent outline-none placeholder:text-inherit w-full text-sm" />
        </div>

        {/* School branding — logo + name, anchored at the visual start (left) */}
        <div className={`hidden sm:flex items-center gap-2.5 ps-4 border-s ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${dark ? 'bg-royal/15' : 'bg-royal/10'}`}>
            {staff && staff.school_logo_url ? (
              <img src={staff.school_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <GraduationCap size={20} className={dark ? 'text-royal-light' : 'text-royal'} />
            )}
          </div>
          <div className="hidden md:block leading-tight">
            <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.school}</div>
            <div className={`text-[11px] ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{lang === 'ar' ? 'مدرستي' : 'Madrasati'}</div>
          </div>
        </div>

      </div>
    </header>
  );
}
