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
    const baseDateStr = rawData?.meta?.generatedAt || rawData?.generatedAt || new Date().toISOString();
    let baseDate = new Date(baseDateStr);
    if (isNaN(baseDate.getTime())) baseDate = new Date();

    const today = new Date();
    const targetDate = (today.getFullYear() === baseDate.getFullYear() && today.getMonth() === baseDate.getMonth())
      ? baseDate
      : today;

    const day = targetDate.getDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const curMonthName = months[targetDate.getMonth()];
    const curYear = targetDate.getFullYear();

    const prevMonthDate = new Date(targetDate);
    prevMonthDate.setMonth(targetDate.getMonth() - 1);
    const prevMonthName = months[prevMonthDate.getMonth()];
    const prevDay = prevMonthDate.getDate();
    const prevYear = prevMonthDate.getFullYear();

    return `${prevDay} ${prevMonthName}${prevYear !== curYear ? ' ' + prevYear : ''} – ${day} ${curMonthName} ${curYear}`;
  }, [rawData]);

  // MoM dispatch growth
  const dispatchGrowth = useMemo(() => {
    if (!rawData) return null;
    const mom = calculateMoM(rawData.totalCur, rawData.totalPrev);
    if (mom === null || mom === undefined || isNaN(mom)) return null;
    return mom;
  }, [rawData]);

  const alertCount = rawData?.alerts?.length || 0;

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
        {/* Top Header — Option C */}
        <header className="sticky top-0 shrink-0 z-10 px-4 sm:px-6 pt-3 sm:pt-3.5 pb-0 bg-bg-primary">
          {/* Mobile hamburger — sits above the card on small screens */}
          <button 
            className="lg:hidden p-2 -ml-2 mb-2 text-text-muted hover:text-text-primary rounded-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <Icons.Menu className="w-5 h-5" />
          </button>

          <div
            id="header-option-c"
            style={{
              display: 'flex',
              background: '#0a0e1a',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px',
              overflow: 'hidden',
            }}
          >
            {/* Left Blue Accent Bar */}
            <div
              style={{
                width: '4px',
                flexShrink: 0,
                background: '#2255cc',
                borderRadius: '10px 0 0 10px',
              }}
            />

            {/* Inner content — two columns */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 20px 9px 16px',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              {/* LEFT SIDE — Icon + Branding / Title / Meta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                {/* Icon Container */}
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '9px',
                    background: '#101828',
                    border: '1px solid #1e3560',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icons.Building2 style={{ width: '19px', height: '19px', color: '#4d88ff' }} />
                </div>

                {/* Text stack */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                  {/* Eyebrow */}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#3d4f62',
                    }}
                  >
                    HMB Ispat · Intelligence Suite
                  </span>

                  {/* Title */}
                  <h1
                    style={{
                      fontSize: '17px',
                      fontWeight: 500,
                      color: '#d0daea',
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    Executive Dashboard
                  </h1>

                  {/* Meta row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0',
                      fontSize: '12px',
                      color: '#4a5a6a',
                      flexWrap: 'wrap',
                      lineHeight: 1.4,
                    }}
                  >
                    {headerDateRange && (
                      <span>{headerDateRange}</span>
                    )}
                    <span style={{ margin: '0 8px', color: '#1e2832' }}>|</span>
                    <span>Cycle MTD</span>
                    {dispatchGrowth !== null && (
                      <>
                        <span style={{ margin: '0 8px', color: '#1e2832' }}>|</span>
                        <span style={{ color: dispatchGrowth >= 0 ? '#3ddc84' : '#f87171', fontWeight: 600 }}>
                          {dispatchGrowth >= 0 ? '↑' : '↓'} {Math.abs(dispatchGrowth).toFixed(1)}% vs last cycle
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE — Alert Pill + Sync */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                {/* Alert Pill */}
                {alertCount > 0 && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(255,32,32,0.1)',
                      border: '1px solid rgba(255,32,32,0.18)',
                      color: '#ff6060',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: '#ff4444',
                        flexShrink: 0,
                      }}
                    />
                    {alertCount} Active Alerts
                  </div>
                )}

                {/* Live sync status */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.38)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#22c55e',
                      flexShrink: 0,
                    }}
                  />
                  Live · Last synced {syncAgoText}
                </div>
              </div>
            </div>
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
