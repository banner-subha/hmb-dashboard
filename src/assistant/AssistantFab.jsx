import { MessageSquare } from 'lucide-react';
import { useAssistant } from './AssistantProvider';

/**
 * The mobile trigger.
 *
 * Mobile only: on desktop the header carries the button, and a floating one
 * would sit on top of the dashboard's own content for no reason. Hidden with
 * CSS rather than unmounted, so that closing the panel has somewhere to return
 * focus to.
 */
export default function AssistantFab() {
  const { open, openPanel, unread } = useAssistant();

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open the sales assistant"
      aria-expanded={open}
      className={`fixed z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-xl transition-all duration-200 active:scale-95 sm:hidden ${
        open ? 'pointer-events-none opacity-0' : ''
      }`}
      style={{
        background: 'var(--gradient-accent)',
        boxShadow: '0 4px 18px rgba(37, 99, 235, 0.5)',
        right: 'max(1.25rem, env(safe-area-inset-right, 0px))',
        bottom:
          'calc(var(--mobile-bottom-offset, calc(100vh - 100dvh)) + max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.85rem)))',
      }}
    >
      <MessageSquare className="h-5 w-5" />
      {unread && (
        <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-bg-primary bg-severity-none" />
      )}
    </button>
  );
}
