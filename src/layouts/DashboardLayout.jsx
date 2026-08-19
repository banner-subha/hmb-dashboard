import { useState, useMemo, useEffect, useRef, Suspense } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRawData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { NAV_ITEMS, CLIENT_NAV_ITEMS, CATEGORY_ICONS } from '../utils/constants';
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
import { calculateMoM, formatTrend } from '../utils/trendEngine';

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
  const prevDataRef = useRef(null);

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
          className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border transition-transform duration-300 lg:static lg:translate-x-0 flex-shrink-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ background: 'var(--gradient-sidebar)' }}
        >
        <div className="flex items-center justify-between h-16 px-5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            {/* Accent bar */}
            <div className="w-1 h-8 rounded-full shrink-0" style={{ background: 'var(--gradient-accent)' }} />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-base font-extrabold tracking-tight gradient-text truncate">HMB Ispat</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80 truncate">Intelligence Platform</span>
            </div>
          </div>
          <button className="lg:hidden text-white ml-2" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-0.5 overflow-y-auto h-[calc(100vh-8rem)]">
          <div className="text-xs font-bold text-white uppercase tracking-wider mb-3 px-2 mt-4">
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
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        <div className="absolute bottom-0 w-full px-4 py-3.5 border-t border-border" style={{ background: 'var(--color-sidebar-bg)' }}>
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col gap-0.5 min-w-0 pr-2">
              <span className="text-sm font-semibold text-sidebar-text truncate" title={user?.name || user?.username}>
                {user?.name || user?.username}
              </span>
              <span className="text-xs text-sidebar-text-muted truncate">
                {user?.role === 'client'
                  ? `${user?.kroRole || 'Client View'}${user?.states ? ` (${Array.isArray(user.states) ? user.states.join(', ') : user.states})` : ''}`
                  : 'Administrator'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleTheme}
                className="p-2 text-sidebar-text-muted hover:text-sidebar-text transition-colors rounded-lg hover:bg-white/10"
                title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                aria-label="Toggle theme"
              >
                {theme === 'light'
                  ? <Moon className="w-5 h-5" />
                  : <Sun className="w-5 h-5" />}
              </button>
              <button
                onClick={handleLogout}
                className="p-2 text-sidebar-text-muted hover:text-severity-critical transition-colors rounded-lg hover:bg-severity-critical/10 shrink-0"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header — Option C */}
        <header className="sticky top-0 shrink-0 z-10 px-4 sm:px-6 pt-3 sm:pt-3.5 pb-0">
          {/* Mobile hamburger — sits above the card on small screens */}
          <button 
            className="lg:hidden p-2 -ml-2 mb-2 text-text-muted hover:text-text-primary rounded-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="border border-border/10 rounded-xl overflow-hidden shadow-sm gradient-glow-top" style={{ background: 'var(--gradient-header)' }}>
            {/* Left Blue Accent Bar */}
            <div className="w-[4px] shrink-0 rounded-l-xl" style={{ background: 'var(--gradient-accent)' }} />

            {/* Inner content — two columns */}
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 flex-wrap flex-1">
              {/* LEFT SIDE — Icon + Branding / Title / Meta */}
              <div className="flex items-center gap-4 min-w-0">
                {/* Logo */}
                <img
                  src="/hmb.png"
                  alt="HMB Ispat"
                  className="h-11 w-auto object-contain shrink-0 select-none"
                  draggable={false}
                />

                {/* Text stack */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  {/* Eyebrow */}
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-sidebar-text-muted">
                    HMB Ispat · Business Intelligence
                  </span>

                  {/* Title */}
                  <h1 className="text-2xl font-semibold text-sidebar-text leading-tight m-0">
                    Executive Dashboard
                  </h1>

                  {/* Meta row */}
                  <div className="flex items-center gap-0 text-xs text-sidebar-text-muted flex-wrap leading-relaxed">
                    {headerDateRange && (
                      <span>{headerDateRange}</span>
                    )}
                    <span className="mx-2 text-sidebar-text-muted font-bold">|</span>
                    <span>Current Cycle (MTD)</span>
                    {dispatchGrowth !== null && (
                      <>
                        <span className="mx-2 text-sidebar-text-muted font-bold">|</span>
                        <span className={`text-sm sm:text-[13.5px] font-black tracking-wide ${dispatchGrowth >= 0 ? 'text-severity-none' : 'text-severity-critical'}`}>
                          {dispatchGrowth >= 0 ? '↑' : '↓'} {Math.abs(dispatchGrowth).toFixed(1)}% vs last period
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE — Sync status only */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-2 text-xs text-sidebar-text-muted whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-severity-none shrink-0" />
                  Live · Updated {syncAgoText}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-[90rem] mx-auto space-y-6 min-h-full relative">
            <AnimatePresence mode="popLayout">
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
