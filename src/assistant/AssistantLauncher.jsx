import { Sparkles } from 'lucide-react';
import { useAssistant } from './AssistantProvider';

/**
 * The dashboard header's trigger.
 *
 * Deliberately the loudest thing in the header: accent blue with the AI mark,
 * where the live-sync chip beside it is a muted outline. Someone opening the
 * dashboard for the first time should be able to find the assistant without
 * being shown where it is.
 *
 * Stays mounted while the panel is open — it is where focus returns on close.
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
      className="relative hidden items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/25 transition-all hover:brightness-110 sm:flex"
      style={{
        background: 'var(--gradient-accent)',
        boxShadow: open
          ? '0 0 0 3px rgba(78, 143, 247, 0.28)'
          : '0 1px 8px rgba(37, 99, 235, 0.45)',
      }}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      Ask
      {unread && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0D1626] bg-severity-none" />
      )}
    </button>
  );
}
