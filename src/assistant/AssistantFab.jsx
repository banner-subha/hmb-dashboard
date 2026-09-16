import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
  const { user } = useAuth();
  const { open, openPanel, unread } = useAssistant();

  if (user?.role === 'client') return null;

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open the sales assistant"
      aria-expanded={open}
      // Only opacity and transform transition: `transition-all` also animated
      // `top`, so the button slid across the screen every time the address bar
      // showed or hid itself instead of simply staying put.
      className={`fixed z-50 flex h-13 w-13 items-center justify-center rounded-full text-white shadow-lg transition-[opacity,transform] duration-200 active:scale-95 sm:hidden cursor-pointer ${
        open ? 'pointer-events-none opacity-0' : ''
      }`}
      style={{
        background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 45%, #1D4ED8 100%)',
        boxShadow: '0 4px 14px rgba(37, 99, 235, 0.45)',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        right: 'max(1.25rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))',
        top: 'calc(var(--visual-viewport-top, 0px) + var(--visual-viewport-h, 100dvh) - 3.25rem - max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem)))',
      }}
    >
      <Sparkles className="h-6 w-6 text-white shrink-0" strokeWidth={2.2} />
      {unread && (
        <span className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center">
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-bg-primary bg-emerald-500" />
        </span>
      )}
    </button>
  );
}
