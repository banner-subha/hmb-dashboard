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
    // Only an entry that identifies someone is worth restoring. An expired
    // access token is NOT a reason to throw the session away: the dashboard's
    // figures come from a public storage object and need no token at all, so
    // discarding the identity only forced a sign-in that bought nothing.
    if (!parsed?.username) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

/**
 * Whether the stored access token can still be sent to the agent.
 *
 * The agent has no refresh endpoint — /openapi.json lists /auth/login and
 * nothing else — so a token cannot be renewed silently. When it lapses the
 * dashboard carries on and only the assistant needs signing in again.
 */
function tokenUsable(stored) {
  if (!stored?.accessToken) return false;
  return !stored.expiresAt || stored.expiresAt * 1000 > Date.now();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  // Set when the agent rejects the token. Separate from `user`, because being
  // signed in and holding a live agent token are now two different things.
  const [tokenRejected, setTokenRejected] = useState(false);

  const logout = useCallback(() => {
    setUser(null);
    setTokenRejected(false);
    localStorage.removeItem(AUTH_KEY);
  }, []);

  // A 401 from the agent retires the token, not the session. Signing out is
  // something the user does deliberately, from the button that says so.
  useEffect(() => {
    const onUnauthorized = () => setTokenRejected(true);
    window.addEventListener('hmb:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hmb:unauthorized', onUnauthorized);
  }, []);

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
      setTokenRejected(false);
      localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
      return { success: true };
    } catch (err) {
      if (err instanceof AgentError && err.status === 401) {
        return { success: false, error: 'Invalid username or password' };
      }
      // Every other AgentError already carries a message written for this
      // screen — a missing VITE_AGENT_URL, a timeout, a 502, a dead network.
      // Collapsing them into one sentence about configuration is how a
      // transient blip turns into an afternoon of checking settings.
      if (err instanceof AgentError) {
        return { success: false, error: err.message };
      }
      return { success: false, error: `Sign-in failed: ${err.message}` };
    }
  }, []);

  // The stored session is read during the first render, so there is no
  // asynchronous restore to wait for. `loading` stays in the contract because
  // RequireAuth and the pages read it.
  return (
    <AuthContext.Provider
      value={{
        user,
        loading: false,
        login,
        logout,
        // Signed in: the dashboard is yours. Survives a lapsed agent token.
        isAuthenticated: !!user,
        // Cleared to talk to the agent. The assistant checks this one.
        agentReady: !!user && !tokenRejected && tokenUsable(user),
      }}
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
