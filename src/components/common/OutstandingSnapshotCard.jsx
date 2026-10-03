import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import CollapsibleCard from './CollapsibleCard';
import SkeletonLoader from './SkeletonLoader';
import { formatDate, formatINR, formatINRFull } from '../../utils/outstanding';

// The list scrolls inside the card, so a tall slot shows more dealers and a
// short one shows fewer, without the card changing the column height.
const TOP_DEALERS = 10;
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Outstanding at a glance for the Executive Overview: unpaid bills by age and
 * the dealers with the most overdue. Takes the same book and summary the KPI
 * tile reads (ExecutiveOverview holds one useOutstandingData), so the two can
 * never disagree. `className` lets the page stretch it to fill its slot.
 */
function OutstandingSnapshotCard({ book, summary, loading, error, className = '' }) {
  const navigate = useNavigate();
  const openOutstanding = () => navigate('/outstanding');
  const openDealer = (row) => navigate(`/outstanding?dealer=${encodeURIComponent(row.key)}`);

  const topOverdue = useMemo(
    () => [...(book || [])]
      .filter(r => (r.overdue_amount || 0) > 0)
      .sort((a, b) => b.overdue_amount - a.overdue_amount)
      .slice(0, TOP_DEALERS),
    [book]
  );

  return (
    <CollapsibleCard
      title="Outstanding"
      fullHeight
      className={className}
      badge={summary && !loading && !error && (
        <span className="text-xs font-mono font-bold px-3 py-0.5 rounded-full shadow-xs badge-theme-red">
          {formatINR(summary.overdue)} overdue
        </span>
      )}
      accentColor="#ef4444"
    >
      {loading ? (
        <SkeletonLoader variant="chart" />
      ) : error ? (
        <div className="text-sm text-text-muted py-2">Outstanding ledger unavailable: {error}</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {/* Unpaid bills by age, same bands and colours as the Outstanding tab */}
          <div className="space-y-1 shrink-0">
            <div className="text-[13px] font-bold text-text-primary uppercase tracking-wide">Bills Due by Age</div>
            <div className="flex w-full h-2.5 rounded-full overflow-hidden border border-border/40 bg-bg-primary/80" aria-hidden="true">
              {summary.buckets.map(b => {
                const share = pct(b.bills, summary.bills);
                return share > 0 && (
                  <div key={b.key} className="h-full" style={{ width: `${Math.max(share, 1.5)}%`, background: b.fill }} />
                );
              })}
            </div>
            <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-4">
              {summary.buckets.map(b => (
                <li key={b.key} className="flex items-center gap-1.5 min-w-0 text-xs leading-tight" title={formatINRFull(b.bills)}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.fill }} aria-hidden="true" />
                  <span className="text-text-muted font-semibold truncate">{b.label.replace(' overdue', '')}</span>
                  <span className="font-mono font-bold text-text-primary ml-auto whitespace-nowrap">{formatINR(b.bills)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Who to chase first */}
          <div className="flex-1 min-h-0 flex flex-col gap-1 pt-1.5 border-t border-border/40">
            <div className="text-[13px] font-bold text-text-primary uppercase tracking-wide shrink-0">Most Overdue Dealers</div>
            {topOverdue.length === 0 && <div className="text-sm text-text-muted">No dealer is past due date</div>}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
              {topOverdue.map(r => {
                const place = [r.districtLabel, r.stateLabel].filter(Boolean).join(', ');
                return (
                  <div
                    key={r.key}
                    role="link"
                    tabIndex={0}
                    onClick={() => openDealer(r)}
                    onKeyDown={e => { if (e.key === 'Enter') openDealer(r); }}
                    title={`${r.dealer_name}, ${place}: ${formatINRFull(r.overdue_amount)} overdue of ${formatINRFull(r.total_outstanding)}`}
                    className="flex items-center justify-between px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="text-text-primary font-medium">{r.dealer_name}</span>
                      <span className="text-text-muted text-xs"> · {place}</span>
                    </span>
                    <span className="text-sm font-bold text-severity-critical font-mono shrink-0">{formatINR(r.overdue_amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pinned to the bottom: the card's height follows the slot, the action stays put */}
          <div className="pt-2.5 border-t border-border/40 flex items-center justify-between gap-2 shrink-0">
            <div
              className="min-w-0 text-xs text-text-muted leading-snug"
              title={`${formatINR(summary.bills)} of bills, less ${formatINR(Math.abs(summary.credit))} of payments and credit notes not yet adjusted, leaves ${formatINR(summary.total)} outstanding across ${summary.dealerCount.toLocaleString('en-IN')} dealers.`}
            >
              <div className="truncate">Net {formatINR(summary.total)} after {formatINR(Math.abs(summary.credit))} credits</div>
              <div className="truncate">{summary.asOn ? `Ledger as on ${formatDate(summary.asOn)}` : 'ERP outstanding ledger'}</div>
            </div>
            <button onClick={openOutstanding} className="btn-pill-action shrink-0 min-h-[44px] md:min-h-0">
              <span>Open Outstanding</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

export default memo(OutstandingSnapshotCard);
