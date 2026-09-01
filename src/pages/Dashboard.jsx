import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, ChevronDown, Sun, Moon, Users, GraduationCap,
  School as SchoolIcon, Clock, LogOut, Camera,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useApp } from '../lib/AppContext';
import { supabase } from '../lib/supabase';
import { cardFloating, skeleton } from '../lib/theme';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-royal/10 text-royal',
  'bg-gold/10 text-gold-deep',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
];

function CustomTooltip({ active, payload, label, dark }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg border ${dark ? 'bg-navy-soft border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
      <div className="font-medium">{label}</div>
      <div className="text-royal-light font-en">{payload[0].value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { t, lang, setLang, dark, setDark, staff, signOut, refreshStaff } = useApp();
  const isAdmin = staff && staff.role === 'admin';

  const [kpi, setKpi] = useState({ students: null, staffCount: null, sections: null });
  const [gradeData, setGradeData] = useState([]);
  const [recent, setRecent] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [chartType, setChartType] = useState('bar');
  const [notifOpen, setNotifOpen] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [roleChoice, setRoleChoice] = useState({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const [s, st, sec] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }),
      supabase.from('staff').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('sections').select('id', { count: 'exact', head: true }),
    ]);
    setKpi({ students: s.count, staffCount: st.count, sections: sec.count });
    setStatsLoading(false);
  }, []);

  const loadGradeChart = useCallback(async () => {
    setChartLoading(true);
    const { data: secs } = await supabase.from('sections').select('id, grade_name, grade_order');
    const { data: studs } = await supabase.from('students').select('section_id');
    if (!secs || !studs) { setChartLoading(false); return; }
    const bySection = {};
    studs.forEach((s) => { bySection[s.section_id] = (bySection[s.section_id] || 0) + 1; });
    const byGrade = {};
    secs.forEach((sec) => {
      const key = sec.grade_name;
      if (!byGrade[key]) byGrade[key] = { total: 0, order: sec.grade_order != null ? sec.grade_order : 99 };
      byGrade[key].total += bySection[sec.id] || 0;
    });
    const rows = Object.keys(byGrade)
      .map((name) => ({ name, v: byGrade[name].total, order: byGrade[name].order }))
      .sort((a, b) => a.order - b.order);
    setGradeData(rows);
    setChartLoading(false);
  }, []);

  const loadRecent = useCallback(async () => {
    setRecentLoading(true);
    const { data } = await supabase
      .from('students')
      .select('name_ar, name_en, sections(grade_name, section_name)')
      .order('created_at', { ascending: false })
      .limit(5);
    setRecent(data || []);
    setRecentLoading(false);
  }, []);

  const loadRequests = useCallback(async () => {
    if (!isAdmin) { setRequestsLoading(false); return; }
    setRequestsLoading(true);
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, email, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setRequests(data || []);
    setRequestsLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    loadStats();
    loadGradeChart();
    loadRecent();
    loadRequests();
  }, [loadStats, loadGradeChart, loadRecent, loadRequests]);

  async function approve(id, role) {
    await supabase.from('staff').update({ status: 'approved', role }).eq('id', id);
    setRequests((r) => r.filter((row) => row.id !== id));
    loadStats();
  }

  async function reject(id) {
    await supabase.from('staff').delete().eq('id', id);
    setRequests((r) => r.filter((row) => row.id !== id));
  }

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

  const kpiCards = [
    { label: t.totalStudents, value: kpi.students, icon: GraduationCap, hint: lang === 'ar' ? 'مسجّلون في النظام' : 'enrolled in the system' },
    { label: t.staffMembers, value: kpi.staffCount, icon: Users, hint: lang === 'ar' ? 'حسابات معتمدة' : 'approved accounts' },
    { label: t.sections, value: kpi.sections, icon: SchoolIcon, hint: lang === 'ar' ? 'فصل دراسي نشط' : 'active sections' },
    ...(isAdmin ? [{ label: t.pendingReq, value: requests.length, icon: Clock, hint: lang === 'ar' ? 'بانتظار المراجعة' : 'awaiting review' }] : []),
  ];

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-navy text-slate-200' : 'bg-slate-100 text-slate-800'}`}>

        <header className={`sticky top-0 z-20 backdrop-blur-md border-b transition-colors duration-300 ${dark ? 'bg-navy/70 border-slate-800' : 'bg-white/80 border-slate-200/60 shadow-sm'}`}>
          <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center gap-4">

            {/* Profile — first in DOM so it renders at the visual end (right in RTL) */}
            <div className="relative">
              <button onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2.5">
                <div className="text-end hidden md:block">
                  <div className="text-xs font-medium leading-tight">{staff ? staff.full_name : '...'}</div>
                  <div className={`text-[11px] leading-tight ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{staff ? t.roleNames[staff.role] : ''}</div>
                </div>
                <div className="relative h-9 w-9 rounded-full">
                  {staff && staff.avatar_url ? (
                    <img src={staff.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold">
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
                onClick={() => setNotifOpen((v) => !v)}
                className={`relative h-9 w-9 rounded-full flex items-center justify-center transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`}
              >
                <Bell size={16} />
                {isAdmin && requests.length > 0 && (
                  <span className="absolute top-2 end-2 h-1.5 w-1.5 rounded-full bg-gold" />
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

            {/* Language */}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className={`hidden sm:block text-xs font-semibold tracking-wide px-1 ${dark ? 'text-slate-300' : 'text-slate-500'}`}
            >
              AR/EN
            </button>

            {/* Search */}
            <div className={`flex-1 flex items-center gap-2 rounded-full px-4 py-2 text-sm ${dark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-400'}`}>
              <Search size={15} />
              <input placeholder={t.search} className="bg-transparent outline-none placeholder:text-inherit w-full text-sm" />
            </div>

            {/* School switcher — last in DOM so it renders at the visual start (left in RTL) */}
            <div className="relative">
              <button
                onClick={() => setSchoolOpen((v) => !v)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${dark ? 'border-slate-700 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <span className="hidden sm:block">{t.school} — {t.schoolSub}</span>
                <ChevronDown size={14} className={dark ? 'text-slate-500' : 'text-slate-400'} />
              </button>
              <AnimatePresence>
                {schoolOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className={`absolute mt-2 w-56 rounded-xl border shadow-xl py-1.5 z-30 ${dark ? 'bg-navy-soft border-slate-700' : 'bg-white border-slate-100'}`}
                  >
                    <div className="px-3.5 py-2 text-sm font-medium">{t.school}</div>
                    <div className={`px-3.5 py-1 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.schoolSub}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-5 py-7">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.dashboard}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.overview}</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpiCards.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.4 }}
                  className={`${cardFloating(dark)} p-6`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[15px] font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{item.label}</span>
                    <div className={`h-11 w-11 rounded-full flex items-center justify-center ${dark ? 'bg-royal/15 text-royal-light' : 'bg-royal/10 text-royal'}`}>
                      <Icon size={19} />
                    </div>
                  </div>
                  {statsLoading ? (
                    <div className={skeleton(dark, 'h-10 w-28 mt-3')} />
                  ) : (
                    <div className={`mt-3 text-4xl font-bold tracking-tight font-en ${dark ? 'text-white' : 'text-navy'}`}>
                      {item.value != null ? item.value.toLocaleString('en-US') : '—'}
                    </div>
                  )}
                  <div className={`mt-2 text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{item.hint}</div>
                </motion.div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className={`lg:col-span-3 ${cardFloating(dark)} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.gradeTitle}</h2>
                  <p className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{t.gradeSub}</p>
                </div>
                <div className={`flex items-center rounded-full p-1 ${dark ? 'bg-black/20' : 'bg-slate-100'}`}>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${chartType === 'bar' ? (dark ? 'bg-navy-soft text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : (dark ? 'text-slate-400' : 'text-slate-500')}`}
                  >
                    {lang === 'ar' ? 'أعمدة بيانية' : 'Bar'}
                  </button>
                  <button
                    onClick={() => setChartType('area')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${chartType === 'area' ? (dark ? 'bg-navy-soft text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm') : (dark ? 'text-slate-400' : 'text-slate-500')}`}
                  >
                    {lang === 'ar' ? 'مخطط خطي' : 'Line'}
                  </button>
                </div>
              </div>
              {chartLoading ? (
                <div className={skeleton(dark, 'h-[280px] w-full')} />
              ) : gradeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  {chartType === 'bar' ? (
                    <BarChart data={gradeData} margin={{ left: -20, right: 10, top: 5 }}>
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" />
                          <stop offset="100%" stopColor="#BFDBFE" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#33415560' : '#EEF2F7'} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip content={<CustomTooltip dark={dark} />} cursor={{ fill: dark ? '#ffffff08' : '#00000005' }} />
                      <Bar dataKey="v" fill="url(#barGradient)" radius={[8, 8, 0, 0]} maxBarSize={46} />
                    </BarChart>
                  ) : (
                    <AreaChart data={gradeData} margin={{ left: -20, right: 10, top: 5 }}>
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#33415560' : '#EEF2F7'} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip content={<CustomTooltip dark={dark} />} />
                      <Area type="monotone" dataKey="v" stroke="#2563EB" strokeWidth={2.5} fill="url(#areaGradient)" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className={`text-sm text-center py-16 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>—</div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className={`lg:col-span-2 ${cardFloating(dark)} p-5`}>
              <div className="mb-4">
                <h2 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{t.recentStudentsTitle}</h2>
                <p className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-500'}`}>{lang === 'ar' ? 'أحدث الطلاب المضافين إلى النظام' : 'Newest students added to the system'}</p>
              </div>
              <div className="space-y-1">
                {recentLoading ? (
                  [0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className={skeleton(dark, 'h-10 w-10 rounded-full flex-shrink-0')} />
                      <div className="flex-1 space-y-1.5">
                        <div className={skeleton(dark, 'h-3.5 w-2/3')} />
                        <div className={skeleton(dark, 'h-3 w-1/3')} />
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    {recent.map((s, i) => (
                      <div key={i} className={`flex items-center gap-3 text-sm rounded-xl px-2 -mx-2 py-2.5 transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                          {initials(s.name_ar)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate font-medium ${dark ? 'text-slate-200' : 'text-slate-800'}`}>{lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}</div>
                          <div className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {s.sections ? `${s.sections.grade_name} — ${s.sections.section_name}` : '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {recent.length === 0 && <div className={`text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>—</div>}
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {isAdmin && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}
              className={`${cardFloating(dark)} p-5`}>
              <div className="mb-4">
                <h2 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{t.requestsTitle}</h2>
                <p className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.requestsSub}</p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b text-xs ${dark ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                    <th className="text-start font-medium pb-3">{t.thName}</th>
                    <th className="text-start font-medium pb-3 hidden sm:table-cell">{t.thEmail}</th>
                    <th className="text-start font-medium pb-3 hidden md:table-cell">{t.thDate}</th>
                    <th className="text-start font-medium pb-3 hidden lg:table-cell">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="text-end font-medium pb-3">{t.thAction}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${dark ? 'divide-slate-800/60' : 'divide-slate-100'}`}>
                  {requestsLoading ? (
                    [0, 1].map((i) => (
                      <tr key={i}>
                        <td className="py-3.5" colSpan={5}>
                          <div className="flex items-center gap-2.5">
                            <div className={skeleton(dark, 'h-8 w-8 rounded-full flex-shrink-0')} />
                            <div className={skeleton(dark, 'h-3.5 w-40')} />
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <AnimatePresence>
                      {requests.map((r) => (
                        <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 20 }}
                          className={`transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50/70'}`}>
                          <td className="py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${dark ? 'bg-royal/15 text-royal-light' : 'bg-royal/10 text-royal'}`}>
                                {initials(r.full_name)}
                              </div>
                              <span className={`font-medium ${dark ? 'text-slate-200' : 'text-slate-800'}`}>{r.full_name}</span>
                            </div>
                          </td>
                          <td className={`py-3.5 font-en hidden sm:table-cell ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{r.email}</td>
                          <td className={`py-3.5 font-en hidden md:table-cell ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {r.created_at ? new Date(r.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '—'}
                          </td>
                          <td className="py-3.5 hidden lg:table-cell">
                            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${dark ? 'bg-amber-400/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                              {lang === 'ar' ? 'قيد الانتظار' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3.5">
                            <div className="flex items-center gap-2 justify-end">
                              <select
                                value={roleChoice[r.id] || 'viewer'}
                                onChange={(e) => setRoleChoice((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                className={`text-xs rounded-full px-2.5 py-2 outline-none ${dark ? 'bg-navy border border-slate-700 text-slate-300' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}
                              >
                                <option value="viewer">{t.roleNames.viewer}</option>
                                <option value="recorder">{t.roleNames.recorder}</option>
                                <option value="admin">{t.roleNames.admin}</option>
                              </select>
                              <button
                                onClick={() => approve(r.id, roleChoice[r.id] || 'viewer')}
                                className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-amber-600 hover:-translate-y-0.5"
                              >
                                {t.accept}
                              </button>
                              <button
                                onClick={() => reject(r.id)}
                                className="rounded-full bg-slate-800 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-slate-900 hover:-translate-y-0.5"
                              >
                                {t.reject}
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
              {!requestsLoading && requests.length === 0 && (
                <div className={`text-center py-8 text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.noRequests}</div>
              )}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
