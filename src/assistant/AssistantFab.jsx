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
      className={`fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 sm:hidden ${
        open ? 'pointer-events-none opacity-0' : ''
      }`}
      style={{ background: 'var(--gradient-accent)' }}
    >
      <MessageSquare className="h-5 w-5" />
      {unread && (
        <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-bg-primary bg-severity-none" />
      )}
    </button>
  );
}
