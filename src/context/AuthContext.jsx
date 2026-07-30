import { createContext, useContext, useState, useEffect } from 'react';
import { authenticateClientUser } from '../data/clientRegistry';

const AuthContext = createContext(null);

// Simple password-based auth for v1
// Future: Replace with Netlify Identity / Supabase Auth for role-based access
const VALID_CREDENTIALS = {
  admin: 'hmb2026!',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('hmb_auth');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const login = (username, password) => {
    // 1. Admin login check
    if (username?.trim().toLowerCase() === 'admin' && password === VALID_CREDENTIALS.admin) {
      const userData = {
        username: 'admin',
        name: 'Admin',
        role: 'admin',
        loginAt: new Date().toISOString()
      };
      setUser(userData);
      localStorage.setItem('hmb_auth', JSON.stringify(userData));
      return { success: true };
    }

    // 2. Client login check via clientRegistry
    const clientUser = authenticateClientUser(username, password);
    if (clientUser) {
      const isAdminRole = clientUser.role === 'ADMIN';
      const userData = {
        username: clientUser.name,
        name: clientUser.name,
        role: isAdminRole ? 'admin' : 'client',
        kroRole: clientUser.role,
        states: clientUser.states || [],
        districts: clientUser.districts || [],
        labels: clientUser.labels || [],
        chatId: clientUser.chatId,
        loginAt: new Date().toISOString()
      };
      setUser(userData);
      localStorage.setItem('hmb_auth', JSON.stringify(userData));
      return { success: true };
    }

    return {
      success: false,
      error: 'Invalid username or password'
    };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('hmb_auth');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
