import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { useData } from './context/DataContext';
import React, { useMemo, lazy } from 'react';
import { calculateMoM, getBusinessImpact } from './utils/trendEngine';
import { getPendingAvailableMonths } from './utils/pending';
import ErrorBoundary from './components/common/ErrorBoundary';

import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';

const ExecutiveOverview = lazy(() => import('./pages/ExecutiveOverview'));
const StateIntelligence = lazy(() => import('./pages/StateIntelligence'));
const DistrictIntelligence = lazy(() => import('./pages/DistrictIntelligence'));
const DealerIntelligence = lazy(() => import('./pages/DealerIntelligence'));
const AIWarRoom = lazy(() => import('./pages/AIWarRoom'));
const AlertIntelligence = lazy(() => import('./pages/AlertIntelligence'));
const GeoIntelligence = lazy(() => import('./pages/GeoIntelligence'));

// ─── GeoIntelligence wrapper — transforms rawData → salesData prop ─────────────
function GeoIntelligenceWrapper() {
  const { rawData, loading, error } = useData();

  const salesData = useMemo(() => {
    if (!rawData) return { states: {}, districts: {} };

    // Build states map: { "West Bengal": { volume, trend, impact } }
    // ALL trend/severity derived from trendEngine — NEVER trust backend visual fields
    const states = {};
    (rawData.states || []).forEach((s) => {
      if (!s.state) return;
      const cur = s.cur ?? 0;
      const prev = s.prev ?? 0;
      const mom = calculateMoM(cur, prev);
      const { impactScore, severity, theme } = getBusinessImpact(cur, prev, s.share ?? 0, 'STATE', s.state, s.expectedMtd);

      const orderCur = s.orderCur ?? 0;
      const orderPrev = s.orderPrev ?? 0;
      const orderMoM = calculateMoM(orderCur, orderPrev);
      const orderImpact = getBusinessImpact(orderCur, orderPrev, 0, 0);

      states[s.state] = {
        cur,
        prev,
        volume: cur,
        trend: mom,
        impactScore,
        impact: severity,
        impactTier: severity,
        healthStatus: severity,
        healthColor: theme.color,
        slug: s.slug || '',
        pendingQty: s.pendingQty ?? 0,
        pendingHistory: s.pendingHistory ?? {},
        dailyAvgQty: s.dailyAvgQty ?? 0,
        expectedMtd: s.expectedMtd ?? 0,

        // Order variables
        orderCur,
        orderPrev,
        orderMoM,
        orderImpactScore: orderImpact.impactScore,
        orderImpactTier: orderImpact.severity,
        orderHealthStatus: orderImpact.severity,
        orderHealthColor: orderImpact.theme.color,
      };
    });

    // Build districts map: { "West Bengal": { "Kolkata": { volume, trend, impact, lookupKey } } }
    // ALL trend/severity derived from trendEngine — NEVER trust backend visual fields
    const districts = {};
    const totalCur = rawData.totalCur ?? 0;
    (rawData.districts || []).forEach((d) => {
      if (!d.state || !d.district) return;
      if (!districts[d.state]) districts[d.state] = {};
      const cur = d.cur ?? 0;
      const prev = d.prev ?? 0;
      const mom = calculateMoM(cur, prev);
      const share = totalCur > 0 ? (cur / totalCur) * 100 : 0;
      const { impactScore, severity, theme } = getBusinessImpact(cur, prev, share, 'DISTRICT', d.state, d.expectedMtd);

      const orderCur = d.orderCur ?? 0;
      const orderPrev = d.orderPrev ?? 0;
      const orderMoM = calculateMoM(orderCur, orderPrev);
      const orderImpact = getBusinessImpact(orderCur, orderPrev, 0, 0);

      districts[d.state][d.district] = {
        lookupKey: d.lookupKey,
        cur,
        prev,
        volume: cur,
        trend: mom,
        impactScore,
        impact: severity,
        slug: d.slug || '',
        pendingQty: d.pendingQty ?? 0,
        pendingHistory: d.pendingHistory ?? {},
        dailyAvgQty: d.dailyAvgQty ?? 0,
        impactTier: severity,
        healthStatus: severity,
        healthColor: theme.color,

        // Order variables
        orderCur,
        orderPrev,
        orderMoM,
        orderImpactScore: orderImpact.impactScore,
        orderImpactTier: orderImpact.severity,
        orderHealthStatus: orderImpact.severity,
        orderHealthColor: orderImpact.theme.color,
      };
    });

    return { states, districts };
  }, [rawData]);

  const pendingAvailableMonths = useMemo(() => getPendingAvailableMonths(rawData), [rawData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        Loading geographic data…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center py-24 text-severity-critical">
        Error: {error}
      </div>
    );
  }

  return <GeoIntelligence salesData={salesData} pendingAvailableMonths={pendingAvailableMonths} tooltip={(props) => (
          <div className="p-2 text-xs font-bold space-y-1">
            <div className="text-text-primary uppercase tracking-wider border-b border-border pb-1 mb-1">{props.name}</div>
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">Impact:</span>
              <span className="text-text-primary">{props.data?.impactTier || 'Stable'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">Health:</span>
              <span style={{ color: props.data?.healthColor || '#94a3b8' }}>{props.data?.healthStatus || 'Stable'}</span>
            </div>
          </div>
        )} />;
}

// ── DistrictIntelligence wrapper — transforms rawData → passes pendingAvailableMonths prop ─────────────
function DistrictIntelligenceWrapper() {
  const { rawData, loading, error } = useData();
  const pendingAvailableMonths = useMemo(() => getPendingAvailableMonths(rawData), [rawData]);
  if (loading) return <div className="min-h-screen bg-bg-primary flex items-center justify-center text-text-muted">Loading district data…</div>;
  if (error) return <div className="min-h-screen bg-bg-primary flex items-center justify-center text-severity-critical">Error: {error}</div>;
  return <DistrictIntelligence pendingAvailableMonths={pendingAvailableMonths} />;
}

// ── DealerIntelligence wrapper — transforms rawData → passes pendingAvailableMonths prop ─────────────
function DealerIntelligenceWrapper() {
  const { rawData, loading, error } = useData();
  const pendingAvailableMonths = useMemo(() => getPendingAvailableMonths(rawData), [rawData]);
  if (loading) return <div className="min-h-screen bg-bg-primary flex items-center justify-center text-text-muted">Loading dealer data…</div>;
  if (error) return <div className="min-h-screen bg-bg-primary flex items-center justify-center text-severity-critical">Error: {error}</div>;
  return <DealerIntelligence pendingAvailableMonths={pendingAvailableMonths} />;
}

// ── StateIntelligence wrapper — transforms rawData → passes pendingAvailableMonths prop ─────────────
function StateIntelligenceWrapper() {
  const { rawData, loading, error } = useData();

  const pendingAvailableMonths = useMemo(() => getPendingAvailableMonths(rawData), [rawData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center text-text-muted">
        Loading state data…
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center text-severity-critical">
        Error: {error}
      </div>
    );
  }

  return <StateIntelligence pendingAvailableMonths={pendingAvailableMonths} />;
}

// RequireAuth Wrapper
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen bg-bg-primary flex items-center justify-center text-text-muted">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// Index route element — directs clients to /states and admins to ExecutiveOverview
function IndexElement() {
  const { user } = useAuth();
  if (user?.role === 'client') {
    return <Navigate to="/states" replace />;
  }
  return <ExecutiveOverview />;
}

// Admin-only route guard
function RequireAdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role === 'client') {
    return <Navigate to="/states" replace />;
  }
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
      <AuthProvider>
        <DataProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              
              <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
                <Route index element={<IndexElement />} />
                <Route path="states" element={<StateIntelligenceWrapper />} />
                <Route path="districts" element={<DistrictIntelligenceWrapper />} />
                <Route path="dealers" element={<DealerIntelligenceWrapper />} />
                <Route path="risk" element={<Navigate to="/alerts" replace />} />
                <Route path="war-room" element={<RequireAdminRoute><AIWarRoom /></RequireAdminRoute>} />
                <Route path="alerts" element={<RequireAdminRoute><AlertIntelligence /></RequireAdminRoute>} />
                <Route path="geo" element={<RequireAdminRoute><GeoIntelligenceWrapper /></RequireAdminRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
