import { useLayoutEffect, useRef } from 'react';
import MessageTurn from './MessageTurn';
import ThinkingIndicator from './ThinkingIndicator';

// The scrolling body of the panel: the empty state, the turns, and the caption
// for work in progress. It owns its own scroll container, and stays pinned to
// the bottom only while the reader is already there.

// Four openers, each hitting a different table, so the first question a new
// user asks actually lands. Short labels — the full question is what gets
// sent, not what gets shown.
const OPENERS = [
  { label: 'Top states this month', prompt: 'Top 5 states by despatch tonnage this month' },
  { label: 'Backlog over 30 days', prompt: 'How much order backlog is more than 30 days old?' },
  { label: 'Dealers behind target', prompt: 'Which dealers are furthest behind their target?' },
  { label: '10mm vs 12mm', prompt: '10mm vs 12mm volume this month' },
];

function EmptyState({ onPick }) {
  return (
    <div className="flex min-h-full flex-col justify-end pb-1">
      <p className="text-[0.95rem] leading-relaxed text-text-secondary">
        Ask me about despatch, backlog, targets or rates.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {OPENERS.map((opener) => (
          <button
            key={opener.label}
            type="button"
            onClick={() => onPick(opener.prompt)}
            className="rounded-full border border-border bg-bg-card px-2.5 py-1 text-[0.8rem] text-text-muted transition-colors hover:border-border-accent hover:bg-bg-card-hover hover:text-text-primary"
          >
            {opener.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ConversationView({
  messages,
  phases,
  loadingHistory,
  loadError,
  onSend,
  onRetry,
  loadResult,
  wide = false,
}) {
  const scrollRef = useRef(null);
  // Pinned until the reader scrolls up. Yanking someone back to the bottom
  // while they are reading an earlier figure is the worst thing a streaming
  // transcript can do.
  const pinned = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, phases]);

  const empty = !messages.length && !loadingHistory && !loadError;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
    >
      {empty ? (
        <div className={wide ? 'mx-auto w-full max-w-[46rem]' : undefined}>
          <EmptyState onPick={onSend} />
        </div>
      ) : (
        <div className={`space-y-4 ${wide ? 'mx-auto w-full max-w-[46rem]' : ''}`}>
          {loadingHistory && (
            <p className="text-[0.85rem] text-text-muted">Loading conversation…</p>
          )}
          {loadError && (
            <p className="text-[0.85rem] leading-relaxed text-severity-critical">
              Could not load this conversation: {loadError}
            </p>
          )}
          {messages.map((message) => (
            <MessageTurn
              key={message.id}
              message={message}
              onRetry={onRetry}
              loadResult={loadResult}
            />
          ))}
          <ThinkingIndicator phases={phases} />
        </div>
      )}
    </div>
  );
}
