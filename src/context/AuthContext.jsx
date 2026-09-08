import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as agentLogin, AgentError } from '../assistant/api';

const AuthContext = createContext(null);

// Credentials live in one place: chat_users in the sales project, seeded from
// the dashboard roster by hmb-sales-agent/scripts/seed_users.py. The existing
// rules are preserved exactly — admin keeps its password, everyone else is
// their name with spaces stripped plus "@26" — so no login changes here.
//
// The agent issues the token this app needs to call the chat API at all, so
// authentication has to go through it rather than being duplicated locally.
const AUTH_KEY = 'hmb_auth';

/**
 * The dashboard's own notion of role, which is not the agent's.
 *   dashboard role 'client' -> restricted nav, redirected away from /
 *   agent role     'admin'  -> unscoped data access in chat
 * Derived from field_role so the dashboard behaves exactly as it did before.
 */
function dashboardRole(fieldRole) {
  return String(fieldRole || '').toUpperCase() === 'ADMIN' ? 'admin' : 'client';
}

/**
 * Read the stored session once, during the first render.
 *
 * A session is only usable if it carries an unexpired access token. Anything
 * else counts as signed out: an expired token cannot be refreshed, and an
 * entry saved before this app started using tokens at all has no token to
 * send. Restoring either one puts the app in the worst state available — the
 * dashboard renders as signed in while every agent call answers 401.
 */
function readStoredUser() {
  try {
    const saved = localStorage.getItem(AUTH_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    const expired = parsed?.expiresAt && parsed.expiresAt * 1000 < Date.now();
    if (!parsed?.accessToken || !parsed?.expiresAt || expired) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
  }, []);

  // Any 401 from the agent means the token is gone. One listener, one place.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('hmb:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hmb:unauthorized', onUnauthorized);
  }, [logout]);

  const login = useCallback(async (username, password) => {
    try {
      const res = await agentLogin(username, password);
      const userData = {
        username: res.user.username,
        name: res.user.name,
        role: dashboardRole(res.user.field_role),
        agentRole: res.user.role,
        kroRole: res.user.field_role,
        userId: res.user.user_id,
        states: res.user.scope?.states || [],
        districts: res.user.scope?.districts || [],
        labels: [],
        accessToken: res.access_token,
        expiresAt: res.expires_at,
        loginAt: new Date().toISOString(),
      };
      setUser(userData);
      localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
      return { success: true };
    } catch (err) {
      if (err instanceof AgentError && err.status === 401) {
        return { success: false, error: 'Invalid username or password' };
      }
      // status 0 is a configuration problem, and its message says which.
      if (err instanceof AgentError && err.status === 0) {
        return { success: false, error: err.message };
      }
      return {
        success: false,
        error:
          'Cannot reach the sign-in service. Check that the agent is running ' +
          'and that VITE_AGENT_URL points at it.',
      };
    }
  }, []);

  // The stored session is read during the first render, so there is no
  // asynchronous restore to wait for. `loading` stays in the contract because
  // RequireAuth and the pages read it.
  return (
    <AuthContext.Provider
      value={{ user, loading: false, login, logout, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
