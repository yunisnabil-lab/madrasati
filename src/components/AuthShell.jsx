import { motion } from 'framer-motion';
import { useApp } from '../lib/AppContext';

export default function AuthShell({ children }) {
  const { lang, setLang, t } = useApp();

  return (
    <div className={lang === 'ar' ? 'font-ar' : 'font-en'}>
      <div className="min-h-screen grid md:grid-cols-[1.05fr_1fr] bg-pearl">

        {/* Brand pane */}
        <aside className="hidden md:flex relative overflow-hidden bg-navy text-slate-100 p-14 flex-col justify-between">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(90% 65% at 85% 6%, rgba(255,255,255,0.16) 0%, transparent 62%),' +
                'radial-gradient(75% 60% at 6% 82%, rgba(255,255,255,0.08) 0%, transparent 68%),' +
                'radial-gradient(130% 95% at 15% -12%, rgba(255,255,255,0.09) 0%, transparent 58%)',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(140% 100% at 50% 45%, transparent 45%, rgba(0,0,0,0.16) 100%)' }}
          />

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative">
            <div className="text-xl font-semibold">{t.school}</div>
            <div className="text-xs text-slate-400 mt-1">{t.schoolSub}</div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.5 }} className="relative">
            <div className="text-2xl font-semibold leading-relaxed max-w-[26ch]">
              {lang === 'ar' ? 'نظام إدارة مدرسي متكامل' : 'A complete school management platform'}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.5 }} className="relative text-xs text-slate-500 leading-relaxed">
            {lang === 'ar'
              ? 'حضور وغياب، تقارير، وصلاحيات — كل شيء في مكان واحد'
              : 'Attendance, reports, and permissions — all in one place'}
          </motion.div>
        </aside>

        {/* Form pane */}
        <main className="relative flex flex-col justify-center p-8 md:p-14">
          <div className="absolute top-6 md:top-8 end-6 md:end-8 flex items-center bg-royal/10 rounded-full p-1">
            {['ar', 'en'].map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  lang === l ? 'bg-white text-royal shadow-sm' : 'text-slate-500'
                }`}
              >
                {l === 'ar' ? 'عربي' : 'English'}
              </button>
            ))}
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-[400px] mx-auto">
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
