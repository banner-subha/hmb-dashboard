import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { NAV_ITEMS, CATEGORY_ICONS } from '../utils/constants';
import * as Icons from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { backdropVariants } from '../utils/motionVariants';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import AnimatedPage from '../components/common/AnimatedPage';

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const { rawData } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  useBodyScrollLock(sidebarOpen);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex h-screen overflow-hidden bg-bg-primary text-text-primary">
        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <m.div
              variants={backdropVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-md lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside 
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-bg-secondary border-r border-border transition-transform duration-300 lg:static lg:translate-x-0 flex-shrink-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
        <div className="flex items-center justify-between h-16 px-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Icons.Activity className="w-6 h-6 text-accent-blue" />
            <span className="font-bold tracking-tight text-lg">HMB Ispat</span>
          </div>
          <button className="lg:hidden text-text-muted" onClick={() => setSidebarOpen(false)}>
            <Icons.X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4 px-2 mt-4">
            Intelligence
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = Icons[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => 
                  `sidebar-link ${isActive ? 'active' : ''}`
                }
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>

        <div className="absolute bottom-0 w-full p-4 border-t border-border bg-bg-secondary">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.username}</span>
              <span className="text-xs text-text-muted">{user?.role}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-text-muted hover:text-severity-critical transition-colors rounded-lg hover:bg-severity-critical/10"
              title="Logout"
            >
              <Icons.LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="sticky top-0 h-16 flex items-center justify-between px-4 sm:px-6 bg-bg-secondary/95 backdrop-blur-sm border-b border-border shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              className="lg:hidden p-2 -ml-2 text-text-muted hover:text-text-primary rounded-lg"
              onClick={() => setSidebarOpen(true)}
            >
              <Icons.Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-[16px] md:text-[18px] font-bold text-[#F8FAFC] hidden sm:block leading-none mb-1">Sales Intelligence Platform</h1>
              <h1 className="text-sm font-bold text-[#F8FAFC] sm:hidden leading-none mb-1">
                {NAV_ITEMS.find(n => n.path === (location.pathname === '' ? '/' : location.pathname))?.label || 'Dashboard'}
              </h1>
              {rawData?.meta && (
                <span className="text-[12px] md:text-[13px] font-medium text-white/72">
                  {rawData.meta.curPeriod} vs {rawData.meta.prevPeriod}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             {rawData?.alerts && rawData.alertCount > 0 && (
                <div className="hidden sm:flex items-center gap-2 mr-2">
                   <div className="flex h-2.5 w-2.5 relative">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-severity-critical opacity-75 shadow-[0_0_12px_#ef4444]"></span>
                     <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-severity-critical shadow-[0_0_12px_#ef4444]"></span>
                   </div>
                   <span className="text-[16px] md:text-[18px] font-bold text-severity-critical drop-shadow-sm">{rawData.alertCount} Active Alerts</span>
                </div>
             )}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-bg-primary">
          <div className="max-w-7xl mx-auto space-y-6 min-h-full relative">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
    </LazyMotion>
  );
}
