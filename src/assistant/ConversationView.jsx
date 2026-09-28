import { useLayoutEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  ArrowLeftRight,
  BadgeAlert,
  Boxes,
  CalendarClock,
  ClipboardList,
  ClockAlert,
  Footprints,
  HardHat,
  Handshake,
  IndianRupee,
  Ruler,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MessageTurn from './MessageTurn';
import ThinkingIndicator from './ThinkingIndicator';

// The scrolling body of the panel: the empty state, the turns, and the caption
// for work in progress. It owns its own scroll container, and stays pinned to
// the bottom only while the reader is already there.

/**
 * The openers, grouped the way the working day is: what you check every
 * morning, where the month stands against the plan, and what the field force
 * has been doing.
 *
 * Two rules govern the wording, and both are about the prompt rather than the
 * label. First, every prompt has to land on a real table — each one here was
 * checked against the agent's tool registry, and the query behind it against
 * the database, so no chip can send someone into an apology. Second, the
 * phrasing is chosen to match the agent's deterministic fast path where one
 * exists: a recognised phrase skips a round of remote LLM deliberation and
 * answers in about a second instead of ten. That is why these read as full,
 * slightly formal questions — "Compare the August 2026 business plan against
 * actual despatch by state" is recognised, while a chattier version of the
 * same question is not.
 *
 * One phrasing is deliberately avoided: asking for the business plan broken
 * down "by product" currently routes to an invalid grouping and errors. The
 * plan chip asks for the headline instead, and the product split is a
 * follow-up the agent handles correctly once it is in a conversation.
 *
 * Labels stay short — the full question is what gets sent, not what is shown.
 */
const OPENER_GROUPS = [
  {
    heading: 'Daily check',
    tint: '#3b82f6',
    openers: [
      {
        icon: TrendingUp,
        label: 'Top states',
        hint: 'Sales this month',
        prompt: 'Top 5 states by despatch tonnage this month',
      },
      {
        icon: CalendarClock,
        label: 'Sales this year',
        hint: 'Year-to-date total',
        prompt: 'What is the YTD despatch so far this year?',
      },
      {
        icon: Boxes,
        label: 'Pending orders',
        hint: 'Total open orders',
        prompt: 'What is the total order backlog right now?',
      },
      {
        icon: AlarmClock,
        label: 'Delayed orders',
        hint: 'Pending over 30 days',
        prompt: 'How much order backlog is more than 30 days old?',
      },
      {
        icon: Target,
        label: 'Behind target',
        hint: 'Dealers needing focus',
        prompt: 'Which dealers are furthest behind their target?',
      },
      {
        icon: Ruler,
        label: '10mm vs 12mm',
        hint: 'Size comparison',
        prompt: '10mm vs 12mm volume this month',
      },
    ],
  },
  {
    heading: 'Outstanding',
    tint: '#f97316',
    openers: [
      {
        icon: IndianRupee,
        label: 'Total outstanding',
        hint: 'Pending balance',
        prompt: 'What is our total outstanding balance?',
      },
      {
        icon: BadgeAlert,
        label: 'Highest dues',
        hint: 'Top dealer balances',
        prompt: 'Who are the top 10 dealers with highest outstanding?',
      },
      {
        icon: ClockAlert,
        label: 'Overdue payments',
        hint: 'Past due accounts',
        prompt: 'Top overdue accounts and ageing breakdown',
      },
    ],
  },
  {
    heading: 'Business plan',
    tint: '#eab308',
    openers: [
      {
        icon: ArrowLeftRight,
        label: 'Target vs actual',
        hint: 'Target vs sales achieved',
        prompt: 'Compare the August 2026 business plan against actual despatch by state',
      },
      {
        icon: Trophy,
        label: 'Top dealer targets',
        hint: 'Highest sales targets',
        prompt: 'Top 10 dealers by sales person target in the August 2026 business plan',
      },
      {
        icon: ClipboardList,
        label: 'Plan summary',
        hint: 'Target & potential',
        prompt: 'What is our August 2026 business plan target and market potential?',
      },
    ],
  },
  {
    heading: 'Field visits',
    tint: '#22c55e',
    openers: [
      {
        icon: Footprints,
        label: 'Team visits',
        hint: 'Visits by sales rep',
        prompt: 'How many visits did each sales rep make this month?',
      },
      {
        icon: Handshake,
        label: 'Visits vs sales',
        hint: 'Visited with low orders',
        prompt: 'Which dealers are visited most but buying least?',
      },
      {
        icon: HardHat,
        label: 'Fabricator visits',
        hint: 'District coverage',
        prompt: 'Fabricator visit coverage by district this month',
      },
    ],
  },
];

/** Time of day, so the greeting is not the same sentence all day. */
function timeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * One opener, as a tile rather than a pill.
 *
 * The label carries the subject and the hint carries the qualifier, which is
 * what lets the labels stay short enough to sit in an even grid — a single
 * pill reading "Backlog over 30 days" is what forced the old row to wrap
 * raggedly. The tinted glyph is the group's colour, so the three sections stay
 * distinguishable once you have scrolled past their headings.
 */
function OpenerTile({ opener, tint, onPick }) {
  const Icon = opener.icon;

  return (
    <button
      type="button"
      onClick={() => onPick(opener.prompt)}
      title={opener.prompt}
      className="group flex items-center gap-2.5 rounded-xl border border-border bg-bg-card px-2.5 py-2 text-left transition-colors hover:border-border-accent hover:bg-bg-card-hover"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${tint}1f`, color: tint }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-[0.8rem] font-semibold leading-tight text-text-secondary transition-colors group-hover:text-text-primary">
          {opener.label}
        </span>
        <span className="block truncate text-[0.7rem] leading-tight text-text-muted">
          {opener.hint}
        </span>
      </span>
    </button>
  );
}

function EmptyState({ onPick }) {
  const { user } = useAuth();
  // First name only. "Good afternoon, Rajesh Kumar Sharma" reads like a form
  // letter; "Good afternoon, Rajesh" reads like a colleague.
  const firstName = String(user?.name || user?.username || '')
    .trim()
    .split(/\s+/)[0];

  return (
    // `safe center` rather than plain centring. The openers make this block
    // tall enough to outgrow a short panel, and a centred flex child that
    // overflows pushes its own top edge above the scroll origin, where no
    // amount of scrolling can reach it — the greeting would simply be gone.
    // `safe` drops back to start-alignment exactly when that would happen.
    <div
      className="flex flex-1 flex-col items-center px-2 py-2 text-center"
      style={{ justifyContent: 'safe center' }}
    >
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
        How can I help you today? Ask me anything about sales, pending orders, dealer dues, or targets.
      </p>

      <div className="mt-6 w-full max-w-[34rem] space-y-4 text-left">
        {OPENER_GROUPS.map((group) => (
          <div key={group.heading}>
            {/* Heading as a rule rather than a floating centred caption: the
                line gives each group an edge to sit against, so the sections
                read as blocks instead of three unrelated clusters. */}
            <div className="mb-2 flex items-center gap-2.5">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-text-muted/70">
                {group.heading}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            {/* auto-fit rather than a fixed column count: the panel is
                user-resizable and this same view also renders full-page, so
                the grid settles on one, two or three columns by itself and
                every tile in a row stays the same width either way. */}
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr))' }}
            >
              {group.openers.map((opener) => (
                <OpenerTile
                  key={opener.label}
                  opener={opener}
                  tint={group.tint}
                  onPick={onPick}
                />
              ))}
            </div>
          </div>
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
  onEditMessage,
  loadResult,
  streaming = false,
  wide = false,
}) {
  const [editingId, setEditingId] = useState(null);
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
          {messages.map((message, index) => {
            const prevUserMessage =
              message.role === 'assistant'
                ? messages
                    .slice(0, index)
                    .reverse()
                    .find((m) => m.role === 'user')
                : null;

            return (
              <MessageTurn
                key={message.id}
                message={message}
                onRetry={
                  onRetry
                    ? () => onRetry(prevUserMessage?.text, message.id)
                    : undefined
                }
                onEditQuery={
                  prevUserMessage && onEditMessage
                    ? () => setEditingId(prevUserMessage.id)
                    : undefined
                }
                isEditing={editingId === message.id}
                onStartEdit={() => setEditingId(message.id)}
                onCancelEdit={() => setEditingId(null)}
                onEditMessage={(newText) => {
                  setEditingId(null);
                  onEditMessage?.(message.id, newText);
                }}
                loadResult={loadResult}
                streaming={streaming}
              />
            );
          })}
          <ThinkingIndicator phases={phases} />
        </div>
      )}
    </div>
  );
}
