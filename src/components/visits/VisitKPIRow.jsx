import { memo } from 'react';
import KPICard from '../common/KPICard';
import { formatPct } from '../../utils/formatters';
import { calculateMoM, formatTrend, getTrendColor } from '../../utils/trendEngine';

/**
 * The metric ribbon, on the shared KPICard the other six pages use. The visits
 * tab previously hand-rolled these tiles, which is why they drifted: two of the
 * five carried all-time figures while the rest were current-month.
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
  const period = elapsed
    ? `first ${elapsed} day${elapsed === 1 ? '' : 's'} of the month`
    : 'current month';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      <KPICard
        label="Total Visits Completed"
        value={(summary.curTotalVisits ?? 0).toLocaleString('en-IN')}
        subtitle={`${(summary.curDealerVisits ?? 0).toLocaleString('en-IN')} dealer · ${(summary.curFabricatorVisits ?? 0).toLocaleString('en-IN')} fabricator`}
        momDisplay={visitsMoM != null ? formatTrend(visitsMoM) : undefined}
        momColor={visitsMoM != null ? getTrendColor(visitsMoM) : undefined}
        accentColor="#3b82f6"
      />
      <KPICard
        label="Dealers Visited"
        value={formatPct(summary.dealerCoveragePct)}
        subtitle={`${(summary.activeDealersVisited ?? 0).toLocaleString('en-IN')} of ${(summary.totalDealersTracked ?? 0).toLocaleString('en-IN')} tracked dealers reached`}
        accentColor="#22c55e"
      />
      <KPICard
        label="Fabricator Field Visits"
        value={(summary.curFabricatorVisits ?? 0).toLocaleString('en-IN')}
        subtitle="Workshop & builder coverage — demand influencers, not buyers"
        accentColor="#a855f7"
      />
      <KPICard
        label="Average Time on Site"
        value={`${summary.avgVisitDurationMins ?? 0} mins`}
        // Called out rather than left to be misread: this figure is all-time
        // and dealer-only in the payload, while every tile beside it covers
        // the current month.
        subtitle="Mean dealer meeting length, all months"
        accentColor="#f59e0b"
      />
      <KPICard
        label="Active Sales Executives"
        value={(summary.activeFieldReps ?? 0).toLocaleString('en-IN')}
        subtitle={`Field force on record · ${period}`}
        accentColor="#06b6d4"
      />
    </div>
  );
}

export default memo(VisitKPIRow);
