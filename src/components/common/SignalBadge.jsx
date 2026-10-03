import { ChevronRight, PanelRightOpen } from 'lucide-react';
import { SIGNALS } from '../../utils/account360';

const Dot = ({ color }) => (
  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
);

const countText = n => `${n} dealer${n === 1 ? '' : 's'}`;

/** One Signal as a tinted tag, for the account view's dealer list. */
export default function SignalBadge({ signal }) {
  if (!signal) return <span className="text-xs text-text-muted">No flag</span>;
  return (
    <span
      title={signal.reason || signal.action}
      className={`badge-theme-${signal.tone} inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap`}
    >
      <Dot color={signal.color} />
      {signal.label}
    </span>
  );
}

/**
 * The Attention cell in the State, District and Dealer tables. The whole cell
 * opens the account view; it stops the click so the row's own selection does
 * not fire as well.
 */
export function AttentionCell({ signal, loading, onOpen }) {
  if (loading) return <span className="text-xs text-text-muted">Linking data</span>;
  const label = signal ? signal.label : 'No flag';
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpen(); }}
      title={signal ? (signal.count != null ? `${countText(signal.count)}: ${signal.action}` : signal.reason) : 'Open account view'}
      aria-label={`${label}. Open account view`}
      className="group/att w-full flex items-center justify-between gap-2 min-h-[44px] sm:min-h-[36px] -my-1 px-2 rounded-lg text-left hover:bg-bg-secondary cursor-pointer"
    >
      <span className="min-w-0 flex items-center gap-2">
        {signal
          ? <Dot color={signal.color} />
          : <span className="w-2 h-2 rounded-full shrink-0 border border-text-muted" aria-hidden="true" />}
        <span className="min-w-0">
          <span className={`block text-[13px] font-semibold leading-tight whitespace-nowrap ${signal ? 'text-text-primary' : 'text-text-muted'}`}>{label}</span>
          {signal?.count != null && <span className="block text-[11px] text-text-muted leading-tight">{countText(signal.count)}</span>}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-text-muted group-hover/att:text-accent-blue" aria-hidden="true" />
    </button>
  );
}

/** The Attention filter, styled and placed like the page's other filter selects. */
export function AttentionSelect({ value, onChange, counts, disabled = false, className = '' }) {
  return (
    <select
      aria-label="Filter by attention"
      className={`filter-select ${className}`}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
    >
      <option value="ALL">{disabled ? 'Attention: linking' : 'All attention'}</option>
      {SIGNALS.filter(s => counts[s.key] > 0 || s.key === value).map(s => (
        <option key={s.key} value={s.key}>{s.label} ({counts[s.key] || 0})</option>
      ))}
    </select>
  );
}

/**
 * One line for a side panel: the selected place's most urgent Signal and the
 * button that opens its account view. Kept short so the panel holds its height
 * and the page its balance.
 */
export function AttentionSummary({ signal, loading, onOpen, className = '' }) {
  return (
    <div className={`flex flex-col items-start gap-2.5 p-3 rounded-xl bg-bg-secondary border border-border ${className}`}>
      <div className="min-w-0 w-full">
        {loading ? (
          <span className="text-xs text-text-muted">Linking pending, receivables, plan and visits</span>
        ) : signal ? (
          <>
            <span className="flex flex-wrap items-center gap-x-2 text-[13px] font-bold text-text-primary">
              <Dot color={signal.color} />{signal.label}
              {signal.count != null && <span className="font-medium text-text-muted">{countText(signal.count)}</span>}
            </span>
            <span className="block mt-0.5 text-[11.5px] text-text-muted leading-snug line-clamp-2">{signal.reason || signal.action}</span>
          </>
        ) : (
          <span className="text-[13px] text-text-muted">Nothing in the linked data needs attention.</span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={loading}
        className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-accent-blue text-white text-[12.5px] font-bold hover:brightness-110 disabled:opacity-50 cursor-pointer"
      >
        <PanelRightOpen className="w-4 h-4" aria-hidden="true" />
        Account view
      </button>
    </div>
  );
}
