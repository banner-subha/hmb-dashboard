import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Footprints } from 'lucide-react';
import CollapsibleCard from './CollapsibleCard';
import SkeletonLoader from './SkeletonLoader';
import { formatPct } from '../../utils/formatters';
import { calculateMoM, formatTrend, getTrendColor } from '../../utils/trendEngine';

/**
 * What the field force did this month.
 *
 * Reports visit counts and coverage rather than the quadrant classification.
 * The quadrants are re-derived against the Business Plan on the Field Visits
 * tab; repeating them here without that enrichment would put two different
 * populations behind the same label on two tabs.
 *
 * Takes the visit payload as props rather than calling `useVisitData` itself,
 * so the page derives it once and the KPI tile above cannot drift from the
 * figures in this card.
 */
function FieldCoverageCard({ data, summary, loading, error }) {
  const navigate = useNavigate();

  const elapsed = data?.meta?.elapsedDays;
  const visitsMoM =
    summary?.prevTotalVisits != null
      ? calculateMoM(summary.curTotalVisits, summary.prevTotalVisits)
      : null;

  const unvisited = summary
    ? Math.max(0, (summary.totalDealersTracked || 0) - (summary.activeDealersVisited || 0))
    : 0;

  const metrics = summary
    ? [
        {
          label: 'Visits logged',
          value: (summary.curTotalVisits ?? 0).toLocaleString('en-IN'),
          note: `${(summary.curDealerVisits ?? 0).toLocaleString('en-IN')} dealer · ${(summary.curFabricatorVisits ?? 0).toLocaleString('en-IN')} fabricator`,
          color: '#3b82f6',
          trend: visitsMoM,
        },
        {
          label: 'Dealer coverage',
          value: formatPct(summary.dealerCoveragePct),
          note: `${(summary.activeDealersVisited ?? 0).toLocaleString('en-IN')} of ${(summary.totalDealersTracked ?? 0).toLocaleString('en-IN')} dealers seen`,
          color: '#22c55e',
        },
        {
          label: 'Not yet visited',
          value: unvisited.toLocaleString('en-IN'),
          note: 'Tracked dealers with no visit this cycle',
          color: unvisited > 0 ? '#f97316' : '#22c55e',
        },
        {
          label: 'Reps in the field',
          value: (summary.activeFieldReps ?? 0).toLocaleString('en-IN'),
          note: elapsed
            ? `Across the first ${elapsed} day${elapsed === 1 ? '' : 's'} of the month`
            : 'Active this month',
          color: '#06b6d4',
        },
      ]
    : [];

  const body = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 gap-2.5">
          <SkeletonLoader variant="kpi" count={4} />
        </div>
      );
    }

    if (error || !summary) {
      return (
        <div className="text-sm text-text-muted py-6 text-center font-medium">
          Field visit data could not be loaded.
        </div>
      );
    }

    return (
      <div className="space-y-3.5 py-0.5">
        <div className="grid grid-cols-2 gap-2.5">
          {metrics.map((mtc) => (
            <div
              key={mtc.label}
              className="rounded-lg bg-bg-secondary/60 border border-border/40 p-2.5 sm:p-3 min-w-0"
            >
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide leading-snug">
                {mtc.label}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className="text-xl font-black leading-none tabular-nums"
                  style={{ color: mtc.color }}
                >
                  {mtc.value}
                </span>
                {mtc.trend != null && (
                  <span
                    className="text-xs font-black whitespace-nowrap"
                    style={{ color: getTrendColor(mtc.trend) }}
                  >
                    {formatTrend(mtc.trend)}
                  </span>
                )}
              </div>
              <div className="text-xs text-text-muted font-medium mt-1.5 leading-snug">{mtc.note}</div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border/40">
          <button
            onClick={() => navigate('/visits')}
            className="w-full py-2.5 px-3 rounded-lg bg-bg-secondary hover:bg-bg-card border border-border/60 hover:border-accent-blue/50 text-xs sm:text-sm font-bold text-accent-blue hover:text-accent-blue/80 flex items-center justify-center gap-2 transition-all cursor-pointer group shadow-xs leading-snug"
          >
            <span>Open the field visit tracker</span>
            <ArrowRight className="w-4 h-4 text-accent-blue transition-transform group-hover:translate-x-1 shrink-0" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <CollapsibleCard
      title="Field Coverage This Month"
      accentColor="#06b6d4"
      badge={
        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-blue">
          <Footprints className="w-3.5 h-3.5" />
          <span>Visit tracker</span>
        </div>
      }
    >
      {body()}
    </CollapsibleCard>
  );
}

export default React.memo(FieldCoverageCard);
