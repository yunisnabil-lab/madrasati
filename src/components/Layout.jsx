import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
