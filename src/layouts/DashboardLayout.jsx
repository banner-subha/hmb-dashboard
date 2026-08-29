import { useState, useMemo, useEffect, Suspense } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRawData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { NAV_ITEMS, CLIENT_NAV_ITEMS } from '../utils/constants';
import {
  LayoutDashboard,
  Map,
  MapPin,
  Store,
  Brain,
  Activity,
  Globe,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { backdropVariants } from '../utils/motionVariants';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import AnimatedPage from '../components/common/AnimatedPage';

const NAV_ICON_MAP = {
  LayoutDashboard,
  Map,
  MapPin,
  Store,
  Brain,
  Activity,
  Globe,
};

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const { rawData } = useRawData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncAgoText, setSyncAgoText] = useState('just now');

  const navItemsToRender = useMemo(() => {
    if (user?.role === 'client') return CLIENT_NAV_ITEMS;
    return NAV_ITEMS;
  }, [user]);
  
  useBodyScrollLock(sidebarOpen);

  // Track backend payload timestamp (generatedAt) so "last updated" only updates when backend data updates
  const backendGenAt = rawData?.meta?.generatedAt || rawData?.generatedAt || null;

  useEffect(() => {
    if (backendGenAt) {
      const parsedDate = new Date(backendGenAt);
      if (!isNaN(parsedDate.getTime())) {
        setLastSyncedAt(parsedDate);
      }
    }
  }, [backendGenAt]);

  // Update the "X min ago" text every 30 seconds based on backend generatedAt
  useEffect(() => {
    if (!lastSyncedAt) return;
    const update = () => {
      const diffMs = Date.now() - lastSyncedAt.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) setSyncAgoText('just now');
      else if (diffMin === 1) setSyncAgoText('1 min ago');
      else if (diffMin < 60) setSyncAgoText(`${diffMin} min ago`);
      else {
        const diffHrs = Math.floor(diffMin / 60);
        setSyncAgoText(`${diffHrs} ${diffHrs === 1 ? 'hr' : 'hrs'} ago`);
      }
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Date range string for the header meta row (Current vs Previous MoM)
  const headerDateRange = useMemo(() => {
    if (!rawData) return "";
    let curP = rawData.meta?.curPeriod || rawData.curPeriod || rawData.period || "";
    let prevP = rawData.meta?.prevPeriod || rawData.prevPeriod || "";

    if (curP && prevP) {
      return `${curP} vs ${prevP}`;
    }
    return curP.replace(/\s*-\s*/g, ' – ');
  }, [rawData]);

  // Use backend's totalMoM directly — it already compares identical day-ranges
  // (e.g. Aug 1-2 vs Jul 1-2). No frontend recalculation needed.
  const dispatchGrowth = useMemo(() => {
    if (!rawData) return null;
    const mom = rawData.totalMoM;
    if (mom === null || mom === undefined || isNaN(mom)) return null;
    return mom;
  }, [rawData]);

  // Dynamically resolve active tab title matching current route
  const currentTabTitle = useMemo(() => {
    const currentNav = navItemsToRender.find(item => {
      if (item.path === '/') return location.pathname === '/';
      return location.pathname.startsWith(item.path);
    });
    return currentNav ? currentNav.label : 'Executive Overview';
  }, [location.pathname, navItemsToRender]);

  return (
    <LazyMotion features={domAnimation}>
      <div className="flex h-dvh overflow-hidden bg-bg-primary text-text-primary">
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
          className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col h-dvh border-r border-[var(--color-sidebar-border)] transition-transform duration-300 lg:static lg:h-full lg:translate-x-0 flex-shrink-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ background: 'var(--gradient-sidebar)' }}
        >
          {/* Brand */}
          <header className="flex items-center justify-between h-[80px] px-4 border-b border-[var(--color-sidebar-border)] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/hmb.png"
                alt="HMB Ispat"
                className="h-11 w-auto object-contain shrink-0 select-none rounded-lg"
                draggable={false}
              />
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[17px] font-bold tracking-tight text-white truncate">HMB Ispat</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-text-muted truncate">Intelligence Platform</span>
              </div>
            </div>
            <button
              className="lg:hidden text-white ml-2 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* Navigation (scrollable flex child) */}
          <nav className="flex-1 overflow-y-auto min-h-0 py-4">
            <div className="text-[11px] font-bold text-sidebar-text-muted/70 uppercase tracking-[0.14em] mb-2 px-6">
              Intelligence
            </div>
            {navItemsToRender.map((item) => {
              const Icon = NAV_ICON_MAP[item.icon] || Globe;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'active' : ''}`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* Footer (pinned to bottom) */}
          <footer className="shrink-0 mt-auto w-full px-4 py-3.5 border-t border-[var(--color-sidebar-border)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-bold text-white">
                    {(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[14px] font-semibold text-sidebar-text truncate" title={user?.name || user?.username}>
                    {user?.name || user?.username}
                  </span>
                  <span className="text-[12px] text-sidebar-text-muted truncate">
                    {user?.role === 'client'
                      ? `${user?.kroRole || 'Client View'}${user?.states ? ` (${Array.isArray(user.states) ? user.states.join(', ') : user.states})` : ''}`
                      : 'Administrator'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={toggleTheme}
                  className="p-2 text-sidebar-text-muted hover:text-sidebar-text transition-colors rounded-lg hover:bg-white/10"
                  title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                  aria-label="Toggle theme"
                >
                  {theme === 'light'
                    ? <Moon className="w-4.5 h-4.5" />
                    : <Sun className="w-4.5 h-4.5" />}
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 text-sidebar-text-muted hover:text-severity-critical transition-colors rounded-lg hover:bg-severity-critical/10 shrink-0"
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          </footer>
        </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header — themed navy strip with accent bar */}
        <header
          className="sticky top-0 shrink-0 z-10 px-4 sm:px-5 pt-3 sm:pt-3.5 pb-3.5"
          style={{ background: 'linear-gradient(180deg, rgba(var(--color-bg-primary-rgb), 0.92) 60%, rgba(var(--color-bg-primary-rgb), 0.72) 100%)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
        >
          <div className="max-w-[1680px] mx-auto relative flex overflow-hidden rounded-2xl border gradient-glow-top" style={{ background: 'var(--gradient-header)', borderColor: 'var(--color-sidebar-border)' }}>
            {/* Left accent bar */}
            <div className="w-[4px] shrink-0 self-stretch rounded-l-2xl" style={{ background: 'var(--gradient-accent)' }} />

            <div className="flex-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 sm:px-5 py-3.5 sm:py-4">

              {/* Brand identity */}
              <div className="order-1 flex items-center gap-3 min-w-0">
                <button
                  className="lg:hidden -ml-1.5 p-2 text-white/60 hover:text-white rounded-lg transition-colors cursor-pointer"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open navigation"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex flex-col leading-none">
                  <span className="text-[15px] sm:text-[16px] font-extrabold tracking-tight text-sidebar-text whitespace-nowrap">
                    HMB Ispat
                  </span>
                  <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-[0.18em] text-sidebar-text-muted mt-[5px] whitespace-nowrap">
                    Business Intelligence
                  </span>
                </div>
              </div>

              {/* Live sync chip — right on mobile, end of row on desktop */}
              <div className="order-2 sm:order-3 ml-auto sm:ml-0 shrink-0">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.07] text-xs text-white/75 whitespace-nowrap">
                  <span className="relative flex w-2 h-2 shrink-0">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-severity-none opacity-40 animate-pulse-subtle" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-severity-none" />
                  </span>
                  Live · Updated {syncAgoText}
                </div>
              </div>

              {/* Page context — hairline-separated on desktop, own row on mobile */}
              <div className="order-3 sm:order-2 basis-full sm:basis-auto sm:pl-5 sm:border-l sm:border-white/10 sm:mr-auto min-w-0 flex flex-col gap-0.5">
                <h1 className="text-lg sm:text-xl font-bold text-sidebar-text tracking-tight leading-tight m-0 truncate">
                  {currentTabTitle}
                </h1>
                <div className="flex items-center gap-2 text-[11px] sm:text-xs text-sidebar-text-muted flex-wrap leading-relaxed">
                  {headerDateRange && (
                    <span className="font-medium whitespace-nowrap">{headerDateRange}</span>
                  )}
                  {headerDateRange && (
                    <span className="text-white/30">·</span>
                  )}
                  <span className="font-medium whitespace-nowrap">Current Cycle (MTD)</span>
                  {dispatchGrowth !== null && (
                    <>
                      <span className="text-white/30">·</span>
                      <span className={`font-bold whitespace-nowrap ${dispatchGrowth >= 0 ? 'text-severity-none' : 'text-severity-critical'}`}>
                        {dispatchGrowth >= 0 ? '↑' : '↓'} {Math.abs(dispatchGrowth).toFixed(1)}% vs last period
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-5 pb-12" style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', transform: 'translateZ(0)' }}>
          <div className="max-w-[1680px] mx-auto space-y-6 min-h-full relative">
            <AnimatePresence mode="wait">
              <AnimatedPage key={location.pathname}>
                <Suspense fallback={
                  <div className="space-y-6">
                    <div className="glass-card p-6 min-h-[400px] flex items-center justify-center text-text-muted">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-accent-blue/30 border-t-accent-blue animate-spin" />
                        <span className="text-xs font-medium tracking-wide">Loading component...</span>
                      </div>
                    </div>
                  </div>
                }>
                  <Outlet />
                </Suspense>
              </AnimatedPage>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
    </LazyMotion>
  );
}
