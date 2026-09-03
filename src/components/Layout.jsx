import Sidebar, { MobileNav } from './Sidebar';
import Header from './Header';

export default function Layout({ children }) {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-w-0 pb-16 md:pb-0">
        <Header />
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
