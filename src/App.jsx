import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { useData } from './context/DataContext';
import { useMemo } from 'react';

import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';

import ExecutiveOverview from './pages/ExecutiveOverview';
import StateIntelligence from './pages/StateIntelligence';
import DistrictIntelligence from './pages/DistrictIntelligence';
import DealerIntelligence from './pages/DealerIntelligence';
import AIWarRoom from './pages/AIWarRoom';
import GeoIntelligence from './pages/GeoIntelligence';

// ─── GeoIntelligence wrapper — transforms rawData → salesData prop ─────────────
function GeoIntelligenceWrapper() {
  const { rawData, loading, error } = useData();

  const salesData = useMemo(() => {
    if (!rawData) return { states: {}, districts: {} };

    // Build states map: { "West Bengal": { volume, trend, risk } }
    const states = {};
    (rawData.states || []).forEach((s) => {
      if (!s.state) return;
      states[s.state] = {
        volume: s.cur ?? s.volume ?? null,
        trend:  s.mom ?? s.trend ?? null,
        risk:   s.riskScore != null
          ? s.riskScore >= 70 ? 'High' : s.riskScore >= 40 ? 'Medium' : 'Low'
          : s.risk ?? null,
      };
    });

    // Build districts map: { "West Bengal": { "Kolkata": { volume, trend, risk } } }
    const districts = {};
    (rawData.districts || []).forEach((d) => {
      if (!d.state || !d.district) return;
      if (!districts[d.state]) districts[d.state] = {};
      districts[d.state][d.district] = {
        volume: d.cur ?? d.volume ?? null,
        trend:  d.mom ?? d.trend ?? null,
        risk:   d.riskScore != null
          ? d.riskScore >= 70 ? 'High' : d.riskScore >= 40 ? 'Medium' : 'Low'
          : d.risk ?? null,
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

  return <GeoIntelligence salesData={salesData} />;
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
            <Route path="geo" element={<GeoIntelligenceWrapper />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
