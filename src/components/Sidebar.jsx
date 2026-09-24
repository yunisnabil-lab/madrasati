import { NavLink, Link } from 'react-router-dom';
import { LayoutDashboard, ClipboardCheck, GraduationCap, Search, UsersRound, FileBarChart, FileText, AlertTriangle, Clock3, MessageCircle, BarChart3 } from 'lucide-react';
import { useApp } from '../lib/AppContext';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

const ITEMS = [
  { to: '/', icon: LayoutDashboard, key: 'navDashboard', end: true, hideFor: ['supervisor'] },
  { to: '/attendance', icon: ClipboardCheck, key: 'navAttendance', end: false, hideFor: [] },
  { to: '/lookup', icon: Search, key: 'navLookup', end: false, hideFor: [] },
  { to: '/daily-report', icon: FileText, key: 'navDailyReport', end: false, hideFor: [] },
  { to: '/period-report', icon: FileBarChart, key: 'navPeriodReport', end: false, hideFor: [] },
  { to: '/students', icon: GraduationCap, key: 'navStudents', end: false, hideFor: ['recorder', 'supervisor'] },
  { to: '/violations', icon: AlertTriangle, key: 'navViolations', end: false, hideFor: ['recorder'] },
  { to: '/lateness', icon: Clock3, key: 'navLateness', end: false, hideFor: ['recorder'] },
  { to: '/supervisor-report', icon: BarChart3, key: 'navSupervisorReport', end: false, hideFor: ['recorder'] },
  { to: '/contact-requests', icon: MessageCircle, key: 'navContactRequests', end: false, hideFor: ['recorder'] },
  { to: '/staff-assignments', icon: UsersRound, key: 'navAssignments', end: false, hideFor: ['recorder', 'supervisor', 'edari'] },
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
                  : dark ? 'text-slate-200' : 'text-slate-400'
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
  const { t, dark, staff } = useApp();
  const items = visibleItems(staff?.role);

  return (
    <aside
      className={`no-print hidden md:block w-56 shrink-0 fixed top-0 start-0 h-screen z-40 border-e transition-colors duration-300 ${
        dark ? 'bg-navy border-slate-800' : 'bg-white border-slate-200/60'
      }`}
    >
      <nav className="h-full overflow-y-auto px-3 pt-5 pb-4 space-y-1">
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
                    ? 'text-slate-200 hover:bg-white/5 hover:text-slate-200'
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

      {/* Account — pinned to the exact vertical middle of the sidebar itself
          (not the leftover space below the nav, which shrinks toward the
          bottom as nav items are added/hidden per role — that's what kept
          pushing this back down). Positioned absolutely against the <aside>
          so its placement never depends on how tall the nav list is, with a
          solid background so it always reads cleanly on top of the nav.
          dir="ltr" is intentional: the photo stays to the left of the name in both Arabic and English. */}
      <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 px-3 py-4 ${dark ? 'bg-navy' : 'bg-white'}`}>
        <Link
          to="/profile"
          dir="ltr"
          className={`w-full px-3 py-3 rounded-xl flex items-center gap-2.5 border transition-colors ${dark ? 'border-slate-800 hover:bg-white/5' : 'border-slate-200/60 hover:bg-slate-50'}`}
        >
          <div className="relative h-10 w-10 rounded-full shrink-0">
            {staff && staff.avatar_url ? (
              <img src={staff.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold">
                {staff ? initials(staff.full_name) : '--'}
              </div>
            )}
          </div>
          <div className="leading-tight overflow-hidden">
            <div className={`text-sm font-bold truncate ${dark ? 'text-white' : 'text-navy'}`}>
              {staff ? staff.full_name : '...'}
            </div>
            <div className={`text-[11px] mt-0.5 truncate ${dark ? 'text-slate-200' : 'text-slate-400'}`}>
              {staff ? t.roleNames[staff.role] : ''}
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
