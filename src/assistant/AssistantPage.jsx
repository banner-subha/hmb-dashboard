import { useEffect, useRef } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, LayoutDashboard, Plus } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAssistant } from './AssistantProvider';
import ConversationView from './ConversationView';
import Composer from './Composer';
import HistoryPane from './HistoryPane';

// /chat — the same assistant, given the whole viewport.
//
// This exists for the things a 420px panel cannot do well: a deep link someone
// pasted into chat, a twelve-column table, a chart worth actually looking at.
// It shares the provider's single conversation, so opening a session here and
// then closing the page leaves the panel on the same conversation.
//
// It is also the only surface that touches the URL. The provider owns
// `sessionId`; this page mirrors it both ways while it is mounted, and nothing
// else navigates.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AssistantPage() {
  const match = useMatch('/chat/:sessionId');
  const raw = match?.params?.sessionId;
  const param = raw && UUID.test(raw) ? raw : null;

  const navigate = useNavigate();
  const wideEnoughForSidebar = useMediaQuery('(min-width: 1024px)');

  const {
    messages,
    phases,
    send,
    stop,
    retry,
    streaming,
    loadingHistory,
    loadError,
    loadResult,
    sessionId,
    setSessionId,
    view,
    setView,
    newConversation,
    selectSession,
    sessions,
    sessionsLoading,
    rename,
    remove,
    removeMany,
  } = useAssistant();

  const composerRef = useRef(null);

  // The URL and the provider are kept in step, with the last value this page
  // reconciled held in a ref so it can tell which side moved.
  const syncedRef = useRef(param);

  useEffect(() => {
    // The URL changed under us — a paste, the back button, a fresh load. It
    // wins.
    if (param === syncedRef.current) return;
    syncedRef.current = param;
    if (param !== sessionId) setSessionId(param);
  }, [param, sessionId, setSessionId]);

  useEffect(() => {
    // The conversation moved — a session was minted mid-answer, or a row was
    // picked from history. Reflect it, replacing rather than pushing so the
    // back button still leaves the page rather than walking the session list.
    if (sessionId === syncedRef.current) return;
    syncedRef.current = sessionId;
    navigate(sessionId ? `/chat/${sessionId}` : '/chat', { replace: true });
  }, [sessionId, navigate]);

  useEffect(() => {
    composerRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSend = (text) => {
    send(text);
    composerRef.current?.focus({ preventScroll: true });
  };

  const handleNewConversation = () => {
    newConversation();
    syncedRef.current = null;
    navigate('/chat', { replace: true });
    composerRef.current?.focus({ preventScroll: true });
  };

  // Wide enough for a permanent list; narrow screens switch views the way the
  // panel does.
  const sidebar = wideEnoughForSidebar;
  const showHistoryInMain = !sidebar && view === 'history';

  const historyPane = (
    <HistoryPane
      sessions={sessions}
      loading={sessionsLoading}
      activeId={sessionId}
      onOpen={selectSession}
      onRename={rename}
      onDelete={remove}
      onDeleteMany={removeMany}
    />
  );

  return (
    <div className="flex h-dvh max-h-dvh w-full overflow-hidden bg-bg-primary text-text-primary">
      {sidebar && (
        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border">
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2.5">
            <span className="flex-1 text-[0.9rem] font-semibold">History</span>
            <button
              type="button"
              onClick={handleNewConversation}
              aria-label="New conversation"
              title="New conversation"
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {historyPane}
        </aside>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2.5 sm:px-5">
          {showHistoryInMain ? (
            <>
              <button
                type="button"
                onClick={() => setView('conversation')}
                aria-label="Back to conversation"
                title="Back"
                className="-ml-1 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="flex-1 truncate text-[0.9rem] font-semibold">History</span>
            </>
          ) : (
            <>
              <span className="flex-1 truncate text-[0.9rem] font-semibold">
                Sales Assistant
              </span>
              {!sidebar && (
                <>
                  <button
                    type="button"
                    onClick={() => setView('history')}
                    aria-label="Past conversations"
                    title="Past conversations"
                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNewConversation}
                    aria-label="New conversation"
                    title="New conversation"
                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to dashboard"
            title="Back to dashboard"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
          >
            <LayoutDashboard className="h-4 w-4" />
          </button>
        </header>

        {showHistoryInMain ? (
          historyPane
        ) : (
          <>
            <ConversationView
              wide
              messages={messages}
              phases={phases}
              loadingHistory={loadingHistory}
              loadError={loadError}
              onSend={handleSend}
              onRetry={retry}
              loadResult={loadResult}
            />
            <div className="mx-auto w-full max-w-[46rem]">
              <Composer
                ref={composerRef}
                onSend={handleSend}
                onStop={stop}
                streaming={streaming}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
