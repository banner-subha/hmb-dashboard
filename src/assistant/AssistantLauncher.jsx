import { Sparkles } from 'lucide-react';
import { useAssistant } from './AssistantProvider';

/**
 * The dashboard header's trigger.
 *
 * Styled for the header's own dark gradient rather than the page surface, so
 * it sits beside the live-sync chip as a peer. Stays mounted while the panel
 * is open: it is where focus returns on close.
 */
export default function AssistantLauncher() {
  const { open, openPanel, unread } = useAssistant();

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open the sales assistant"
      aria-expanded={open}
      title="Ask the sales assistant (Ctrl+K)"
      className={`relative hidden items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors sm:flex ${
        open
          ? 'border-accent-blue/50 bg-accent-blue/20 text-white'
          : 'border-white/10 bg-white/[0.07] text-white/75 hover:bg-white/[0.12] hover:text-white'
      }`}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      Ask
      {unread && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0D1626] bg-severity-none" />
      )}
    </button>
  );
}
