import { memo } from 'react';
import { TrendingUp, AlertTriangle, Target, CheckCircle2, Compass } from 'lucide-react';
import { QUADRANT_ORDER, QUADRANT_COUNT_KEYS, quadrantConfig } from '../../utils/visits';

const ICONS = {
  GROWTH_DRIVER: CheckCircle2,
  RED_FLAG: AlertTriangle,
  NEGLECTED: Target,
  ORGANIC: TrendingUp,
  NO_SALES_LINK: Compass,
};

/**
 * The alignment ribbon, driven off QUADRANT_ORDER rather than five copy-pasted
 * blocks. The old version hardcoded four cards, so when a fifth bucket was
 * introduced the tiles silently stopped summing to the dealer count and ~1,600
 * dealers had no card and no way to filter to them.
 */
function VisitAlignmentCards({ summary, selected, onSelect }) {
  if (!summary) return null;

  const total = QUADRANT_ORDER.reduce(
    (s, k) => s + (summary[QUADRANT_COUNT_KEYS[k]] ?? 0), 0
  );

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-xs font-black uppercase tracking-wider text-text-muted">
          Dealer Sales &amp; Field Visit Alignment
        </h3>
        <span className="text-[11px] text-text-muted">
          {total.toLocaleString('en-IN')} dealers ·{' '}
          {(summary.salesLinkedDealers ?? 0).toLocaleString('en-IN')} linked to a sales account
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {QUADRANT_ORDER.map(key => {
          const cfg = quadrantConfig(key);
          const Icon = ICONS[key] ?? Compass;
          const count = summary[QUADRANT_COUNT_KEYS[key]] ?? 0;
          const isActive = selected === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(isActive ? 'ALL' : key)}
              className={`text-left p-4 rounded-2xl border transition-all duration-200 relative overflow-hidden ${
                isActive ? 'shadow-md ring-1' : 'bg-bg-card hover:bg-bg-card-hover'
              }`}
              style={
                isActive
                  ? { backgroundColor: cfg.bgColor, borderColor: cfg.color, boxShadow: `0 0 0 1px ${cfg.color}` }
                  : { borderColor: cfg.borderColor }
              }
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <span
                  className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
                  style={{ color: cfg.color }}
                >
                  <Icon className="w-4 h-4 shrink-0" /> {cfg.label}
                </span>
              </div>
              <span
                className="text-[10.5px] font-bold px-2 py-0.5 rounded-full inline-block mb-2"
                style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
              >
                {cfg.badge}
              </span>
              <div className="text-3xl font-black text-text-primary mb-1">
                {count.toLocaleString('en-IN')}{' '}
                <span className="text-xs font-semibold text-text-muted">dealers</span>
              </div>
              <p className="text-[11.5px] text-text-muted leading-snug">{cfg.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(VisitAlignmentCards);
