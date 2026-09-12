import { memo } from 'react';
import { m } from 'framer-motion';
import { TrendingUp, AlertTriangle, Target, CheckCircle2, Compass, Info } from 'lucide-react';
import { QUADRANT_ORDER, QUADRANT_COUNT_KEYS, quadrantConfig, accentBucket } from '../../utils/visits';
import { formatPct } from '../../utils/formatters';
import { staggerContainer, kpiCard } from '../../utils/motionVariants';

const ICONS = {
  GROWTH_DRIVER: CheckCircle2,
  RED_FLAG: AlertTriangle,
  NEGLECTED: Target,
  ORGANIC: TrendingUp,
  NO_SALES_LINK: Compass,
};

/**
 * The five groups a dealer can fall into, as filter cards.
 *
 * Driven off QUADRANT_ORDER rather than copy-pasted blocks. The old version
 * hardcoded four cards, so when a fifth bucket was introduced the tiles
 * silently stopped summing to the dealer count and ~1,600 dealers had no card
 * and no way to filter to them.
 */
function VisitAlignmentCards({ summary, selected, onSelect, salesLink }) {
  if (!summary) return null;

  const total = QUADRANT_ORDER.reduce(
    (s, k) => s + (summary[QUADRANT_COUNT_KEYS[k]] ?? 0), 0
  );
  const linked = summary.salesLinkedDealers ?? 0;

  return (
    <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold text-text-primary leading-tight">
            Visit Impact on Sales
          </h3>
          <p className="text-[13.5px] text-text-muted mt-1.5 max-w-3xl leading-relaxed">
            Every dealer falls into one of these five groups. Select a card to filter the
            table below to those dealers.
          </p>
        </div>
        {selected !== 'ALL' && (
          <button
            type="button"
            onClick={() => onSelect('ALL')}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer whitespace-nowrap"
          >
            Show All Dealers
          </button>
        )}
      </div>

      {/*
        States plainly how much of this section rests on a sales link. Every
        group except "No Sales Yet", and every target status in the table, is
        meaningless without one — and only about a third of dealers have one.
      */}
      {salesLink && (
        <div className="flex items-start gap-2.5 text-[13px] text-text-secondary bg-bg-secondary/50 border border-border/40 rounded-xl px-3.5 py-3">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-accent-blue" />
          <span className="leading-relaxed">
            <strong className="text-text-primary font-bold">
              {salesLink.matched.toLocaleString('en-IN')} of{' '}
              {(salesLink.matched + salesLink.unmatched).toLocaleString('en-IN')} dealers
              ({formatPct(salesLink.matchPct)})
            </strong>{' '}
            have a matching sales account. Target progress can only be judged for those.
            The rest have been visited but never invoiced, so they sit in "No Sales Yet".
          </span>
        </div>
      )}

      <m.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
      >
        {QUADRANT_ORDER.map(key => {
          const cfg = quadrantConfig(key);
          const Icon = ICONS[key] ?? Compass;
          const count = summary[QUADRANT_COUNT_KEYS[key]] ?? 0;
          const share = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
          const isActive = selected === key;

          return (
            <m.div key={key} variants={kpiCard} className="h-full">
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(isActive ? 'ALL' : key)}
                title={cfg.action}
                className="glass-card-hover relative w-full h-full text-left p-4 pl-5 overflow-hidden cursor-pointer"
                style={
                  isActive
                    ? { background: cfg.bgColor, borderColor: cfg.color, boxShadow: `0 0 0 1px ${cfg.color}` }
                    : undefined
                }
              >
                {/* Same 4px side accent as KPICard, so the two ribbons read as
                    one system rather than two different card languages. */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-[4px]"
                  style={{ backgroundColor: cfg.color }}
                />

                <span
                  data-accent={accentBucket(cfg.color)}
                  className="text-[14.5px] font-black leading-tight flex items-start gap-2 mb-2.5"
                  style={{ color: cfg.color }}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0 mt-px" />
                  {cfg.label}
                </span>

                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-[2.1rem] font-black text-text-primary leading-none tracking-tight">
                    {count.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[12.5px] font-bold text-text-muted">
                    dealers · {share}%
                  </span>
                </div>

                <span className="text-[11.5px] font-bold text-text-muted uppercase tracking-wide block mb-2.5 leading-snug">
                  {cfg.badge}
                </span>

                <p className="text-[13px] text-text-secondary leading-snug">
                  {cfg.description}
                </p>

                {isActive && (
                  <span
                    className="mt-3 inline-block text-[11.5px] font-black uppercase tracking-wider"
                    style={{ color: cfg.color }}
                  >
                    Filtering Table ↓
                  </span>
                )}
              </button>
            </m.div>
          );
        })}
      </m.div>

      <p className="text-[12.5px] font-semibold text-text-muted">
        {total.toLocaleString('en-IN')} dealers in view · {linked.toLocaleString('en-IN')} with a sales account
      </p>
    </div>
  );
}

export default memo(VisitAlignmentCards);
