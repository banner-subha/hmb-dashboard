import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Check, Copy, Pencil, RotateCcw } from 'lucide-react';
import ErrorBoundary from '../components/common/ErrorBoundary';
import Markdown from './Markdown';
import TurnProvenance from './Provenance';
import ChartBlock from './ChartBlock';
import ResultTable from './ResultTable';

/** Robust copy helper with modern Clipboard API and execCommand fallback */
export async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback to execCommand below */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/** User message bubble with inline editing and copy/retry options beside the prompt */
function UserTurn({
  message,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onEditMessage,
  onRetry,
  streaming,
}) {
  const [editText, setEditText] = useState(message.text || '');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    setEditText(message.text || '');
  }, [message.text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(message.text || '');
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.text) {
      onCancelEdit?.();
      return;
    }
    onEditMessage?.(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit?.();
    }
  };

  if (isEditing) {
    return (
      <div className="flex w-full justify-end">
        <div className="w-full max-w-[90%] sm:max-w-[85%] rounded-2xl border border-accent-blue/40 bg-bg-secondary p-3 shadow-lg">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={Math.min(6, Math.max(2, (editText.match(/\n/g) || []).length + 1))}
            className="w-full resize-none bg-transparent text-[0.9rem] leading-relaxed text-text-primary focus:outline-none placeholder:text-text-dim"
            placeholder="Edit your message…"
          />
          <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-border/40 pt-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-medium text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!editText.trim() || editText.trim() === message.text}
              className="rounded-lg bg-accent-blue px-3.5 py-1.5 text-[0.8rem] font-medium text-white transition-all hover:bg-accent-blue/90 disabled:opacity-40 disabled:pointer-events-none active:scale-95 shadow-sm"
            >
              Save & Submit
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-end gap-1.5 sm:gap-2">
      {/* Options directly beside the prompt: Retry, Edit, Copy */}
      <div className="flex items-center gap-0.5 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={streaming}
            title="Retry prompt"
            aria-label="Retry prompt"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-dim hover:bg-bg-card-hover hover:text-text-primary active:scale-95 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onStartEdit}
          disabled={streaming}
          title="Edit prompt"
          aria-label="Edit prompt"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-dim hover:bg-bg-card-hover hover:text-text-primary active:scale-95 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy prompt"
          aria-label="Copy prompt"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-dim hover:bg-bg-card-hover hover:text-text-primary active:scale-95 transition-colors"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* User message bubble */}
      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bg-tertiary px-3.5 py-2 text-[0.9rem] leading-relaxed text-text-primary border border-border/20 shadow-xs">
        {message.text}
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

function AssistantTurn({
  message,
  onRetry,
  onEditQuery,
  loadResult,
  streaming,
}) {
  const { text, state, error, stopped } = message;
  const [copied, setCopied] = useState(false);

  // Default to empty array for persisted transcript compatibility
  const tools = Array.isArray(message.tools) ? message.tools : [];
  const charts = Array.isArray(message.charts) ? message.charts : [];
  const isTurnStreaming = state === 'streaming';

  // Only a grouped result is worth a table. A single total row is already in
  // the prose, and a dealer-match explanation is provenance, not data.
  const tabular = tools.filter(
    (t) =>
      t.state === 'done' &&
      !t.error &&
      (t.rows || 0) > 1 &&
      t.tool !== 'explain_dealer_match',
  );

  const handleCopyContext = async () => {
    const content = (text || '').trim();
    if (!content) return;
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      {/* Above the prose: provenance warnings */}
      <TurnProvenance tools={tools} loadResult={loadResult} />

      {text && (
        <>
          <Markdown text={text} />
          {isTurnStreaming && <Caret />}
        </>
      )}

      {/* Render chart specs */}
      {charts.filter((spec) => spec?.source).map((spec, i) => (
        <ChartBlock key={`${spec.source}-${spec.y}-${i}`} spec={spec} loadResult={loadResult} />
      ))}

      {/* Render tabular results */}
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

      {/* Error state card */}
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
                  disabled={streaming}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[0.8rem] font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary active:scale-95 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Bar at the very bottom: Copy Entire Context */}
      {!isTurnStreaming && state !== 'error' && (text || charts.length > 0 || tabular.length > 0) && (
        <div className="mt-3.5 flex items-center gap-1 border-t border-border/30 pt-2 text-text-muted">
          <button
            type="button"
            onClick={handleCopyContext}
            title="Copy entire response and context"
            aria-label="Copy entire response"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[0.78rem] font-medium text-text-secondary transition-all hover:bg-bg-card-hover hover:text-text-primary active:scale-95"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MessageTurn({
  message,
  onRetry,
  onEditQuery,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onEditMessage,
  loadResult,
  streaming = false,
}) {
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
        <UserTurn
          message={message}
          isEditing={isEditing}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onEditMessage={onEditMessage}
          onRetry={onRetry}
          streaming={streaming}
        />
      ) : (
        <AssistantTurn
          message={message}
          onRetry={onRetry}
          loadResult={loadResult}
          streaming={streaming}
        />
      )}
    </ErrorBoundary>
  );
}
