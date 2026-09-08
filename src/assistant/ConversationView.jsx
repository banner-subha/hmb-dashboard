import { useLayoutEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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

/** Time of day, so the greeting is not the same sentence all day. */
function timeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function EmptyState({ onPick }) {
  const { user } = useAuth();
  // First name only. "Good afternoon, Rajesh Kumar Sharma" reads like a form
  // letter; "Good afternoon, Rajesh" reads like a colleague.
  const firstName = String(user?.name || user?.username || '')
    .trim()
    .split(/\s+/)[0];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
      <span
        className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-full text-white"
        style={{ background: 'var(--gradient-accent)' }}
      >
        <Sparkles className="h-5 w-5" />
      </span>

      <h2 className="text-[1.1rem] font-semibold tracking-tight text-text-primary">
        {firstName ? `${timeOfDay()}, ${firstName}` : timeOfDay()}
      </h2>
      <p className="mt-2 max-w-[24rem] text-[0.88rem] leading-relaxed text-text-muted">
        I can look up despatch, order backlog, dealer targets and size-wise rates.
        Ask in plain English — figures come straight from the sales data.
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        {OPENERS.map((opener) => (
          <button
            key={opener.label}
            type="button"
            onClick={() => onPick(opener.prompt)}
            className="rounded-full border border-border bg-bg-card px-3 py-1.5 text-[0.8rem] text-text-secondary transition-colors hover:border-border-accent hover:bg-bg-card-hover hover:text-text-primary"
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
        // h-full here, flex-1 on the greeting inside it: the wrapper has to
        // carry a definite height or the greeting cannot centre against it.
        <div className={`flex h-full flex-col ${wide ? 'mx-auto w-full max-w-[46rem]' : ''}`}>
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
