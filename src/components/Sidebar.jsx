import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ClipboardCheck, GraduationCap, Search, UsersRound, UserCheck, FileBarChart, FileText } from 'lucide-react';
import { useApp } from '../lib/AppContext';

const ITEMS = [
  { to: '/', icon: LayoutDashboard, key: 'navDashboard', end: true, hideFor: ['recorder'] },
  { to: '/attendance', icon: ClipboardCheck, key: 'navAttendance', end: false },
  { to: '/single-attendance', icon: UserCheck, key: 'navSingleAttendance', end: false },
  { to: '/lookup', icon: Search, key: 'navLookup', end: false },
  { to: '/daily-report', icon: FileText, key: 'navDailyReport', end: false, hideFor: ['recorder'] },
  { to: '/period-report', icon: FileBarChart, key: 'navPeriodReport', end: false, hideFor: ['recorder'] },
  { to: '/students', icon: GraduationCap, key: 'navStudents', end: false, hideFor: ['recorder'] },
  { to: '/staff-assignments', icon: UsersRound, key: 'navAssignments', end: false, hideFor: ['recorder', 'viewer'] },
];

function visibleItems(role) {
  return ITEMS.filter((item) => !item.hideFor || !item.hideFor.includes(role));
}

export { ITEMS, visibleItems };

export function MobileNav() {
  const { t, dark, staff } = useApp();
  const items = visibleItems(staff?.role);
  return (
    <nav
      className={`no-print md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch overflow-x-auto border-t transition-colors duration-300 ${
        dark ? 'bg-navy border-slate-800' : 'bg-white border-slate-200'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 min-w-[68px] flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium ${
                isActive
                  ? dark ? 'text-royal-light' : 'text-royal'
                  : dark ? 'text-slate-500' : 'text-slate-400'
              }`
            }
          >
            <Icon size={19} />
            <span className="truncate max-w-[64px]">{t[item.key]}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  const { t, lang, dark, staff } = useApp();
  const items = visibleItems(staff?.role);

  return (
    <aside
      className={`no-print hidden md:flex flex-col w-56 shrink-0 min-h-screen sticky top-0 border-e transition-colors duration-300 ${
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
        {items.map((item) => {
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
