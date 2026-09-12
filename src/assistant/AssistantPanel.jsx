import { useCallback, useEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import { ArrowLeft, Clock, Maximize2, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAssistant } from './AssistantProvider';
import ConversationView from './ConversationView';
import Composer from './Composer';
import HistoryPane from './HistoryPane';
import { dismissTop } from './escapeStack';

// The slide-over shell: chrome, sizing, focus and keyboard behaviour. The
// conversation itself lives in ConversationView.
//
// Overlay rather than push: the dashboard behind keeps its layout, so opening
// the panel never reflows a page full of charts or triggers a re-measure of
// every recharts container.

const WIDTH_KEY = 'hmb_assistant_width';
const MIN_WIDTH = 380;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;
const STEP = 16;

const clampWidth = (n) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));

function readWidth() {
  try {
    const stored = Number.parseInt(localStorage.getItem(WIDTH_KEY), 10);
    return Number.isFinite(stored) ? clampWidth(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AssistantPanel() {
  const {
    closePanel,
    newConversation,
    messages,
    send,
    stop,
    retry,
    streaming,
    phases,
    loadingHistory,
    loadError,
    loadResult,
    view,
    setView,
    sessions,
    sessionsLoading,
    sessionId,
    selectSession,
    rename,
    remove,
    removeMany,
  } = useAssistant();

  // Only the behavioural differences are decided in JS. Sizing is CSS, so a
  // first render before matchMedia has reported cannot flash the wrong layout.
  const isMobile = useMediaQuery('(max-width: 639px)');
  const reducedMotion = useReducedMotion();
  const navigate = useNavigate();

  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);

  const history = view === 'history';

  const panelRef = useRef(null);
  const composerRef = useRef(null);

  // Focus in on open, and back out to whatever opened it on close. The trigger
  // is whatever held focus at mount: the header button, the mobile button, or
  // nothing at all when the keyboard shortcut was used.
  useEffect(() => {
    const trigger = document.activeElement;
    // Focused directly rather than in a requestAnimationFrame: rAF does not
    // run in a hidden tab, so a panel restored open in a background tab would
    // never take focus at all. preventScroll because the panel is mid-slide.
    composerRef.current?.focus({ preventScroll: true });
    return () => {
      if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  // Escape closes — but not mid-IME composition, where it belongs to the input
  // method rather than to us.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      // A dropdown or a delete confirmation gets the press first.
      if (dismissTop()) return;
      closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel]);

  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* storage disabled; the width simply will not persist */
    }
  }, [dragging, width]);

  // A chip in the empty state sends its question and hands focus back, so the
  // follow-up can be typed straight away.
  const handleSend = useCallback(
    (text) => {
      send(text);
      composerRef.current?.focus({ preventScroll: true });
    },
    [send],
  );

  // ── resize ─────────────────────────────────────────────────────────────────

  const onHandleDown = (e) => {
    if (isMobile) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // The pointer can already be gone by the time this runs. Capture is an
      // optimisation for tracking outside the handle, not a precondition.
    }
    setDragging(true);
  };

  const onHandleMove = (e) => {
    if (!dragging) return;
    setWidth(clampWidth(window.innerWidth - e.clientX));
  };

  const onHandleUp = (e) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  // The handle is a real control, so it answers to the keyboard too. Left
  // widens, because the panel grows leftwards.
  const onHandleKey = (e) => {
    if (e.key === 'ArrowLeft') setWidth((w) => clampWidth(w + STEP));
    else if (e.key === 'ArrowRight') setWidth((w) => clampWidth(w - STEP));
    else if (e.key === 'Home') setWidth(MAX_WIDTH);
    else if (e.key === 'End') setWidth(MIN_WIDTH);
    else return;
    e.preventDefault();
  };

  // ── focus trap, mobile only ────────────────────────────────────────────────
  //
  // On desktop the panel is deliberately not modal: the dashboard behind it
  // stays readable and operable, which is the whole point of a side panel.
  // Trapping Tab there would take that away.
  const onPanelKeyDown = useCallback(
    (e) => {
      if (e.key !== 'Tab' || !isMobile || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [isMobile],
  );

  const slide = reducedMotion
    ? { initial: false }
    : {
        initial: { x: '100%' },
        animate: { x: 0 },
        exit: { x: '100%' },
        transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
      };

  return (
    <m.section
      {...slide}
      ref={panelRef}
      onKeyDown={onPanelKeyDown}
      role="dialog"
      aria-modal={isMobile ? 'true' : 'false'}
      aria-label="Sales Assistant"
      className="fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-border bg-bg-secondary shadow-2xl sm:h-full sm:w-[var(--panel-w)]"
      style={{
        '--panel-w': `${width}px`,
        maxWidth: '100vw',
        height: isMobile ? 'var(--visual-viewport-h, 100dvh)' : undefined,
        maxHeight: isMobile ? 'var(--visual-viewport-h, 100dvh)' : undefined,
      }}
    >
      {/* Resize handle. Desktop only — a 6px drag target is meaningless on a
          touch screen, where the panel is full width anyway. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize assistant panel"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onKeyDown={onHandleKey}
        className={`absolute inset-y-0 left-0 hidden w-1.5 -translate-x-1/2 cursor-col-resize touch-none transition-colors focus-visible:bg-accent-blue focus-visible:outline-none sm:block ${
          dragging ? 'bg-accent-blue' : 'bg-transparent hover:bg-border-accent'
        }`}
      />

      <header
        className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2.5 sm:px-4"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))' }}
      >
        {history ? (
          <>
            <button
              type="button"
              onClick={() => setView('conversation')}
              aria-label="Back to conversation"
              title="Back"
              className="-ml-1 rounded-lg p-2 text-text-muted transition-all hover:bg-bg-card-hover hover:text-text-primary active:scale-95 sm:p-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="flex-1 truncate text-[0.9rem] font-semibold text-text-primary">
              History
            </span>
            <button
              type="button"
              onClick={newConversation}
              aria-label="New conversation"
              title="New conversation"
              className="rounded-lg p-2 text-text-muted transition-all hover:bg-bg-card-hover hover:text-text-primary active:scale-95 sm:p-1.5"
            >
              <Plus className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 truncate text-[0.9rem] font-semibold text-text-primary">
              Sales Assistant
            </span>
            <button
              type="button"
              onClick={() => {
                // The page picks the conversation up from the provider, so
                // there is nothing to hand over but the URL.
                closePanel();
                navigate(sessionId ? `/chat/${sessionId}` : '/chat');
              }}
              aria-label="Open full page"
              title="Open full page"
              className="rounded-lg p-2 text-text-muted transition-all hover:bg-bg-card-hover hover:text-text-primary active:scale-95 sm:p-1.5"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('history')}
              aria-label="Past conversations"
              title="Past conversations"
              className="rounded-lg p-2 text-text-muted transition-all hover:bg-bg-card-hover hover:text-text-primary active:scale-95 sm:p-1.5"
            >
              <Clock className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={newConversation}
              aria-label="New conversation"
              title="New conversation"
              className="rounded-lg p-2 text-text-muted transition-all hover:bg-bg-card-hover hover:text-text-primary active:scale-95 sm:p-1.5"
            >
              <Plus className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={closePanel}
          aria-label="Close assistant"
          title="Close"
          className="rounded-lg p-2 text-text-muted transition-all hover:bg-bg-card-hover hover:text-text-primary active:scale-95 sm:p-1.5"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {history ? (
        // No composer in this view: there is nothing to type into until a
        // conversation is chosen, and an inert input is just furniture.
        <HistoryPane
          sessions={sessions}
          loading={sessionsLoading}
          activeId={sessionId}
          onOpen={selectSession}
          onRename={rename}
          onDelete={remove}
          onDeleteMany={removeMany}
        />
      ) : (
        <>
          <ConversationView
            messages={messages}
            phases={phases}
            loadingHistory={loadingHistory}
            loadError={loadError}
            onSend={handleSend}
            onRetry={retry}
            loadResult={loadResult}
          />
          <Composer ref={composerRef} onSend={handleSend} onStop={stop} streaming={streaming} />
        </>
      )}
    </m.section>
  );
}
