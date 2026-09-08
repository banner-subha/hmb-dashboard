import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { pushLayer } from './escapeStack';

// Past conversations: filter, find, open, rename, delete.
//
// A view switch inside the panel rather than a second drawer — 420px is not
// wide enough for two columns, and a drawer inside a drawer is a maze.

const DAY = 86400000;
const RANGE_KEY = 'hmb_assistant_range';

const RANGES = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: 'all', label: 'All', days: Infinity },
];

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/** Whole days between today and a session's last activity. */
function ageInDays(session, today) {
  const at = startOfDay(new Date(session.updated_at));
  return Math.round((today - at) / DAY);
}

function readRange() {
  try {
    const stored = localStorage.getItem(RANGE_KEY);
    return RANGES.some((r) => r.key === stored) ? stored : '30';
  } catch {
    return '30';
  }
}

const BUCKETS = [
  { key: 'today', label: 'Today', test: (age) => age <= 0 },
  { key: 'yesterday', label: 'Yesterday', test: (age) => age === 1 },
  { key: 'week', label: 'Previous 7 days', test: (age) => age > 1 && age <= 7 },
  { key: 'month', label: 'Previous 30 days', test: (age) => age > 7 && age <= 30 },
  { key: 'older', label: 'Older', test: (age) => age > 30 },
];

function Row({ session, active, onOpen, onRename, onDelete }) {
  const [mode, setMode] = useState(null); // 'rename' | 'confirm'
  const [draft, setDraft] = useState(session.title || '');
  const inputRef = useRef(null);

  const startRename = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDraft(session.title || '');
    setMode('rename');
  };

  const commit = () => {
    const next = draft.trim();
    setMode(null);
    if (next && next !== session.title) onRename(session.session_id, next);
  };

  if (mode === 'rename') {
    return (
      <li>
        <div className="flex items-center gap-1 rounded-lg bg-bg-card-hover px-2 py-1.5">
          <input
            ref={(el) => {
              // Selected on mount, so typing replaces rather than appends.
              if (el && document.activeElement !== el) el.select();
              inputRef.current = el;
            }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setMode(null);
            }}
            aria-label="Rename conversation"
            className="min-w-0 flex-1 border-0 bg-transparent text-[0.85rem] text-text-primary outline-none"
          />
          <button
            type="button"
            onClick={commit}
            aria-label="Save name"
            className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode(null)}
            aria-label="Cancel rename"
            className="shrink-0 rounded p-1 text-text-muted hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  }

  if (mode === 'confirm') {
    return (
      <li>
        <div className="rounded-lg border border-severity-critical/40 bg-severity-critical/[0.08] px-2.5 py-2">
          <p className="text-[0.8rem] leading-snug text-text-primary">
            Delete this conversation?
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => onDelete(session.session_id)}
              className="rounded-md bg-severity-critical px-2 py-[3px] text-[0.75rem] font-semibold text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="rounded-md px-2 py-[3px] text-[0.75rem] text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(session.session_id)}
        title={session.title || 'Untitled'}
        className={`flex w-full items-center rounded-lg py-[7px] pl-2.5 pr-14 text-left text-[0.85rem] transition-colors ${
          active
            ? 'bg-accent-blue/[0.14] font-medium text-text-primary'
            : 'text-text-muted hover:bg-bg-card-hover hover:text-text-primary'
        }`}
      >
        <span className="truncate">{session.title || 'Untitled'}</span>
      </button>
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={startRename}
          aria-label="Rename conversation"
          title="Rename"
          className="rounded p-1 text-text-muted hover:bg-bg-card-hover hover:text-text-primary"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMode('confirm');
          }}
          aria-label="Delete conversation"
          title="Delete"
          className="rounded p-1 text-text-muted hover:bg-bg-card-hover hover:text-severity-critical"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export default function HistoryPane({
  sessions,
  loading,
  activeId,
  onOpen,
  onRename,
  onDelete,
  onDeleteMany,
}) {
  const [range, setRange] = useState(readRange);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [pending, setPending] = useState(null); // { kind, ids, label }
  const [progress, setProgress] = useState(null); // { done, total }
  const [outcome, setOutcome] = useState(null); // { deleted, failed }

  const today = startOfDay(new Date());

  // A menu that only closes via its own button is a trap.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // Escape dismisses the menu, then a pending confirmation, then — only once
  // both are gone — the panel itself.
  useEffect(() => (menuOpen ? pushLayer(() => setMenuOpen(false)) : undefined), [menuOpen]);
  useEffect(() => (pending ? pushLayer(() => setPending(null)) : undefined), [pending]);

  const chooseRange = (key) => {
    setRange(key);
    try {
      localStorage.setItem(RANGE_KEY, key);
    } catch {
      /* ignore */
    }
  };

  // Bulk counts are computed over every conversation, not the filtered view:
  // "older than 30 days" has to mean the same thing while the list is showing
  // the last 7.
  const counts = useMemo(() => {
    const lastWeek = sessions.filter((s) => ageInDays(s, today) <= 7);
    const beyondMonth = sessions.filter((s) => ageInDays(s, today) > 30);
    return { lastWeek, beyondMonth };
  }, [sessions, today]);

  const groups = useMemo(() => {
    const limit = RANGES.find((r) => r.key === range)?.days ?? 30;
    const needle = query.trim().toLowerCase();

    const inScope = sessions.filter((s) => {
      if (ageInDays(s, today) > limit) return false;
      if (!needle) return true;
      return (s.title || 'Untitled').toLowerCase().includes(needle);
    });

    return BUCKETS.map((bucket) => ({
      ...bucket,
      items: inScope.filter((s) => bucket.test(ageInDays(s, today))),
    })).filter((b) => b.items.length);
  }, [sessions, range, query, today]);

  const askBulk = (kind) => {
    setMenuOpen(false);
    setOutcome(null);
    if (kind === 'week') {
      setPending({
        kind,
        ids: counts.lastWeek.map((s) => s.session_id),
        label: `Delete ${counts.lastWeek.length} conversation${
          counts.lastWeek.length === 1 ? '' : 's'
        } from the last 7 days?`,
      });
    } else {
      setPending({
        kind,
        ids: counts.beyondMonth.map((s) => s.session_id),
        label: `Delete ${counts.beyondMonth.length} conversation${
          counts.beyondMonth.length === 1 ? '' : 's'
        } older than 30 days?`,
      });
    }
  };

  const runBulk = async () => {
    const ids = pending.ids;
    setPending(null);
    setProgress({ done: 0, total: ids.length });
    try {
      const result = await onDeleteMany(ids, (done, total) => setProgress({ done, total }));
      setOutcome(result);
    } catch (err) {
      setOutcome({ deleted: [], failed: ids.map((id) => ({ id, message: err.message })) });
    } finally {
      setProgress(null);
    }
  };

  const totalInRange = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* toolbar */}
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Date range"
            className="flex flex-1 rounded-lg border border-border p-0.5"
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => chooseRange(r.key)}
                aria-pressed={range === r.key}
                className={`flex-1 rounded-md px-2 py-1 text-[0.78rem] font-medium transition-colors ${
                  range === r.key
                    ? 'bg-bg-card-hover text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Bulk actions"
              title="Bulk actions"
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-bg-elevated py-1 shadow-xl">
                <button
                  type="button"
                  disabled={!counts.lastWeek.length}
                  onClick={() => askBulk('week')}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[0.82rem] text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Delete last 7 days
                  <span className="tabular-nums text-text-dim">{counts.lastWeek.length}</span>
                </button>
                <button
                  type="button"
                  disabled={!counts.beyondMonth.length}
                  onClick={() => askBulk('month')}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[0.82rem] text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Delete older than 30 days
                  <span className="tabular-nums text-text-dim">{counts.beyondMonth.length}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="w-full rounded-lg border border-border bg-bg-input py-1.5 pl-8 pr-2 text-[0.82rem] text-text-primary outline-none transition-colors focus:border-border-accent placeholder:text-text-dim"
          />
        </div>
      </div>

      {/* a bulk action, mid-flight or awaiting confirmation */}
      {pending && (
        <div className="shrink-0 border-b border-severity-critical/30 bg-severity-critical/[0.07] px-3 py-2.5 sm:px-4">
          <p className="text-[0.82rem] leading-snug text-text-primary">{pending.label}</p>
          <p className="mt-0.5 text-[0.76rem] text-text-muted">This cannot be undone.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={runBulk}
              disabled={!pending.ids.length}
              className="rounded-md bg-severity-critical px-2.5 py-1 text-[0.78rem] font-semibold text-white disabled:opacity-40"
            >
              Delete {pending.ids.length}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-md px-2.5 py-1 text-[0.78rem] text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {progress && (
        <p
          className="shrink-0 border-b border-border px-3 py-2 text-[0.8rem] text-text-muted sm:px-4"
          aria-live="polite"
        >
          Deleting {progress.done} of {progress.total}…
        </p>
      )}

      {outcome && (
        <div className="shrink-0 border-b border-border px-3 py-2 sm:px-4">
          <p className="text-[0.8rem] leading-relaxed text-text-secondary">
            {outcome.failed.length === 0
              ? `${outcome.deleted.length} deleted.`
              : `${outcome.deleted.length} deleted, ${outcome.failed.length} could not be deleted.`}
          </p>
          {outcome.failed.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const ids = outcome.failed.map((f) => f.id);
                setOutcome(null);
                setPending({
                  kind: 'retry',
                  ids,
                  label: `Retry deleting ${ids.length} conversation${
                    ids.length === 1 ? '' : 's'
                  }?`,
                });
              }}
              className="mt-1 text-[0.78rem] font-medium text-accent-blue hover:underline"
            >
              Try those again
            </button>
          )}
        </div>
      )}

      {/* the list */}
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {loading && !sessions.length && (
          <p className="px-2 py-3 text-[0.82rem] text-text-muted">Loading…</p>
        )}

        {!loading && !sessions.length && (
          <p className="px-2 py-3 text-[0.82rem] leading-relaxed text-text-muted">
            No conversations yet. Ask something to start one.
          </p>
        )}

        {!!sessions.length && !totalInRange && (
          <div className="px-2 py-3">
            <p className="text-[0.82rem] leading-relaxed text-text-muted">
              {query.trim()
                ? `Nothing matching “${query.trim()}” in this range.`
                : `No conversations in the ${
                    range === '7' ? 'last 7 days' : 'last 30 days'
                  }.`}
            </p>
            {query.trim() ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-1 text-[0.8rem] font-medium text-accent-blue hover:underline"
              >
                Clear search
              </button>
            ) : (
              range !== 'all' && (
                <button
                  type="button"
                  onClick={() => chooseRange('all')}
                  className="mt-1 text-[0.8rem] font-medium text-accent-blue hover:underline"
                >
                  Show all conversations
                </button>
              )
            )}
          </div>
        )}

        {groups.map((group) => (
          <div key={group.key} className="mb-1">
            <h3 className="px-2 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-text-dim">
              {group.label}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map((s) => (
                <Row
                  key={s.session_id}
                  session={s}
                  active={s.session_id === activeId}
                  onOpen={onOpen}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
