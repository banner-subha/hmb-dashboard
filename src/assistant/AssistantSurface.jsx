import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAssistant } from './AssistantProvider';
import AssistantPanel from './AssistantPanel';
import AssistantFab from './AssistantFab';

// Everything that has to exist whether or not the panel is open: the keyboard
// shortcut, the mobile trigger, the scroll lock, and the boundary that keeps a
// panel crash from taking the dashboard down with it.
//
// This is the module App lazy-loads, so the panel and anything it pulls in
// stay out of the dashboard's initial bundle.

function PanelCrashed({ reset }) {
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
          The assistant stopped working
        </h2>
        <p className="mt-1 text-[0.85rem] leading-relaxed text-text-muted">
          The dashboard behind is unaffected. Restarting keeps you signed in.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-[0.85rem] font-medium text-white"
        style={{ background: 'var(--gradient-accent)' }}
      >
        <RefreshCw className="h-4 w-4" />
        Restart assistant
      </button>
    </section>
  );
}

export default function AssistantSurface() {
  const { open, togglePanel } = useAssistant();
  const isMobile = useMediaQuery('(max-width: 639px)');

  // The panel is a full-screen sheet on mobile, so the page behind it must not
  // scroll under the finger. On desktop it is a side panel and the dashboard
  // is meant to stay scrollable.
  useBodyScrollLock(open && isMobile);

  // Synchronize mobile viewport metrics so fixed buttons and full-screen sheets
  // never overflow or sit underneath dynamic address bars or on-screen keyboards.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateMetrics = () => {
      const vv = window.visualViewport;
      const vh = window.innerHeight;
      const offset = vv ? Math.max(0, vh - (vv.height + vv.offsetTop)) : 0;
      document.documentElement.style.setProperty('--mobile-bottom-offset', `${offset}px`);
      if (vv) {
        document.documentElement.style.setProperty('--visual-viewport-h', `${vv.height}px`);
      }
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

  return createPortal(
    <ErrorBoundary fallback={({ reset }) => <PanelCrashed reset={reset} />}>
      <AssistantFab />
      <LazyMotion features={domAnimation}>
        <AnimatePresence>{open && <AssistantPanel />}</AnimatePresence>
      </LazyMotion>
    </ErrorBoundary>,
    document.body,
  );
}
