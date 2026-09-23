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
import { useGetDashboardTelemetry } from '../context/DashboardTelemetryContext';
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
  //
  // Adjusted during render rather than in an effect. The old effect committed
  // the signed-out tree first and only then wiped it, so a sign-out painted one
  // frame of the previous person's conversation before clearing — and every
  // setState in it was a second render pass on top of the first. React re-runs
  // this component immediately on a render-phase update, before anything is
  // committed or any child renders, so the cleared state is the only state that
  // ever reaches the screen.
  const [prevAuthenticated, setPrevAuthenticated] = useState(isAuthenticated);
  if (prevAuthenticated !== isAuthenticated) {
    setPrevAuthenticated(isAuthenticated);
    if (!isAuthenticated) {
      setOpen(false);
      setSessionId(null);
      setSessions([]);
      setView('conversation');
      setUnread(false);
    }
  }


  // A session minted mid-stream. State only — never navigation.
  const onSessionCreated = useCallback(
    (id) => {
      setSessionId(id);
      refreshSessions();
    },
    [refreshSessions],
  );

  const getTelemetry = useGetDashboardTelemetry();
  const stream = useAssistantStream({ sessionId, onSessionCreated, getContext: getTelemetry });
  const { streaming } = stream;

  // An answer that finished while the panel was shut is worth a dot on the
  // launcher; the user asked for it and then looked away. That is derived from
  // the streaming edge, not synchronised with anything outside React, so it is
  // read during the render that carries the edge rather than set from an effect
  // afterwards — which used to mark the dot a render late, and re-run on every
  // open and close besides.
  const [prevStreaming, setPrevStreaming] = useState(streaming);
  if (prevStreaming !== streaming) {
    setPrevStreaming(streaming);
    // The falling edge, read during the render that carries it. `open` is read
    // directly: this branch is reached only when `streaming` itself changed, so
    // opening or closing the panel cannot trigger it.
    if (prevStreaming && !streaming && !open) setUnread(true);
  }

  // The generated title lands shortly after the answer, in a background task,
  // so the refresh that picks it up is a timer — an external system, which is
  // what an effect is for. It needs the same edge, and cannot read it from
  // `prevStreaming`: that has already caught up by the time this commits. Hence
  // the ref. `open` is no longer a dependency, so opening the panel mid-wait no
  // longer cancels and reschedules a refresh that is already pending.
  const wasStreaming = useRef(false);

  useEffect(() => {
    if (wasStreaming.current && !streaming) {
      wasStreaming.current = streaming;
      const t = setTimeout(refreshSessions, 1200);
      return () => clearTimeout(t);
    }
    wasStreaming.current = streaming;
    return undefined;
  }, [streaming, refreshSessions]);

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
    stream.reset();
    setSessionId(null);
    setView('conversation');
  }, [stream]);

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
