import { AlertCircle, RotateCcw } from 'lucide-react';
import ErrorBoundary from '../components/common/ErrorBoundary';
import Markdown from './Markdown';
import TurnProvenance from './Provenance';
import ChartBlock from './ChartBlock';
import ResultTable from './ResultTable';

// Two speakers, two treatments. The question is a contained block; the answer
// is full-width prose. The asymmetry is what tells them apart — neither needs
// a name label, an avatar, or a role badge above it.

function UserTurn({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bg-tertiary px-3.5 py-2 text-[0.9rem] leading-relaxed text-text-primary">
        {text}
      </div>
    </div>
  );
}

/** A caret while text is still arriving, so a pause reads as work in progress. */
function Caret() {
  return (
    <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-accent-blue align-baseline" />
  );
}

function AssistantTurn({ message, onRetry, loadResult }) {
  const { text, state, error, stopped } = message;
  // `|| []` rather than a destructuring default: a default only fills in for
  // `undefined`, and these arrive from the server's persisted transcript, where
  // an absent list is null. `null.map` inside a render throws past every guard
  // in this file and takes the whole panel with it.
  const tools = Array.isArray(message.tools) ? message.tools : [];
  const charts = Array.isArray(message.charts) ? message.charts : [];
  const streaming = state === 'streaming';

  // Only a grouped result is worth a table. A single total row is already in
  // the prose, and a dealer-match explanation is provenance, not data.
  const tabular = tools.filter(
    (t) =>
      t.state === 'done' &&
      !t.error &&
      (t.rows || 0) > 1 &&
      t.tool !== 'explain_dealer_match',
  );

  return (
    <div>
      {/* Above the prose: a caution about a figure is worth less once the
          figure has already been read. */}
      <TurnProvenance tools={tools} loadResult={loadResult} />

      {text && (
        <>
          <Markdown text={text} />
          {streaming && <Caret />}
        </>
      )}

      {/* A spec with no source names no cached result, so ChartBlock has
          nothing to fetch and would throw in its loader. The model emits these
          specs, so a malformed one is a normal failure, not an impossible one:
          the chart is dropped and the prose above it still answers. */}
      {charts.filter((spec) => spec?.source).map((spec, i) => (
        <ChartBlock key={`${spec.source}-${spec.y}-${i}`} spec={spec} loadResult={loadResult} />
      ))}

      {tabular.map((t) => (
        <ResultTable
          key={t.id}
          toolCallId={t.id}
          tool={t.tool}
          rowCount={t.rows}
          loadResult={loadResult}
        />
      ))}

      {stopped && (
        <p className="mt-1.5 text-[0.78rem] text-text-dim">Stopped.</p>
      )}

      {state === 'error' && (
        <div className="mt-2 rounded-xl border border-severity-critical/40 bg-severity-critical/[0.07] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-[2px] h-4 w-4 shrink-0 text-severity-critical" />
            <div className="min-w-0 flex-1">
              <p className="text-[0.85rem] font-semibold text-severity-critical">
                That answer did not finish
              </p>
              {error && (
                <p className="mt-0.5 break-words text-[0.82rem] leading-relaxed text-text-secondary">
                  {error}
                </p>
              )}
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[0.8rem] font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessageTurn({ message, onRetry, loadResult }) {
  return (
    <ErrorBoundary
      fallback={({ error }) => (
        <div className="my-2 rounded-xl border border-border bg-bg-card p-3 text-[0.82rem] text-text-muted">
          <p className="font-medium text-text-secondary">Could not render this response</p>
          {error?.message && <p className="mt-1 text-[0.75rem] text-text-dim">{error.message}</p>}
        </div>
      )}
    >
      {message.role === 'user' ? (
        <UserTurn text={message.text} />
      ) : (
        <AssistantTurn message={message} onRetry={onRetry} loadResult={loadResult} />
      )}
    </ErrorBoundary>
  );
}
