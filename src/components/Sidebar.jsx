import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ClipboardCheck, GraduationCap, Search, UsersRound, FileBarChart, FileText, AlertTriangle, Clock3, MessageCircle, BarChart3, ChevronDown, UserRound, Sun, Moon, Languages, LogOut, Menu, Activity, ListChecks, ShieldAlert } from 'lucide-react';
import { useApp } from '../lib/AppContext';

function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// group: which heading the item sits under in the sidebar ('main' has none).
// primary: shown directly in the phone's bottom bar; the rest go under "More".
const ITEMS = [
  { to: '/', icon: LayoutDashboard, key: 'navDashboard', end: true, hideFor: ['supervisor'], group: 'main', primary: true },
  { to: '/attendance', icon: ClipboardCheck, key: 'navAttendance', end: false, hideFor: [], group: 'attendance', primary: true },
  { to: '/lookup', icon: Search, key: 'navLookup', end: false, hideFor: [], group: 'attendance', primary: true },
  { to: '/recording-status', icon: ListChecks, key: 'navRecordingStatus', end: false, hideFor: ['recorder'], group: 'attendance' },
  { to: '/daily-report', icon: FileText, key: 'navDailyReport', end: false, hideFor: [], group: 'reports' },
  { to: '/period-report', icon: FileBarChart, key: 'navPeriodReport', end: false, hideFor: [], group: 'reports' },
  { to: '/insights', icon: ShieldAlert, key: 'navInsights', end: false, hideFor: ['recorder'], group: 'reports' },
  { to: '/supervisor-report', icon: BarChart3, key: 'navSupervisorReport', end: false, hideFor: ['recorder'], group: 'reports' },
  { to: '/violations', icon: AlertTriangle, key: 'navViolations', end: false, hideFor: [], group: 'behavior', primary: true },
  { to: '/lateness', icon: Clock3, key: 'navLateness', end: false, hideFor: ['recorder'], group: 'behavior' },
  { to: '/contact-requests', icon: MessageCircle, key: 'navContactRequests', end: false, hideFor: ['recorder', 'edari'], group: 'behavior' },
  { to: '/students', icon: GraduationCap, key: 'navStudents', end: false, hideFor: ['recorder', 'supervisor'], group: 'admin' },
  { to: '/staff-assignments', icon: UsersRound, key: 'navAssignments', end: false, hideFor: ['recorder', 'supervisor', 'edari'], group: 'admin' },
  { to: '/activity', icon: Activity, key: 'navActivity', end: false, hideFor: ['recorder', 'supervisor'], group: 'admin' },
];

const GROUP_ORDER = ['main', 'attendance', 'reports', 'behavior', 'admin'];
const GROUP_LABEL_KEYS = { attendance: 'navGroupAttendance', reports: 'navGroupReports', behavior: 'navGroupBehavior', admin: 'navGroupAdmin' };

function visibleItems(role) {
  return ITEMS.filter((item) => !item.hideFor || !item.hideFor.includes(role));
}

export { ITEMS, visibleItems };

export function MobileNav() {
  const { t, dark, staff, confirmLeave } = useApp();
  const guardNav = (e) => { if (!confirmLeave()) e.preventDefault(); };
  const [moreOpen, setMoreOpen] = useState(false);
  const items = visibleItems(staff?.role);
  const main = items.filter((i) => i.primary);
  const more = items.filter((i) => !i.primary);

  const itemCls = (isActive) =>
    `flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium ${
      isActive
        ? dark ? 'text-royal-light' : 'text-royal'
        : dark ? 'text-slate-200' : 'text-slate-500'
    }`;

  return (
    <>
      {moreOpen && (
        <div className="no-print md:hidden fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
      )}
      {moreOpen && (
        <div
          className={`no-print md:hidden fixed inset-x-3 z-40 rounded-2xl border shadow-2xl p-2 ${dark ? 'bg-navy-soft border-slate-700' : 'bg-white border-slate-200'}`}
          style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
        >
          {more.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={(e) => { guardNav(e); setMoreOpen(false); }}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium ${
                    isActive ? (dark ? 'bg-royal/20 text-royal-light' : 'bg-royal/10 text-royal') : (dark ? 'text-slate-200' : 'text-slate-700')
                  }`
                }
              >
                <Icon size={18} /> {t[item.key]}
              </NavLink>
            );
          })}
        </div>
      )}
      <nav
        className={`no-print md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t transition-colors duration-300 ${
          dark ? 'bg-navy border-slate-800' : 'bg-white border-slate-200'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {main.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={guardNav}
              className={({ isActive }) => itemCls(isActive)}
            >
              <Icon size={19} />
              <span className="truncate max-w-[72px]">{t[item.key]}</span>
            </NavLink>
          );
        })}
        {more.length > 0 && (
          <button type="button" onClick={() => setMoreOpen((v) => !v)} className={itemCls(moreOpen)}>
            <Menu size={19} />
            <span>{t.navMore}</span>
          </button>
        )}
      </nav>
    </>
  );
}

export default function Sidebar() {
  const { t, lang, setLang, dark, setDark, staff, signOut, confirmLeave } = useApp();
  const guardNav = (e) => { if (!confirmLeave()) e.preventDefault(); };
  const items = visibleItems(staff?.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // group headings fold their items away; the choice is remembered, and the
  // group holding the open page always unfolds so it never gets lost
  const [closed, setClosed] = useState(() => {
    try {
      const saved = localStorage.getItem('madrasati-nav-closed');
      if (saved) return JSON.parse(saved);
    } catch { /* storage unavailable */ }
    return ['behavior', 'admin'];
  });
  const saveClosed = (next) => {
    try { localStorage.setItem('madrasati-nav-closed', JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  };
  const toggleGroup = (key) => setClosed((prev) => saveClosed(prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const isActivePath = (item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/'));

  useEffect(() => {
    const active = visibleItems(staff?.role).find(isActivePath);
    if (active) setClosed((prev) => (prev.includes(active.group) ? saveClosed(prev.filter((k) => k !== active.group)) : prev));
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const menuItemCls = `w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors ${
    dark ? 'text-slate-200 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-50'
  }`;

  return (
    <aside
      className={`no-print hidden md:flex flex-col w-56 shrink-0 fixed top-0 start-0 h-screen z-40 border-e transition-colors duration-300 ${
        dark ? 'bg-navy border-slate-800' : 'bg-white border-slate-200/60'
      }`}
    >
      {/* Account — pinned at the top of the sidebar, the same height as the
          page header (py-4 + 40px row + 1px border = 73px) so the two read as
          one bar. Clicking it opens a small menu of account actions.
          shrink-0 keeps it in place; only the nav below it scrolls. */}
      <div className={`relative shrink-0 h-[73px] px-3 flex items-center border-b ${dark ? 'border-slate-800' : 'border-slate-200/60'}`}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`w-full h-12 px-2 rounded-xl flex items-center gap-2.5 text-start transition-colors ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'} ${menuOpen ? (dark ? 'bg-white/5' : 'bg-slate-50') : ''}`}
        >
          {staff && staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-royal to-royal-light flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {staff ? initials(staff.full_name) : '--'}
            </div>
          )}
          <div className="flex-1 min-w-0 leading-tight">
            <div className={`text-sm font-bold truncate ${dark ? 'text-white' : 'text-navy'}`} title={staff?.full_name || ''}>
              {staff ? staff.full_name : '...'}
            </div>
            <div className={`text-xs mt-0.5 font-medium truncate ${dark ? 'text-slate-200' : 'text-slate-500'}`}>
              {staff ? t.roleNames[staff.role] : ''}
            </div>
          </div>
          <ChevronDown size={16} className={`shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''} ${dark ? 'text-slate-200' : 'text-slate-500'}`} />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className={`absolute top-full inset-x-3 mt-1 z-50 rounded-xl border shadow-xl py-1.5 ${dark ? 'bg-navy-soft border-slate-700' : 'bg-white border-slate-200'}`}
            >
              <Link
                to="/profile"
                role="menuitem"
                onClick={(e) => { guardNav(e); setMenuOpen(false); }}
                className={menuItemCls}
              >
                <UserRound size={16} /> {lang === 'ar' ? 'الملف الشخصي' : 'My profile'}
              </Link>
              <button type="button" role="menuitem" onClick={() => { setDark((d) => !d); setMenuOpen(false); }} className={menuItemCls}>
                {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? t.lightMode : t.darkMode}
              </button>
              <button type="button" role="menuitem" onClick={() => { setLang(lang === 'ar' ? 'en' : 'ar'); setMenuOpen(false); }} className={menuItemCls}>
                <Languages size={16} /> {lang === 'ar' ? 'English' : 'العربية'}
              </button>
              <div className={`my-1.5 border-t ${dark ? 'border-slate-700' : 'border-slate-100'}`} />
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); if (confirmLeave()) signOut(); }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-rose-500 ${dark ? 'hover:bg-rose-500/10' : 'hover:bg-rose-50'}`}
              >
                <LogOut size={16} /> {t.signOut}
              </button>
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-4">
        {GROUP_ORDER.map((groupKey) => {
          const groupItems = items.filter((i) => i.group === groupKey);
          if (groupItems.length === 0) return null;
          const foldable = !!GROUP_LABEL_KEYS[groupKey];
          const open = !foldable || !closed.includes(groupKey);
          const hasActive = groupItems.some(isActivePath);
          return (
            <div key={groupKey} className={foldable ? 'mt-3' : ''}>
              {foldable && (
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  aria-expanded={open}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[17px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-royal/40 ${
                    hasActive && !open
                      ? (dark ? 'text-royal-light' : 'text-royal')
                      : (dark ? 'text-white hover:text-royal-light' : 'text-navy hover:text-royal')
                  }`}
                >
                  <span className="flex-1 text-start">{t[GROUP_LABEL_KEYS[groupKey]]}</span>
                  {hasActive && !open && <span className="h-1.5 w-1.5 rounded-full bg-royal" />}
                  <ChevronDown size={16} className={`shrink-0 transition-transform duration-200 ${open ? '' : 'ltr:-rotate-90 rtl:rotate-90'}`} />
                </button>
              )}
              {open && (
                <div className={foldable ? `mt-1 space-y-0.5 ms-3 ps-2 border-s ${dark ? 'border-white/10' : 'border-slate-200'}` : 'space-y-0.5'}>
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={guardNav}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${
                            isActive
                              ? dark
                                ? 'bg-royal/25 text-white font-semibold'
                                : 'bg-royal text-white font-semibold shadow-sm'
                              : dark
                              ? 'text-slate-200 hover:bg-white/5'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`
                        }
                      >
                        <Icon size={20} className="shrink-0" />
                        <span className="leading-snug">{t[item.key]}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className={`shrink-0 px-4 py-3 text-center border-t ${dark ? 'border-white/10' : 'border-slate-100'}`}>
        <div className={`text-[11px] ${dark ? 'text-slate-300' : 'text-slate-400'}`}>{t.developedBy}</div>
        <div className={`text-xs font-semibold tracking-wide mt-0.5 ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t.developerName}</div>
      </div>
    </aside>
  );
}
