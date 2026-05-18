import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { useData } from './context/DataContext';
import { useMemo } from 'react';
import { calculateMoM, getBusinessImpact } from './utils/trendEngine';

import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';

import ExecutiveOverview from './pages/ExecutiveOverview';
import StateIntelligence from './pages/StateIntelligence';
import DistrictIntelligence from './pages/DistrictIntelligence';
import DealerIntelligence from './pages/DealerIntelligence';
import AIWarRoom from './pages/AIWarRoom';
import AlertIntelligence from './pages/AlertIntelligence';
import GeoIntelligence from './pages/GeoIntelligence';

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
      const { severity, theme } = getBusinessImpact(cur, prev, s.inactivityDays, s.volatility);
      states[s.state] = {
        cur,
        prev,
        volume: cur,
        trend: mom,
        impact: severity,
        impactTier: severity,
        healthStatus: severity,
        healthColor: theme.color,
      };
    });

    // Build districts map: { "West Bengal": { "Kolkata": { volume, trend, impact, lookupKey } } }
    // ALL trend/severity derived from trendEngine — NEVER trust backend visual fields
    const districts = {};
    (rawData.districts || []).forEach((d) => {
      if (!d.state || !d.district) return;
      if (!districts[d.state]) districts[d.state] = {};
      const cur = d.cur ?? 0;
      const prev = d.prev ?? 0;
      const mom = calculateMoM(cur, prev);
      const { severity, theme } = getBusinessImpact(cur, prev, d.inactivityDays, d.volatility);
      districts[d.state][d.district] = {
        lookupKey: d.lookupKey,
        cur,
        prev,
        volume: cur,
        trend: mom,
        impact: severity,
        impactTier: severity,
        healthStatus: severity,
        healthColor: theme.color,
      };
    });

    return { states, districts };
  }, [rawData]);

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

  return <GeoIntelligence salesData={salesData} tooltip={(props) => (
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

  return <DataProvider>{children}</DataProvider>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<ExecutiveOverview />} />
            <Route path="states" element={<StateIntelligence />} />
            <Route path="districts" element={<DistrictIntelligence />} />
            <Route path="dealers" element={<DealerIntelligence />} />
            <Route path="war-room" element={<AIWarRoom />} />
            <Route path="alerts" element={<AlertIntelligence />} />
            <Route path="geo" element={<GeoIntelligenceWrapper />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
