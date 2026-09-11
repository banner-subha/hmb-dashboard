import { memo } from 'react';
import { m } from 'framer-motion';
import KPICard from '../common/KPICard';
import { formatPct } from '../../utils/formatters';
import { calculateMoM, formatTrend, getTrendColor } from '../../utils/trendEngine';
import { staggerContainer, kpiCard } from '../../utils/motionVariants';

/**
 * The metric ribbon, on the shared KPICard and the shared stagger the other
 * pages use. The visits tab previously hand-rolled these tiles, which is why
 * they drifted: two of the five carried all-time figures while the rest were
 * current-month.
 */
function VisitKPIRow({ summary, meta }) {
  if (!summary) return null;

  // calculateMoM returns a number; formatTrend/getTrendColor turn it into the
  // arrow and colour the rest of the dashboard uses.
  const hasPrev = summary.prevTotalVisits != null;
  const visitsMoM = hasPrev
    ? calculateMoM(summary.curTotalVisits, summary.prevTotalVisits)
    : null;
  const elapsed = meta?.elapsedDays;

  return (
    <m.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
    >
      <m.div variants={kpiCard}>
        <KPICard
          label="Visits This Month"
          value={(summary.curTotalVisits ?? 0).toLocaleString('en-IN')}
          subtitle={`${(summary.curDealerVisits ?? 0).toLocaleString('en-IN')} dealer · ${(summary.curFabricatorVisits ?? 0).toLocaleString('en-IN')} fabricator`}
          momDisplay={visitsMoM != null ? formatTrend(visitsMoM) : undefined}
          momColor={visitsMoM != null ? getTrendColor(visitsMoM) : undefined}
          accentColor="#3b82f6"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <KPICard
          label="Dealer Coverage"
          value={formatPct(summary.dealerCoveragePct)}
          subtitle={`${(summary.activeDealersVisited ?? 0).toLocaleString('en-IN')} of ${(summary.totalDealersTracked ?? 0).toLocaleString('en-IN')} dealers visited at least once`}
          accentColor="#22c55e"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <KPICard
          label="Fabricator Visits"
          value={(summary.curFabricatorVisits ?? 0).toLocaleString('en-IN')}
          subtitle="Workshops and builders — demand influencers, not buyers"
          accentColor="#a855f7"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <KPICard
          label="Average Visit Length"
          value={`${summary.avgVisitDurationMins ?? 0} mins`}
          // Called out rather than left to be misread: this figure is all-time
          // and dealer-only in the payload, while every tile beside it covers
          // the current month.
          subtitle="Dealer meetings, all months"
          accentColor="#f59e0b"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <KPICard
          label="Active Sales Executives"
          value={(summary.activeFieldReps ?? 0).toLocaleString('en-IN')}
          subtitle={
            elapsed
              ? `In the field over the first ${elapsed} day${elapsed === 1 ? '' : 's'} of the month`
              : 'In the field this month'
          }
          accentColor="#06b6d4"
        />
      </m.div>
    </m.div>
  );
}

export default memo(VisitKPIRow);
