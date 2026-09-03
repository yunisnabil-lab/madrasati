import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Camera, Pencil, Check, X, Sun, Moon, LogOut, Loader2,
  ClipboardCheck, CalendarDays, Clock4, Shield, Eye, EyeOff,
} from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, pageBg, skeleton } from '../lib/theme';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

const ROLE_STYLE = {
  admin: { bg: 'bg-gold/15', text: 'text-gold', dot: '#e8b923' },
  viewer: { bg: 'bg-royal/15', text: 'text-royal', dot: '#3b5bdb' },
  recorder: { bg: 'bg-emerald-500/15', text: 'text-emerald-600', dot: '#05cd99' },
};

function relativeTime(iso, lang) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (mins < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (mins < 60) return rtf.format(-mins, 'minute');
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return rtf.format(-hrs, 'hour');
  const days = Math.floor(hrs / 24);
  return rtf.format(-days, 'day');
}

function firstOfMonthStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

export default function Profile() {
  const { t, lang, setLang, dark, setDark, staff, signOut, refreshStaff } = useApp();
  const fileRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(staff?.full_name || '');
  const [savingName, setSavingName] = useState(false);

  const [stats, setStats] = useState({ total: null, thisMonth: null, lastActivity: null });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    if (!staff) return;
    (async () => {
      const [totalRes, monthRes, lastRes] = await Promise.all([
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('recorded_by', staff.id),
        supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('recorded_by', staff.id).gte('date', firstOfMonthStr()),
        supabase.from('attendance_records').select('created_at').eq('recorded_by', staff.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setStats({
        total: totalRes.count ?? 0,
        thisMonth: monthRes.count ?? 0,
        lastActivity: lastRes.data?.created_at || null,
      });
    })();
  }, [staff]);

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file || !staff) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${staff.id}/avatar.${ext}`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (!upErr) {
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('staff').update({ avatar_url: pub.publicUrl + '?t=' + Date.now() }).eq('id', staff.id);
      await refreshStaff();
    }
    setUploading(false);
  }

  async function saveName() {
    if (!nameDraft.trim()) return;
    setSavingName(true);
    await supabase.from('staff').update({ full_name: nameDraft.trim() }).eq('id', staff.id);
    await refreshStaff();
    setSavingName(false);
    setEditingName(false);
  }

  async function handlePasswordUpdate() {
    setPwMsg(null);
    if (newPassword.length < 8) { setPwMsg({ type: 'err', text: t.errPasswordShort }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'err', text: t.errPasswordMismatch }); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) { setPwMsg({ type: 'err', text: t.errGeneric }); return; }
    setNewPassword('');
    setConfirmPassword('');
    setPwMsg({ type: 'ok', text: t.passwordUpdated });
  }

  if (!staff) return null;

  const roleStyle = ROLE_STYLE[staff.role] || ROLE_STYLE.recorder;
  const name = staff.full_name;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
        <main className="max-w-3xl mx-auto px-5 py-7">

          {/* hero */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cardFloating(dark, 'overflow-hidden mb-5')}>
            <div className="h-24 bg-gradient-to-r from-navy via-royal to-royal-light" />
            <div className="px-6 pb-6 -mt-10">
              <div className="flex items-end gap-4">
                <div className="relative">
                  {staff.avatar_url ? (
                    <img src={staff.avatar_url} alt="" className="h-20 w-20 rounded-2xl object-cover border-4 border-white dark:border-navy-soft shadow-lg" />
                  ) : (
                    <div className={`h-20 w-20 rounded-2xl border-4 shadow-lg flex items-center justify-center text-white text-2xl font-bold bg-gradient-to-br from-royal to-royal-light ${dark ? 'border-navy-soft' : 'border-white'}`}>
                      {initials(name)}
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current && fileRef.current.click()}
                    className="absolute -bottom-1.5 -end-1.5 h-7 w-7 rounded-full bg-royal hover:bg-royal-light text-white flex items-center justify-center shadow-md transition-colors"
                  >
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>

                <div className="flex-1 min-w-0 pb-1">
                  {editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        autoFocus
                        className={`text-lg font-bold rounded-lg px-2 py-1 outline-none border ${dark ? 'bg-navy border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-navy'}`}
                      />
                      <button onClick={saveName} disabled={savingName} className="h-7 w-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        {savingName ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => { setEditingName(false); setNameDraft(staff.full_name); }} className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${dark ? 'bg-white/10' : 'bg-slate-200'}`}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h1 className={`text-lg font-bold truncate ${dark ? 'text-white' : 'text-navy'}`}>{name}</h1>
                      <button onClick={() => setEditingName(true)} className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                  <div className={`text-xs mt-0.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{staff.email}</div>
                </div>

                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full shrink-0 ${roleStyle.bg} ${roleStyle.text}`}>
                  <Shield size={12} /> {t.roleNames[staff.role]}
                </span>
              </div>
            </div>
          </motion.div>

          {/* activity stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className={cardFloating(dark, 'p-5')}>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck size={16} className={dark ? 'text-royal-light' : 'text-royal'} />
                <span className={`text-xs font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.totalRecorded}</span>
              </div>
              <div className="text-2xl font-bold">{stats.total === null ? <span className={skeleton(dark, 'h-7 w-12 inline-block')} /> : stats.total.toLocaleString()}</div>
            </div>
            <div className={cardFloating(dark, 'p-5')}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays size={16} className={dark ? 'text-emerald-400' : 'text-emerald-600'} />
                <span className={`text-xs font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.recordedThisMonth}</span>
              </div>
              <div className="text-2xl font-bold">{stats.thisMonth === null ? <span className={skeleton(dark, 'h-7 w-12 inline-block')} /> : stats.thisMonth.toLocaleString()}</div>
            </div>
            <div className={cardFloating(dark, 'p-5')}>
              <div className="flex items-center gap-2 mb-2">
                <Clock4 size={16} className={dark ? 'text-gold' : 'text-amber-600'} />
                <span className={`text-xs font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.lastActivity}</span>
              </div>
              <div className="text-sm font-semibold pt-1.5">
                {stats.total === null
                  ? <span className={skeleton(dark, 'h-5 w-20 inline-block')} />
                  : (stats.lastActivity ? relativeTime(stats.lastActivity, lang) : t.noActivityYet)}
              </div>
            </div>
          </div>

          {/* preferences */}
          <div className={cardFloating(dark, 'p-5 mb-5')}>
            <h2 className="text-sm font-semibold mb-4">{t.preferences}</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setDark((d) => !d)}
                className={`flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg border transition-colors ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />} {dark ? t.lightMode : t.darkMode}
              </button>
              <button
                onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                className={`text-sm font-medium px-4 py-2.5 rounded-lg border transition-colors ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
          </div>

          {/* password */}
          <div className={cardFloating(dark, 'p-5 mb-5')}>
            <h2 className="text-sm font-semibold mb-4">{t.changePassword}</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t.newPassword}
                  className={`w-full rounded-lg px-3 py-2.5 pe-10 text-sm outline-none border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute inset-y-0 end-0 flex items-center px-3 text-slate-400">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.confirmNewPassword}
                className={`w-full rounded-lg px-3 py-2.5 text-sm outline-none border ${dark ? 'bg-navy border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
              />
            </div>
            {pwMsg && <p className={`text-xs mb-3 ${pwMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{pwMsg.text}</p>}
            <button
              onClick={handlePasswordUpdate}
              disabled={pwSaving || !newPassword}
              className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60"
            >
              {pwSaving && <Loader2 size={14} className="animate-spin" />}
              {t.updatePassword}
            </button>
          </div>

          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          >
            <LogOut size={15} /> {t.signOut}
          </button>
        </main>
      </div>
    </div>
  );
}
