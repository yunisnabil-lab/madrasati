import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Camera, Pencil, Check, X, Sun, Moon, LogOut, Loader2,
  ClipboardCheck, CalendarDays, Clock4, Shield, Eye, EyeOff, School as SchoolIcon,
} from 'lucide-react';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { passwordProblem, passwordServerError } from '../lib/passwordRules';
import { cardFloating, pageBg, skeleton } from '../lib/theme';
import { staffCycles, shownSubjects, namesOf } from '../lib/staffInfo';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

const ROLE_STYLE = {
  admin: { bg: 'bg-gold/15', text: 'text-gold', dot: '#e8b923' },
  recorder: { bg: 'bg-emerald-500/15', text: 'text-emerald-600', dot: '#05cd99' },
  supervisor: { bg: 'bg-violet-500/15', text: 'text-violet-600', dot: '#8b5cf6' },
  edari: { bg: 'bg-orange-500/15', text: 'text-orange-600', dot: '#f97316' },
};

function relativeTime(iso, lang) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto' });
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

// Lets the user pick which part of the chosen photo becomes the avatar,
// instead of the browser's blind center-crop (object-cover) that was
// cutting off faces on non-square photos. Renders the photo at "cover"
// size by default (matching the old behavior), then lets the user drag to
// reposition and use a slider to zoom in — exactly what's visible in the
// square viewport is what gets uploaded.
function AvatarCropperModal({ imageSrc, dark, t, onCancel, onConfirm, saving }) {
  const CROP_SIZE = 260;
  const imgElRef = useRef(null);
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setNatural({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = imageSrc;
    return () => { cancelled = true; };
  }, [imageSrc]);

  useEffect(() => () => {
    window.removeEventListener('mousemove', handlePointerMoveRef.current);
    window.removeEventListener('mouseup', handlePointerUpRef.current);
    window.removeEventListener('touchmove', handlePointerMoveRef.current);
    window.removeEventListener('touchend', handlePointerUpRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerMoveRef = useRef(() => {});
  const handlePointerUpRef = useRef(() => {});

  if (!natural) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center">
        <Loader2 className="animate-spin text-white" size={28} />
      </div>
    );
  }

  const aspect = natural.w / natural.h;
  const baseW = aspect >= 1 ? CROP_SIZE * aspect : CROP_SIZE;
  const baseH = aspect >= 1 ? CROP_SIZE : CROP_SIZE / aspect;
  const dispW = baseW * zoom;
  const dispH = baseH * zoom;
  const maxOffsetX = Math.max(0, (dispW - CROP_SIZE) / 2);
  const maxOffsetY = Math.max(0, (dispH - CROP_SIZE) / 2);
  const clamp = (v, max) => Math.min(max, Math.max(-max, v));

  function handlePointerDown(e) {
    e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    dragRef.current = { startX: point.clientX, startY: point.clientY, origin: offset };
    const move = (ev) => handlePointerMove(ev);
    const up = () => handlePointerUp();
    handlePointerMoveRef.current = move;
    handlePointerUpRef.current = up;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }
  function handlePointerMove(e) {
    if (!dragRef.current) return;
    if (e.cancelable) e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    const dx = point.clientX - dragRef.current.startX;
    const dy = point.clientY - dragRef.current.startY;
    setOffset({
      x: clamp(dragRef.current.origin.x + dx, maxOffsetX),
      y: clamp(dragRef.current.origin.y + dy, maxOffsetY),
    });
  }
  function handlePointerUp() {
    dragRef.current = null;
    window.removeEventListener('mousemove', handlePointerMoveRef.current);
    window.removeEventListener('mouseup', handlePointerUpRef.current);
    window.removeEventListener('touchmove', handlePointerMoveRef.current);
    window.removeEventListener('touchend', handlePointerUpRef.current);
  }

  function handleZoomChange(newZoom) {
    const newDispW = baseW * newZoom;
    const newDispH = baseH * newZoom;
    const newMaxX = Math.max(0, (newDispW - CROP_SIZE) / 2);
    const newMaxY = Math.max(0, (newDispH - CROP_SIZE) / 2);
    setZoom(newZoom);
    setOffset((o) => ({ x: clamp(o.x, newMaxX), y: clamp(o.y, newMaxY) }));
  }

  function handleConfirm() {
    const OUTPUT = 512;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    const scale = natural.w / dispW;
    const topLeftX = CROP_SIZE / 2 - dispW / 2 + offset.x;
    const topLeftY = CROP_SIZE / 2 - dispH / 2 + offset.y;
    let sSize = CROP_SIZE * scale;
    let sx = -topLeftX * scale;
    let sy = -topLeftY * scale;
    sx = Math.max(0, Math.min(sx, natural.w - sSize));
    sy = Math.max(0, Math.min(sy, natural.h - sSize));
    ctx.drawImage(imgElRef.current, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => { if (blob) onConfirm(blob); }, 'image/jpeg', 0.92);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={`w-full max-w-sm rounded-2xl p-5 ${dark ? 'bg-navy-soft' : 'bg-white'}`}>
        <h3 className={`text-sm font-bold mb-3 ${dark ? 'text-white' : 'text-navy'}`}>{t.cropAvatarTitle}</h3>
        <div
          className="relative mx-auto overflow-hidden rounded-2xl cursor-move select-none"
          style={{ width: CROP_SIZE, height: CROP_SIZE, background: '#111', touchAction: 'none' }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        >
          <img
            ref={imgElRef}
            src={imageSrc}
            alt=""
            draggable={false}
            crossOrigin="anonymous"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: dispW,
              height: dispH,
              maxWidth: 'none',
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <span className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>−</span>
          <input
            type="range" min="1" max="3" step="0.01" value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className={`text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>+</span>
        </div>
        <p className={`text-xs mt-2 text-center ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{t.cropAvatarHint}</p>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className={`flex-1 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors ${dark ? 'bg-white/10 text-slate-200 hover:bg-white/15' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.cancel}
          </button>
          <button onClick={handleConfirm} disabled={saving} className="flex-1 flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg bg-royal hover:bg-royal-light text-white transition-colors disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { t, lang, setLang, dark, setDark, staff, signOut, refreshStaff } = useApp();
  const fileRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(staff?.full_name || '');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);

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

  function handleAvatarChange(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !staff) return;
    setAvatarMsg(null);
    setCropSrc(URL.createObjectURL(file));
  }

  async function handleCropConfirm(blob) {
    if (!staff) return;
    setUploading(true);
    const path = `${staff.id}/avatar.jpg`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (upErr) {
      console.error('Avatar upload error:', upErr);
      setAvatarMsg({ type: 'err', text: t.saveError });
      setUploading(false);
      closeCropper();
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updErr } = await supabase.from('staff').update({ avatar_url: pub.publicUrl + '?t=' + Date.now() }).eq('id', staff.id);
    if (updErr) {
      console.error('Avatar save error:', updErr);
      setAvatarMsg({ type: 'err', text: t.saveError });
      setUploading(false);
      closeCropper();
      return;
    }
    await refreshStaff();
    setUploading(false);
    closeCropper();
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function saveName() {
    if (!nameDraft.trim()) return;
    setSavingName(true);
    setNameMsg(null);
    const { error } = await supabase.from('staff').update({ full_name: nameDraft.trim() }).eq('id', staff.id);
    setSavingName(false);
    if (error) {
      console.error('Name save error:', error);
      setNameMsg({ type: 'err', text: t.saveError });
      return;
    }
    await refreshStaff();
    setEditingName(false);
  }

  async function handlePasswordUpdate() {
    setPwMsg(null);
    const problem = passwordProblem(newPassword);
    if (problem) { setPwMsg({ type: 'err', text: problem }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'err', text: 'errPasswordMismatch' }); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) { setPwMsg({ type: 'err', text: passwordServerError(error) }); return; }
    setNewPassword('');
    setConfirmPassword('');
    setPwMsg({ type: 'ok', text: 'passwordUpdated' });
  }

  if (!staff) return null;

  const roleStyle = ROLE_STYLE[staff.role] || ROLE_STYLE.recorder;
  const name = staff.full_name;

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${pageBg(dark)} ${dark ? 'text-slate-100' : 'text-slate-800'}`}>
        <main className="max-w-4xl mx-auto px-5 py-7">

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
                  {avatarMsg && (
                    <p className="absolute top-full mt-1 text-xs whitespace-nowrap text-rose-500">{avatarMsg.text}</p>
                  )}
                </div>

                <div className="flex-1 min-w-0 pb-1">
                  {editingName ? (
                    <div>
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
                        <button onClick={() => { setEditingName(false); setNameDraft(staff.full_name); setNameMsg(null); }} className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${dark ? 'bg-white/10' : 'bg-slate-200'}`}>
                          <X size={13} />
                        </button>
                      </div>
                      {nameMsg && <p className="text-xs mt-1 text-rose-500">{nameMsg.text}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h1 className={`text-lg font-bold truncate ${dark ? 'text-white' : 'text-navy'}`}>{name}</h1>
                      <button onClick={() => setEditingName(true)} className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${dark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                        <Pencil size={12} />
                      </button>
                    </div>
                  )}
                  <div className={`text-xs mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{staff.email}</div>
                </div>

                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full shrink-0 ${roleStyle.bg} ${roleStyle.text}`}>
                  <Shield size={12} /> {t.roleNames[staff.role]}
                </span>
              </div>
            </div>
          </motion.div>

          {/* school context */}
          <div className={cardFloating(dark, 'p-5 mb-5 flex items-center gap-3')}>
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${dark ? 'bg-royal/15 text-royal-light' : 'bg-royal/10 text-royal'}`}>
              <SchoolIcon size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold">{t.school}</div>
              <div className={`text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.schoolSub}</div>
            </div>
          </div>

          {(staffCycles(staff).length > 0 || shownSubjects(staff).length > 0) && (
            <div className={cardFloating(dark, 'p-5 mb-5 grid grid-cols-2 gap-4')}>
              <div>
                <div className={`text-xs mb-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.cyclesShort}</div>
                <div className="text-sm font-semibold">{staffCycles(staff).length ? namesOf(staffCycles(staff), t.cycleNames, lang) : '—'}</div>
              </div>
              {staff.role === 'recorder' && (
                <div>
                  <div className={`text-xs mb-1 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.subjectsShort}</div>
                  <div className="text-sm font-semibold">{shownSubjects(staff).length ? namesOf(shownSubjects(staff), t.subjectNames, lang) : '—'}</div>
                </div>
              )}
              <p className={`col-span-2 text-xs ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.cycleSubjectLockedNote}</p>
            </div>
          )}

          {/* activity stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className={cardFloating(dark, 'p-5')}>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardCheck size={16} className={dark ? 'text-royal-light' : 'text-royal'} />
                <span className={`text-xs font-medium ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.totalRecorded}</span>
              </div>
              <div className="text-2xl font-bold">{stats.total === null ? <span className={skeleton(dark, 'h-7 w-12 inline-block')} /> : stats.total.toLocaleString()}</div>
            </div>
            <div className={cardFloating(dark, 'p-5')}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays size={16} className={dark ? 'text-emerald-400' : 'text-emerald-600'} />
                <span className={`text-xs font-medium ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.recordedThisMonth}</span>
              </div>
              <div className="text-2xl font-bold">{stats.thisMonth === null ? <span className={skeleton(dark, 'h-7 w-12 inline-block')} /> : stats.thisMonth.toLocaleString()}</div>
            </div>
            <div className={cardFloating(dark, 'p-5')}>
              <div className="flex items-center gap-2 mb-2">
                <Clock4 size={16} className={dark ? 'text-gold' : 'text-amber-600'} />
                <span className={`text-xs font-medium ${dark ? 'text-slate-200' : 'text-slate-500'}`}>{t.lastActivity}</span>
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
                <button type="button" onClick={() => setShowPw((v) => !v)} className={`absolute inset-y-0 end-0 flex items-center px-3 ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
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
            {pwMsg && <p className={`text-xs mb-3 ${pwMsg.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'}`}>{t[pwMsg.text]}</p>}
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
      {cropSrc && (
        <AvatarCropperModal
          imageSrc={cropSrc}
          dark={dark}
          t={t}
          saving={uploading}
          onCancel={closeCropper}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}
