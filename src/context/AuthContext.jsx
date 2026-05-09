import { createContext, useContext, useState, useEffect } from 'react';

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
    if (VALID_CREDENTIALS[username] === password) {
      const userData = { username, role: 'admin', loginAt: new Date().toISOString() };
      setUser(userData);
      localStorage.setItem('hmb_auth', JSON.stringify(userData));
      return { success: true };
    }
    return { success: false, error: 'Invalid credentials' };
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
