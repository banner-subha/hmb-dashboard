import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from './api';
import useAssistantStream from './useAssistantStream';

// The assistant's state lives above the router.
//
// The panel opens over State Overview, the user clicks through to Dealer
// Network, and the answer must keep streaming into the same conversation. That
// rules out holding this state in any routed component: those unmount on
// navigation. So the provider sits as a sibling of <Routes>, owns `sessionId`
// as ordinary state, and the /chat page mirrors it into the URL rather than
// the other way around.
//
// The corollary matters just as much: a session minted while the panel is open
// must NOT navigate. Pushing /chat/<id> would unmount the dashboard page
// sitting behind the panel and reload it on close.

const OPEN_KEY = 'hmb_assistant_open';
const SESSION_KEY = 'hmb_assistant_session';

const AssistantContext = createContext(null);

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used inside <AssistantProvider>');
  return ctx;
}

function readStored(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    // Private browsing, or storage disabled. Not worth failing over.
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function AssistantProvider({ children }) {
  // The provider sits above the router, so it is mounted on the sign-in screen
  // too. Every call it makes needs a live token, so nothing happens until
  // there is one.
  //
  // `agentReady`, not `isAuthenticated`: a lapsed token leaves the dashboard
  // signed in, so the session list is the one thing that must not be requested
  // with a token the agent will reject. Asking a question with a dead token
  // simply fails inline, which is the whole of the handling it needs.
  const { isAuthenticated, agentReady } = useAuth();

  // Restored from the tab, so a refresh mid-conversation comes back to it.
  const [open, setOpen] = useState(() => readStored(OPEN_KEY) === '1');
  const [view, setView] = useState('conversation'); // 'conversation' | 'history'
  const [sessionId, setSessionId] = useState(() => readStored(SESSION_KEY));
  const [unread, setUnread] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => writeStored(OPEN_KEY, open ? '1' : null), [open]);
  useEffect(() => writeStored(SESSION_KEY, sessionId), [sessionId]);

  const refreshSessions = useCallback(() => {
    if (!agentReady) return Promise.resolve();
    return api.listSessions().then(
      (data) => {
        setSessions(data.sessions || []);
        setSessionsLoading(false);
      },
      () => {
        // The list is navigation, not content. A failure here must not
        // break the conversation itself.
        setSessionsLoading(false);
      },
    );
  }, [agentReady]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Signing out has to clear the conversation, not just hide it. The next
  // person to sign in on this tab must not find someone else's questions
  // restored from sessionStorage.
  useEffect(() => {
    if (isAuthenticated) return;
    setOpen(false);
    setSessionId(null);
    setSessions([]);
    setView('conversation');
    setUnread(false);
  }, [isAuthenticated]);

  // A session minted mid-stream. State only — never navigation.
  const onSessionCreated = useCallback(
    (id) => {
      setSessionId(id);
      refreshSessions();
    },
    [refreshSessions],
  );

  const stream = useAssistantStream({ sessionId, onSessionCreated });
  const { streaming } = stream;

  // The generated title lands shortly after the answer, in a background task.
  // An answer that finished while the panel was shut is worth a dot on the
  // launcher; the user asked for it and then looked away.
  const wasStreaming = useRef(false);

  useEffect(() => {
    // Only the streaming edge matters. This effect also re-runs when the panel
    // opens or closes, and on those runs both sides of the guard agree, so it
    // does nothing — which is why `open` can be read directly here instead of
    // being mirrored into a ref during render.
    if (wasStreaming.current && !streaming) {
      if (!open) setUnread(true);
      const t = setTimeout(refreshSessions, 1200);
      wasStreaming.current = streaming;
      return () => clearTimeout(t);
    }
    wasStreaming.current = streaming;
    return undefined;
  }, [streaming, open, refreshSessions]);

  // ── surface control ────────────────────────────────────────────────────────

  const openPanel = useCallback(() => {
    setOpen(true);
    setUnread(false);
  }, []);

  // Closing returns to the conversation. The panel exists to be asked things,
  // so reopening it should land on the composer rather than wherever the last
  // session left off in the history list.
  const closePanel = useCallback(() => {
    setOpen(false);
    setView('conversation');
  }, []);

  const togglePanel = useCallback(() => {
    setOpen((v) => {
      if (!v) setUnread(false);
      return !v;
    });
  }, []);

  const newConversation = useCallback(() => {
    setSessionId(null);
    setView('conversation');
  }, []);

  const selectSession = useCallback((id) => {
    setSessionId(id);
    setView('conversation');
  }, []);

  // ── session list mutations ─────────────────────────────────────────────────

  const rename = useCallback(
    async (id, title) => {
      setSessions((prev) => prev.map((s) => (s.session_id === id ? { ...s, title } : s)));
      try {
        await api.renameSession(id, title);
      } finally {
        refreshSessions();
      }
    },
    [refreshSessions],
  );

  const remove = useCallback(
    async (id) => {
      try {
        await api.deleteSession(id);
        setSessions((prev) => prev.filter((s) => s.session_id !== id));
      } finally {
        if (id === sessionId) setSessionId(null);
        refreshSessions();
      }
    },
    [sessionId, refreshSessions],
  );

  /**
   * Delete many. Rows leave the list as their requests land rather than all at
   * once up front: a bulk delete against a per-id endpoint fails partially as
   * its normal mode, and a list that emptied optimistically would then have to
   * put rows back.
   */
  const removeMany = useCallback(
    async (ids, onProgress) => {
      const result = await api.deleteSessions(ids, { onProgress });
      const gone = new Set(result.deleted);
      setSessions((prev) => prev.filter((s) => !gone.has(s.session_id)));
      if (sessionId && gone.has(sessionId)) setSessionId(null);
      refreshSessions();
      return result;
    },
    [sessionId, refreshSessions],
  );

  const value = useMemo(
    () => ({
      ...stream,
      open,
      openPanel,
      closePanel,
      togglePanel,
      unread,
      view,
      setView,
      sessionId,
      // The /chat page mirrors the URL into this. Nothing else should call it.
      setSessionId,
      newConversation,
      selectSession,
      sessions,
      sessionsLoading,
      refreshSessions,
      rename,
      remove,
      removeMany,
    }),
    [
      stream,
      open,
      openPanel,
      closePanel,
      togglePanel,
      unread,
      view,
      sessionId,
      newConversation,
      selectSession,
      sessions,
      sessionsLoading,
      refreshSessions,
      rename,
      remove,
      removeMany,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
