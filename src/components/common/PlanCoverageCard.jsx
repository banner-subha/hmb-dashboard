import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Store } from 'lucide-react';
import CollapsibleCard from './CollapsibleCard';
import SkeletonLoader from './SkeletonLoader';
import { formatCount, formatPct1, formatMonthLabel, coverageTone } from '../../utils/businessPlan';

/** How many states the card lists before handing off to the Business Plan tab. */
const VISIBLE_ROWS = 4;

/**
 * How much of the planned dealer base actually transacted.
 *
 * Volume against target and coverage of the dealer base fail in different
 * ways, and one can hide the other: a state can hit its tonnage on a handful
 * of large accounts while most of its planned dealers stay dormant. This card
 * is the dealer-count view, so that case is visible instead of averaged away.
 *
 * States are ordered by the number of dormant dealers rather than by
 * percentage, because twenty dormant dealers in a large state is a bigger
 * recovery job than a poor ratio across four.
 */
function PlanCoverageCard({ month, states, totals, loading, error }) {
  const navigate = useNavigate();

  const gaps = useMemo(
    () =>
      [...(states || [])]
        .filter((s) => s.bpDealers > 0 && s.activeDealers < s.bpDealers)
        .map((s) => ({ ...s, dormant: s.bpDealers - s.activeDealers }))
        .sort((a, b) => b.dormant - a.dormant)
        .slice(0, VISIBLE_ROWS),
    [states]
  );

  const dormantTotal = totals ? totals.bpDealers - totals.activeDealers : 0;
  const headlineColor = coverageTone(totals?.coveragePct ?? null).color;

  const body = () => {
    if (loading) {
      return (
        <div className="space-y-2.5">
          <SkeletonLoader variant="table-row" count={4} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-sm text-text-muted py-6 text-center font-medium">
          Dealer target figures could not be loaded.
        </div>
      );
    }

    if (!totals || !totals.bpDealers) {
      return (
        <div className="text-sm text-text-muted py-6 text-center font-medium">
          No dealer targets have been published for this month yet.
        </div>
      );
    }

    return (
      <div className="space-y-3.5 py-0.5">
        {/* The card sits in a half-width dashboard column, so the headline and
            its caption share one baseline row only when the caption is short
            enough; the percentage stays the first thing read either way. */}
        <div className="rounded-lg bg-bg-secondary/60 border border-border/40 p-3">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <div className="text-2xl font-black leading-none tabular-nums" style={{ color: headlineColor }}>
              {formatPct1(totals.coveragePct)}
            </div>
            <div className="text-xs text-text-secondary font-semibold leading-snug min-w-0">
              {formatCount(totals.activeDealers)} of {formatCount(totals.bpDealers)} planned dealers billed
            </div>
          </div>
          <span className="block h-1.5 w-full rounded-full bg-bg-secondary overflow-hidden mt-2.5 border border-border/30">
            <span
              className="block h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(0, Math.min(100, totals.coveragePct ?? 0))}%`,
                backgroundColor: headlineColor,
              }}
            />
          </span>
          {dormantTotal > 0 && (
            <div className="text-xs text-text-muted font-medium mt-2 leading-snug">
              {formatCount(dormantTotal)} planned dealers have not billed this cycle.
            </div>
          )}
        </div>

        {gaps.length === 0 ? (
          <div className="text-sm text-text-muted py-4 text-center font-medium">
            Every planned dealer billed this month.
          </div>
        ) : (
          <div className="space-y-2">
            {gaps.map((s) => (
              <div
                key={s.key || s.label}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/dealers?state=${encodeURIComponent(s.label)}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/dealers?state=${encodeURIComponent(s.label)}`);
                  }
                }}
                className="group flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer shadow-xs gap-2.5 focus-visible:outline-accent-blue"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm sm:text-[15px] font-bold text-text-primary truncate group-hover:text-accent-blue transition-colors leading-snug">
                    {s.label}
                  </div>
                  <div className="text-xs text-text-muted font-medium mt-0.5 truncate">
                    {formatCount(s.dormant)} of {formatCount(s.bpDealers)} dealers dormant
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-sm font-black tabular-nums" style={{ color: coverageTone(s.coveragePct).color }}>
                    {formatPct1(s.coveragePct)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-blue transition-transform group-hover:translate-x-0.5 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <CollapsibleCard
      title="Dealer Coverage Against Plan"
      accentColor="#8b5cf6"
      badge={
        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-blue">
          <Store className="w-3.5 h-3.5" />
          <span>{month ? `Plan ${formatMonthLabel(month)}` : loading ? 'Loading plan' : 'No plan month'}</span>
        </div>
      }
    >
      {body()}
    </CollapsibleCard>
  );
}

export default React.memo(PlanCoverageCard);
