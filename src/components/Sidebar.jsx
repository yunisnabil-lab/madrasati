import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ClipboardCheck } from 'lucide-react';
import { useApp } from '../lib/AppContext';

const ITEMS = [
  { to: '/', icon: LayoutDashboard, key: 'navDashboard', end: true },
  { to: '/attendance', icon: ClipboardCheck, key: 'navAttendance', end: false },
];

export default function Sidebar() {
  const { t, lang, dark } = useApp();

  return (
    <aside
      className={`hidden md:flex flex-col w-56 shrink-0 min-h-screen sticky top-0 border-e transition-colors duration-300 ${
        dark ? 'bg-navy border-slate-800' : 'bg-white border-slate-200/60'
      }`}
    >
      <div className="px-5 py-5">
        <div className={`text-sm font-bold ${dark ? 'text-white' : 'text-navy'}`}>
          {lang === 'ar' ? 'مدرستي' : 'Madrasati'}
        </div>
        <div className={`text-[11px] mt-0.5 ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
          {t.school}
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? dark
                      ? 'bg-royal/20 text-royal-light'
                      : 'bg-royal/10 text-royal'
                    : dark
                    ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`
              }
            >
              <Icon size={17} />
              {t[item.key]}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
