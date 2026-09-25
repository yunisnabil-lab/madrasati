import { Fragment } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import Sidebar, { MobileNav } from './Sidebar';
import Header from './Header';
import AppFooter from './AppFooter';

export default function Layout({ children }) {
  const { t, dark } = useApp();
  // Clicking the sidebar link of the page you are already on gives the
  // navigation a new key; keying the page by it starts the page over
  // (filters, dates and results back to their defaults) without a browser reload.
  const location = useLocation();
  return (
    <div className="flex print:block">
      <Sidebar />
      {/* the sidebar is fixed (out of flow) on desktop so it never scrolls
          with the page — this margin reserves its width so content doesn't
          slide underneath it. */}
      <div className="app-content flex-1 min-w-0 pb-16 md:pb-0 md:ms-[232px] print:ms-0 print:pb-0">
        <Header />
        <Fragment key={location.key}>{children}</Fragment>
        <AppFooter t={t} dark={dark} className={`px-4 py-5 ${dark ? 'bg-navy' : 'bg-slate-100'}`} />
      </div>
      <MobileNav />
    </div>
  );
}
