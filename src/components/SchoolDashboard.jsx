import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bell, ChevronDown, Sun, Moon, Users, GraduationCap,
  School as SchoolIcon, Clock, Check, X, Globe,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar, CartesianGrid,
} from 'recharts';

// ------------------------------------------------------------------
// Sample / illustrative data — this component is a pure visual layer
// (no backend wiring), so all figures here are placeholders.
// ------------------------------------------------------------------

const KPI_AR = [
  { label: 'إجمالي الطلاب', value: '2,231', progress: 82, icon: GraduationCap },
  { label: 'أعضاء الهيئة', value: '184', progress: 64, icon: Users },
  { label: 'الفصول الدراسية', value: '42', progress: 90, icon: SchoolIcon },
  { label: 'طلبات معلّقة', value: '5', progress: 30, icon: Clock },
];

const KPI_EN = [
  { label: 'Total students', value: '2,231', progress: 82, icon: GraduationCap },
  { label: 'Staff members', value: '184', progress: 64, icon: Users },
  { label: 'Sections', value: '42', progress: 90, icon: SchoolIcon },
  { label: 'Pending requests', value: '5', progress: 30, icon: Clock },
];

const TREND_DATA = [
  { name: 'سبت', v: 62 }, { name: 'أحد', v: 78 }, { name: 'اثنين', v: 71 },
  { name: 'ثلاثاء', v: 85 }, { name: 'أربعاء', v: 80 }, { name: 'خميس', v: 92 },
];

const GRADE_DATA = [
  { name: 'ك.أول', v: 210 }, { name: 'ك.ثاني', v: 195 }, { name: '3', v: 240 },
  { name: '6', v: 260 }, { name: '9', v: 300 }, { name: '12', v: 180 },
];

const REQUESTS_AR = [
  { name: 'سارة أحمد المنصوري', email: 'sara.a@moe.sch.ae', date: '30 أغسطس' },
  { name: 'خالد يوسف الحمادي', email: 'khaled.y@moe.sch.ae', date: '29 أغسطس' },
  { name: 'مريم سالم الكعبي', email: 'maryam.s@moe.sch.ae', date: '28 أغسطس' },
];

const REQUESTS_EN = [
  { name: 'Sara Ahmed Al Mansoori', email: 'sara.a@moe.sch.ae', date: 'Aug 30' },
  { name: 'Khaled Yousef Al Hammadi', email: 'khaled.y@moe.sch.ae', date: 'Aug 29' },
  { name: 'Maryam Salem Al Kaabi', email: 'maryam.s@moe.sch.ae', date: 'Aug 28' },
];

const TEXT = {
  ar: {
    dir: 'rtl', font: 'font-ar',
    school: 'مجمع زايد التعليمي', schoolSub: 'الخوانيج',
    search: 'بحث عن طالب، فصل...',
    dashboard: 'لوحة التحكم', overview: 'نظرة عامة على أداء المدرسة اليوم',
    trendTitle: 'اتجاه الحضور', trendSub: 'آخر 6 أيام',
    gradeTitle: 'توزيع الطلاب حسب الصف', gradeSub: 'عدد الطلاب في كل صف',
    requestsTitle: 'طلبات تسجيل جديدة', requestsSub: 'بانتظار المراجعة',
    thName: 'الاسم', thEmail: 'البريد الإلكتروني', thDate: 'التاريخ', thAction: 'الإجراء',
    accept: 'قبول', reject: 'رفض',
    profile: 'يونس نبيل', role: 'صلاحية كاملة',
  },
  en: {
    dir: 'ltr', font: 'font-en',
    school: 'Zayed Educational Complex', schoolSub: 'Al Khawaneej',
    search: 'Search students, classes...',
    dashboard: 'Dashboard', overview: "Today's school performance overview",
    trendTitle: 'Attendance trend', trendSub: 'Last 6 days',
    gradeTitle: 'Students by grade', gradeSub: 'Enrolled students per grade',
    requestsTitle: 'New registration requests', requestsSub: 'Awaiting review',
    thName: 'Name', thEmail: 'Email', thDate: 'Date', thAction: 'Action',
    accept: 'Accept', reject: 'Reject',
    profile: 'Yunis Nabil', role: 'Full access',
  },
};

function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('madrasati-theme') === 'dark';
  });
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('madrasati-theme', next ? 'dark' : 'light');
      return next;
    });
  };
  return [dark, toggle];
}

function KpiCard({ item, i, dark }) {
  const Icon = item.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className={`rounded-2xl border p-5 transition-all duration-200 ease-in-out
        ${dark
          ? 'bg-navy-soft/60 border-slate-700/40 hover:shadow-lg hover:shadow-black/20'
          : 'bg-white border-slate-200 hover:shadow-lg hover:shadow-slate-200/60'}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{item.label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${dark ? 'bg-royal/15 text-royal-light' : 'bg-royal/10 text-royal'}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className={`mt-3 text-3xl font-bold tracking-tight font-en ${dark ? 'text-white' : 'text-navy'}`}>
        {item.value}
      </div>
      <div className={`mt-4 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${item.progress}%` }}
          transition={{ delay: 0.2 + i * 0.06, duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full bg-gradient-to-r from-royal to-royal-light"
        />
      </div>
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label, dark }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg border
      ${dark ? 'bg-navy-soft border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
      <div className="font-medium">{label}</div>
      <div className="text-royal-light font-en">{payload[0].value}</div>
    </div>
  );
}

export default function SchoolDashboard() {
  const [lang, setLang] = useState('ar');
  const [dark, toggleDark] = useTheme();
  const t = TEXT[lang];
  const requests = lang === 'ar' ? REQUESTS_AR : REQUESTS_EN;
  const kpis = lang === 'ar' ? KPI_AR : KPI_EN;
  const [rows, setRows] = useState(requests);

  useMemo(() => { setRows(requests); }, [lang]); // eslint-disable-line

  const resolveRow = (idx) => {
    setRows((r) => r.filter((_, i) => i !== idx));
  };

  return (
    <div dir={t.dir} className={t.font}>
      <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-navy text-slate-200' : 'bg-pearl text-slate-800'}`}>

        {/* Header — floating glassmorphism */}
        <header className="sticky top-0 z-20 px-4 pt-4">
          <div className={`mx-auto max-w-7xl rounded-2xl border backdrop-blur-xl px-4 py-3 flex items-center gap-4
            ${dark ? 'bg-navy-soft/60 border-slate-700/40' : 'bg-white/70 border-white/60 shadow-sm shadow-slate-200/50'}`}>

            <button className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors
              ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-900/5'}`}>
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-gold to-gold-light flex items-center justify-center text-white text-xs font-bold">م</div>
              <span className="hidden sm:block">{t.school}</span>
              <ChevronDown size={14} className={dark ? 'text-slate-500' : 'text-slate-400'} />
            </button>

            <div className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-2 text-sm
              ${dark ? 'bg-black/20 text-slate-400' : 'bg-slate-900/5 text-slate-500'}`}>
              <Search size={15} />
              <input
                placeholder={t.search}
                className="bg-transparent outline-none placeholder:text-inherit w-full text-sm"
              />
            </div>

            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors
                ${dark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-900/5 text-slate-600'}`}
            >
              <Globe size={14} />
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>

            <button
              onClick={toggleDark}
              className={`relative h-9 w-9 rounded-xl flex items-center justify-center transition-colors
                ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-900/5'}`}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={dark ? 'moon' : 'sun'}
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.2 }}
                >
                  {dark ? <Moon size={16} /> : <Sun size={16} />}
                </motion.span>
              </AnimatePresence>
            </button>

            <button className={`relative h-9 w-9 rounded-xl flex items-center justify-center transition-colors
              ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-900/5'}`}>
              <Bell size={16} />
              <span className="absolute top-2 end-2 h-1.5 w-1.5 rounded-full bg-gold" />
            </button>

            <button className="flex items-center gap-2 pe-1">
              <div className="text-end hidden md:block">
                <div className="text-xs font-medium leading-tight">{t.profile}</div>
                <div className={`text-[11px] leading-tight ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.role}</div>
              </div>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold ring-2 ring-white/10">
                YN
              </div>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="mb-6">
            <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-navy'}`}>{t.dashboard}</h1>
            <p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t.overview}</p>
          </motion.div>

          {/* Bento grid KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpis.map((item, i) => <KpiCard key={item.label} item={item} i={i} dark={dark} />)}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}
              className={`lg:col-span-3 rounded-2xl border p-5 ${dark ? 'bg-navy-soft/60 border-slate-700/40' : 'bg-white border-slate-200'}`}
            >
              <div className="mb-4">
                <h2 className="text-sm font-semibold">{t.trendTitle}</h2>
                <p className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.trendSub}</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={TREND_DATA} margin={{ left: -20, right: 10, top: 5 }}>
                  <defs>
                    <linearGradient id="royalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#33415560' : '#E2E8F0'} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<CustomTooltip dark={dark} />} />
                  <Area type="monotone" dataKey="v" stroke="#2563EB" strokeWidth={2.5} fill="url(#royalFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
              className={`lg:col-span-2 rounded-2xl border p-5 ${dark ? 'bg-navy-soft/60 border-slate-700/40' : 'bg-white border-slate-200'}`}
            >
              <div className="mb-4">
                <h2 className="text-sm font-semibold">{t.gradeTitle}</h2>
                <p className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.gradeSub}</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={GRADE_DATA} margin={{ left: -20, right: 10, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={dark ? '#33415560' : '#E2E8F0'} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: dark ? '#64748B' : '#94A3B8' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<CustomTooltip dark={dark} />} cursor={{ fill: dark ? '#ffffff08' : '#00000005' }} />
                  <Bar dataKey="v" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Requests table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26, duration: 0.4 }}
            className={`rounded-2xl border p-5 ${dark ? 'bg-navy-soft/60 border-slate-700/40' : 'bg-white border-slate-200'}`}
          >
            <div className="mb-4">
              <h2 className="text-sm font-semibold">{t.requestsTitle}</h2>
              <p className={`text-xs mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{t.requestsSub}</p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b text-xs ${dark ? 'border-slate-700/50 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
                  <th className="text-start font-medium pb-3">{t.thName}</th>
                  <th className="text-start font-medium pb-3 hidden sm:table-cell">{t.thEmail}</th>
                  <th className="text-start font-medium pb-3 hidden md:table-cell">{t.thDate}</th>
                  <th className="text-end font-medium pb-3">{t.thAction}</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {rows.map((r, idx) => (
                    <motion.tr
                      key={r.email}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.25 }}
                      className={`border-b last:border-0 ${dark ? 'border-slate-700/30' : 'border-slate-50'}`}
                    >
                      <td className="py-3 font-medium">{r.name}</td>
                      <td className={`py-3 font-en hidden sm:table-cell ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{r.email}</td>
                      <td className={`py-3 hidden md:table-cell ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{r.date}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => resolveRow(idx)}
                            className="flex items-center gap-1 rounded-lg bg-gradient-to-b from-gold-light to-gold px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 ease-in-out hover:brightness-110 hover:-translate-y-0.5"
                          >
                            <Check size={13} /> {t.accept}
                          </button>
                          <button
                            onClick={() => resolveRow(idx)}
                            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-in-out hover:-translate-y-0.5
                              ${dark ? 'bg-slate-650 text-slate-200 hover:bg-slate-600' : 'bg-slate-700 text-white hover:bg-slate-800'}`}
                          >
                            <X size={13} /> {t.reject}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>

            {rows.length === 0 && (
              <div className={`text-center py-8 text-sm ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
                {lang === 'ar' ? 'لا توجد طلبات معلّقة حاليًا.' : 'No pending requests right now.'}
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
