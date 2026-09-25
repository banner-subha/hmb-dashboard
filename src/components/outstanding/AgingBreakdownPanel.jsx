import { memo } from 'react';
import { X } from 'lucide-react';
import { formatINR, formatINRFull } from '../../utils/outstanding';

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Unpaid bills by age: one card per band with the amount, its share of all
 * unpaid bills and how many dealers have bills there. Credits are one line in
 * the heading rather than a second set of bars; the business reads "how much
 * is late, and how late", and the credit side made that harder to see.
 *
 * Each card is a toggle that filters the dealer table to that band.
 */
function AgingBreakdownPanel({ summary, activeBucket, onSelectBucket }) {
  const { buckets } = summary;
  const active = buckets.find((b) => b.key === activeBucket);

  return (
    <section className="glass-card p-4 sm:p-5" aria-labelledby="aging-heading">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 mb-4">
        <div>
          <h3 id="aging-heading" className="text-lg font-extrabold text-text-primary">Overdue ageing</h3>
          <p className="text-[13px] text-text-muted mt-1 max-w-[75ch]">
            Bills due of {formatINR(summary.bills)}, less {formatINR(Math.abs(summary.credit))} of payments and credit
            notes not yet adjusted, gives a total outstanding of {formatINR(summary.total)}. Click a box to see its dealers.
          </p>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onSelectBucket('')}
            className="inline-flex items-center gap-1.5 self-start shrink-0 px-3 py-1.5 rounded-lg border border-border-accent bg-accent-blue-soft text-[13px] font-bold text-accent-blue cursor-pointer hover:opacity-90"
          >
            {active.label}
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">Clear age filter</span>
          </button>
        )}
      </div>

      <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {buckets.map((b) => {
          const selected = b.key === activeBucket;
          const share = pct(b.bills, summary.bills);
          return (
            <li key={b.key}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectBucket(selected ? '' : b.key)}
                title={`${b.label}: bills due ${formatINRFull(b.bills)}`}
                className={`w-full h-full text-left rounded-xl border p-3 cursor-pointer transition-colors ${
                  selected ? 'border-border-accent bg-accent-blue-soft' : 'border-border bg-bg-secondary hover:border-border-accent'
                }`}
              >
                <span className="flex items-center gap-2 text-[13px] font-bold text-text-secondary">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.fill }} aria-hidden="true" />
                  {b.label}
                </span>
                <span className="block text-xl font-black text-text-primary tabular-nums whitespace-nowrap mt-1.5">{formatINR(b.bills)}</span>
                <span className="block h-1.5 rounded-full bg-bg-tertiary mt-2 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${share}%`, background: b.fill }} />
                </span>
                <span className="block text-[12px] text-text-muted mt-1.5">
                  {share.toFixed(0)}% of bills due, {b.accounts.toLocaleString('en-IN')} {b.accounts === 1 ? 'dealer' : 'dealers'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default memo(AgingBreakdownPanel);
