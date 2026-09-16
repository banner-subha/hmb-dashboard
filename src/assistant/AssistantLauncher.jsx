import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
  const { user } = useAuth();
  const { open, openPanel, unread } = useAssistant();

  if (user?.role === 'client') return null;

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open the sales assistant"
      aria-expanded={open}
      title="Ask the sales assistant (Ctrl+K)"
      className="relative hidden items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 sm:py-2 text-[13.5px] font-bold text-white border border-white/20 transition-all duration-200 hover:border-white/40 hover:brightness-110 active:scale-[0.98] sm:flex cursor-pointer"
      style={{
        background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 45%, #1D4ED8 100%)',
        boxShadow: open
          ? '0 0 0 3px rgba(78, 143, 247, 0.3), 0 2px 8px rgba(37, 99, 235, 0.4)'
          : '0 2px 8px rgba(37, 99, 235, 0.4)',
      }}
    >
      <Sparkles className="h-5 w-5 shrink-0 text-white" strokeWidth={2.2} />
      <span>Ask</span>
      {unread && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center">
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-[#0D1626] bg-emerald-500" />
        </span>
      )}
    </button>
  );
}
