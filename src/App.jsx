import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';

import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';

import ExecutiveOverview from './pages/ExecutiveOverview';
import StateIntelligence from './pages/StateIntelligence';
import DistrictIntelligence from './pages/DistrictIntelligence';
import DealerIntelligence from './pages/DealerIntelligence';
import AIWarRoom from './pages/AIWarRoom';

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
