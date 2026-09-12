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
      // Only opacity and transform transition: `transition-all` also animated
      // `top`, so the button slid across the screen every time the address bar
      // showed or hid itself instead of simply staying put.
      className={`fixed z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-xl transition-[opacity,transform] duration-200 active:scale-95 sm:hidden ${
        open ? 'pointer-events-none opacity-0' : ''
      }`}
      style={{
        background: 'var(--gradient-accent)',
        boxShadow: '0 4px 18px rgba(37, 99, 235, 0.5)',
        right: 'max(1.25rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))',
        // Placed with `top` off the visual viewport rather than `bottom` off
        // the layout one. `bottom` measures from the foot of a viewport that
        // extends behind the gesture bar, which is how the button ended up
        // half off-screen on tall Android phones; this puts its lower edge a
        // fixed gap above whatever is actually visible. The 1.5rem floor keeps
        // it clear of a gesture bar even where the browser reports no safe-area
        // inset at all, and 100dvh covers the first paint before JS measures.
        top: 'calc(var(--visual-viewport-top, 0px) + var(--visual-viewport-h, 100dvh) - 3rem - max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem)))',
      }}
    >
      <MessageSquare className="h-5 w-5" />
      {unread && (
        <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-bg-primary bg-severity-none" />
      )}
    </button>
  );
}
