import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

// The input. One row of controls and nothing else.
//
// The old chat carried a caption strip under this box — "Enter to send ·
// Shift+Enter for a new line" on the left, "Figures come from SQL, not the
// model" on the right. Both are gone. The first is a keyboard convention
// nobody needs told twice, and the second is a disclaimer about the
// architecture, which is not the salesperson's problem.

const MAX_ROWS = 8;

export default function Composer({ ref, onSend, onStop, streaming }) {
  const [value, setValue] = useState('');
  const areaRef = useRef(null);

  // The panel focuses the composer on open and after sending.
  useImperativeHandle(ref, () => ({
    focus: (opts) => areaRef.current?.focus(opts),
  }));

  const resize = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
    const padding = 20;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_ROWS + padding)}px`;
  }, []);

  useEffect(resize, [value, resize]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue('');
    onSend(text);
    areaRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter makes a newline. isComposing keeps an IME's
    // own Enter — the one that commits a candidate — from sending the message.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="shrink-0 border-t border-border px-3 pt-2.5 sm:px-4"
      style={{
        paddingBottom: 'max(0.85rem, calc(env(safe-area-inset-bottom, 0px) + 0.65rem))',
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-bg-input px-3 py-2 transition-colors focus-within:border-border-accent">
        <textarea
          ref={areaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about despatch, backlog, targets or rates"
          aria-label="Ask the sales assistant"
          title="Enter to send, Shift+Enter for a new line"
          className="max-h-[13rem] flex-1 resize-none border-0 bg-transparent py-1.5 text-base leading-[1.45] text-text-primary outline-none placeholder:text-text-dim sm:text-[0.9rem]"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border text-text-muted transition-colors hover:border-border-accent hover:text-text-primary active:scale-95"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Send"
            title="Send"
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-30"
            style={{ background: 'var(--gradient-accent)' }}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
