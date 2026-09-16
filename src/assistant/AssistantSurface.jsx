import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAuth } from '../context/AuthContext';
import { useAssistant } from './AssistantProvider';
import AssistantPanel from './AssistantPanel';
import AssistantFab from './AssistantFab';

// Everything that has to exist whether or not the panel is open: the keyboard
// shortcut, the mobile trigger, the scroll lock, and the boundary that keeps a
// panel crash from taking the dashboard down with it.
//
// This is the module App lazy-loads, so the panel and anything it pulls in
// stay out of the dashboard's initial bundle.

/**
 * Recovery UI for a crashed panel.
 *
 * `restart` is not the boundary's own reset. Clearing the caught flag alone
 * re-renders the identical children from the identical conversation state, so
 * a crash that came from the transcript — a malformed persisted turn, a chart
 * spec the renderer cannot take — throws again on the same tick and the
 * fallback reappears unchanged. From the outside the button does nothing. The
 * owner therefore discards the conversation and remounts the subtree instead.
 *
 * `stuck` is that guarantee's fallback in turn: when the crash is in the panel
 * chrome rather than the transcript, a restart cannot clear it either, and the
 * honest next step is a reload rather than a button that will keep failing.
 */
function PanelCrashed({ error, restart, stuck }) {
  return (
    <section
      role="dialog"
      aria-label="Sales Assistant"
      className="fixed inset-y-0 right-0 z-[60] flex w-full flex-col items-center justify-center gap-4 border-l border-border bg-bg-secondary p-6 text-center sm:w-[420px]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-severity-critical/10">
        <AlertTriangle className="h-6 w-6 text-severity-critical" />
      </div>
      <div>
        <h2 className="text-[0.95rem] font-semibold text-text-primary">
          {stuck ? 'The assistant is still not working' : 'The assistant stopped working'}
        </h2>
        <p className="mt-1 text-[0.85rem] leading-relaxed text-text-muted">
          {stuck
            ? 'Restarting did not clear it, so the page itself needs reloading. The dashboard behind is unaffected and you stay signed in.'
            : 'The dashboard behind is unaffected. Restarting clears the current conversation and keeps you signed in.'}
        </p>
        {error?.message && (
          <p className="mt-2.5 break-words rounded-md bg-bg-card px-3 py-1.5 font-mono text-[0.7rem] leading-relaxed text-text-muted/70">
            {error.message}
          </p>
        )}
      </div>
      {stuck ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[0.85rem] font-medium text-white"
          style={{ background: 'var(--gradient-accent)' }}
        >
          <RotateCcw className="h-4 w-4" />
          Reload the page
        </button>
      ) : (
        <button
          type="button"
          onClick={restart}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[0.85rem] font-medium text-white"
          style={{ background: 'var(--gradient-accent)' }}
        >
          <RefreshCw className="h-4 w-4" />
          Restart assistant
        </button>
      )}
    </section>
  );
}

/**
 * Mounted last inside the boundary, and does nothing but report that it got
 * there. An effect runs only after the whole subtree has committed, so this
 * firing is proof that nothing above it threw — which is the only honest
 * definition of "the restart worked".
 */
function PanelHealthy({ onHealthy }) {
  useEffect(() => {
    onHealthy();
  }, [onHealthy]);
  return null;
}

export default function AssistantSurface() {
  const { user } = useAuth();
  const { open, togglePanel, newConversation } = useAssistant();
  const isMobile = useMediaQuery('(max-width: 639px)');
  const isClient = user?.role === 'client';

  // Every hook below runs unconditionally. The client-role bail-out used to sit
  // here, above them, which changes the hook count the moment the role resolves
  // from undefined to 'client' — React throws "rendered fewer hooks than
  // expected", and that throw escapes the boundary this component returns,
  // taking the dashboard rather than the panel. The bail-out is now below.

  // The panel is a full-screen sheet on mobile, so the page behind it must not
  // scroll under the finger. On desktop it is a side panel and the dashboard
  // is meant to stay scrollable.
  useBodyScrollLock(open && isMobile && !isClient);

  // Panel crash recovery.
  //
  // `surfaceKey` keys the boundary itself, so restarting unmounts it along with
  // everything under it and mounts a fresh one. A boundary that merely clears
  // its own flag keeps the same child instances and the same conversation, and
  // a deterministic crash is straight back on screen.
  //
  // `crashes` distinguishes the first failure from one that survived a restart,
  // so the second offers a reload rather than a button already known not to
  // work. It counts catches since the subtree last rendered cleanly — see
  // <PanelHealthy>, which is what resets it.
  const [surfaceKey, setSurfaceKey] = useState(0);
  const [crashes, setCrashes] = useState(0);

  const handleCrash = useCallback(() => setCrashes((n) => n + 1), []);
  // Cleared by the subtree committing, not by a timer. A restart has worked
  // exactly when the panel renders without throwing, and that is what
  // <PanelHealthy> reports; elapsed time says nothing, since a user can sit on
  // the crash screen for a minute before pressing the button.
  const handleHealthy = useCallback(() => setCrashes(0), []);

  const restart = useCallback(() => {
    // The conversation is the likeliest source: it is the only input to the
    // panel that is rebuilt from the server and replayed from sessionStorage,
    // so a turn that cannot be rendered would otherwise come back on reload
    // too. This aborts any stream, empties the transcript and drops the stored
    // session id.
    newConversation();
    setSurfaceKey((k) => k + 1);
  }, [newConversation]);

  // Publish the visual viewport to CSS, so fixed children can be anchored to
  // the part of the screen the user can actually see.
  //
  // `position: fixed` resolves against the *layout* viewport, which on Android
  // runs edge to edge underneath the address bar, the gesture pill and the
  // keyboard — anything pinned with `bottom` ends up beneath them. The visual
  // viewport is what is on screen; its height and its offset within the layout
  // viewport are all a child needs to sit inside it.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateMetrics = () => {
      const vv = window.visualViewport;
      const root = document.documentElement.style;
      const height = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      root.setProperty('--visual-viewport-h', `${height}px`);
      root.setProperty('--visual-viewport-top', `${top}px`);
    };

    updateMetrics();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateMetrics);
      vv.addEventListener('scroll', updateMetrics);
    }
    window.addEventListener('resize', updateMetrics);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateMetrics);
        vv.removeEventListener('scroll', updateMetrics);
      }
      window.removeEventListener('resize', updateMetrics);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      // Ctrl/Cmd+J as well as K: K is the address-bar shortcut in some
      // browsers, and preventDefault does not always win that fight.
      if (key !== 'k' && key !== 'j') return;
      e.preventDefault();
      togglePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePanel]);

  if (isClient) return null;

  return createPortal(
    <ErrorBoundary
      key={surfaceKey}
      onError={handleCrash}
      fallback={({ error }) => (
        <PanelCrashed error={error} restart={restart} stuck={crashes > 1} />
      )}
    >
      <AssistantFab />
      <LazyMotion features={domAnimation}>
        <AnimatePresence>{open && <AssistantPanel />}</AnimatePresence>
      </LazyMotion>
      <PanelHealthy onHealthy={handleHealthy} />
    </ErrorBoundary>,
    document.body,
  );
}
