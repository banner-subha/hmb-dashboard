import { useState, useMemo, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { NAV_ITEMS, CATEGORY_ICONS } from '../utils/constants';
import * as Icons from 'lucide-react';
import { AnimatePresence, LazyMotion, domAnimation, m } from 'framer-motion';
import { backdropVariants } from '../utils/motionVariants';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import AnimatedPage from '../components/common/AnimatedPage';
import { calculateMoM, formatTrend } from '../utils/trendEngine';

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const { rawData } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncAgoText, setSyncAgoText] = useState('just now');
  const prevDataRef = useRef(null);
  
  useBodyScrollLock(sidebarOpen);

  // Track when data changes to update "last synced" timestamp
  useEffect(() => {
    if (rawData && rawData !== prevDataRef.current) {
      prevDataRef.current = rawData;
      setLastSyncedAt(new Date());
    }
  }, [rawData]);

  // Update the "X min ago" text every 30 seconds
  useEffect(() => {
    if (!lastSyncedAt) return;
    const update = () => {
      const diffMs = Date.now() - lastSyncedAt.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) setSyncAgoText('just now');
      else if (diffMin === 1) setSyncAgoText('1 min ago');
      else setSyncAgoText(`${diffMin} min ago`);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Date range string for the header meta row
  const headerDateRange = useMemo(() => {
    if (!rawData) return "";
    const period = rawData.meta?.curPeriod || rawData.curPeriod || "";
    return period.replace(/\s*-\s*/g, ' – ');
  }, [rawData]);

  // Run-rate based MoM dispatch growth
  const dispatchGrowth = useMemo(() => {
    if (!rawData) return null;
    const curElapsed = rawData.meta?.curElapsedDays || 30;
    const prevElapsed = rawData.meta?.prevElapsedDays || 30;
    const curDailyRate = rawData.totalCur / curElapsed;
    const prevDailyRate = rawData.totalPrev / prevElapsed;
    if (!prevDailyRate) return 0;
    const mom = ((curDailyRate - prevDailyRate) / prevDailyRate) * 100;
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

        <div className="p-4 space-y-0.5 overflow-y-auto h-[calc(100vh-8rem)]">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 px-2 mt-4">
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

        <div className="absolute bottom-0 w-full px-4 py-3.5 border-t border-border bg-bg-secondary">
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-text-primary">{user?.username}</span>
              <span className="text-xs text-text-muted">{user?.role}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-text-muted hover:text-severity-critical transition-colors rounded-lg hover:bg-severity-critical/10"
              title="Logout"
            >
              <Icons.LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header — Option C */}
        <header className="sticky top-0 shrink-0 z-10 px-4 sm:px-6 pt-3 sm:pt-3.5 pb-0 bg-bg-primary">
          {/* Mobile hamburger — sits above the card on small screens */}
          <button 
            className="lg:hidden p-2 -ml-2 mb-2 text-text-muted hover:text-text-primary rounded-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <Icons.Menu className="w-5 h-5" />
          </button>

          <div className="flex bg-bg-secondary/80 border border-border/10 rounded-xl overflow-hidden shadow-sm">
            {/* Left Blue Accent Bar */}
            <div className="w-[4px] shrink-0 bg-accent-blue-strong rounded-l-xl" />

            {/* Inner content — two columns */}
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 flex-wrap flex-1">
              {/* LEFT SIDE — Icon + Branding / Title / Meta */}
              <div className="flex items-center gap-4 min-w-0">
                {/* Icon Container */}
                <div className="w-10 h-10 rounded-[10px] bg-bg-card border border-border shrink-0 flex items-center justify-center">
                  <Icons.Building2 className="w-5 h-5 text-accent-blue-strong" />
                </div>

                {/* Text stack */}
                <div className="flex flex-col gap-0.5 min-w-0">
                  {/* Eyebrow */}
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
                    HMB Ispat · Intelligence Suite
                  </span>

                  {/* Title */}
                  <h1 className="text-2xl font-semibold text-text-primary leading-tight m-0">
                    Executive Dashboard
                  </h1>

                  {/* Meta row */}
                  <div className="flex items-center gap-0 text-xs text-text-muted flex-wrap leading-relaxed">
                    {headerDateRange && (
                      <span>{headerDateRange}</span>
                    )}
                    <span className="mx-2 text-text-dim/40">|</span>
                    <span>Cycle MTD</span>
                    {dispatchGrowth !== null && (
                      <>
                        <span className="mx-2 text-text-dim/40">|</span>
                        <span className={`font-semibold ${dispatchGrowth >= 0 ? 'text-severity-none' : 'text-severity-critical'}`}>
                          {dispatchGrowth >= 0 ? '↑' : '↓'} {Math.abs(dispatchGrowth).toFixed(1)}% vs last cycle
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE — Sync status only */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-2 text-xs text-text-muted whitespace-nowrap">
                  <span className="w-2 h-2 rounded-full bg-severity-none shrink-0" />
                  Live · Last synced {syncAgoText}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-bg-primary">
          <div className="max-w-7xl mx-auto space-y-6 min-h-full relative">
            <AnimatePresence mode="wait">
              <AnimatedPage key={location.pathname}>
                <Outlet />
              </AnimatedPage>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
    </LazyMotion>
  );
}
