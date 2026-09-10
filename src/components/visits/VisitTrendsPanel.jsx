import { memo, useMemo, useRef } from 'react';
import MoMAreaTrendChart from '../charts/MoMAreaTrendChart';
import { useChartVisible } from '../../hooks/useChartVisible';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(ym) {
  const [y, m] = String(ym || '').split('-');
  const idx = parseInt(m, 10) - 1;
  return MONTH_LABELS[idx] ? `${MONTH_LABELS[idx]} ${String(y).slice(2)}` : String(ym || '');
}

const DURATION_BUCKETS = [
  { key: 'under15m', label: 'Under 15 min', hint: 'Brief drop-in', color: 'text-rose-400' },
  { key: '15to30m', label: '15 – 30 min', hint: 'Standard call', color: 'text-amber-400' },
  { key: '30to60m', label: '30 – 60 min', hint: 'Working session', color: 'text-emerald-400' },
  { key: 'over60m', label: 'Over 60 min', hint: 'Extended meeting', color: 'text-blue-400' },
];

/**
 * Time-of-day and monthly trend view.
 *
 * The monthly trend was a hand-drawn div-bar chart; it now uses the shared
 * MoMAreaTrendChart, so it animates on scroll and reads like every other trend
 * on the dashboard. The hourly histogram stays bespoke — there is no shared
 * component for a 24-bucket distribution, and inventing one for a single
 * caller would be worse than the bars.
 */
function VisitTrendsPanel({ timeAnalytics, monthlyTrend, elapsedDays }) {
  const hourlyRef = useRef(null);
  const hourlyVisible = useChartVisible(hourlyRef);

  const hourly = useMemo(() => {
    const dist = timeAnalytics?.hourlyDistribution || {};
    const entries = Object.entries(dist);
    const max = entries.length ? Math.max(...entries.map(([, v]) => v)) : 1;
    return { entries, max: max || 1 };
  }, [timeAnalytics]);

  const trend = useMemo(() => (monthlyTrend || []).map(m => ({
    monthLabel: monthLabel(m.month),
    volume: m.totalVisits,
    dealerVisits: m.dealerVisits,
    fabricatorVisits: m.fabricatorVisits,
  })), [monthlyTrend]);

  const buckets = timeAnalytics?.durationBuckets || {};
  const bucketTotal = DURATION_BUCKETS.reduce((s, b) => s + (buckets[b.key] || 0), 0) || 1;

  return (
    <div className="space-y-6">
      {/* Hourly distribution */}
      <div className="bg-bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-black text-text-primary mb-1">When the Team Is in the Field</h3>
        <p className="text-[11.5px] text-text-muted mb-4">
          Check-in times across every recorded visit. Useful for spotting reps logging
          calls outside working hours.
        </p>
        <div ref={hourlyRef} className="flex items-end gap-1 h-40">
          {hourly.entries.map(([hour, count]) => {
            const pct = (count / hourly.max) * 100;
            return (
              <div key={hour} className="flex-1 flex flex-col items-center justify-end h-full group min-w-0">
                <span className="text-[9px] text-text-muted mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {count.toLocaleString('en-IN')}
                </span>
                <div
                  className="w-full bg-accent-blue/70 group-hover:bg-accent-blue rounded-t transition-all duration-500"
                  style={{ height: hourlyVisible ? `${pct}%` : '0%' }}
                  title={`${hour} — ${count.toLocaleString('en-IN')} visits`}
                />
                <span className="text-[8.5px] text-text-muted mt-1 whitespace-nowrap">
                  {String(hour).slice(0, 2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Duration buckets */}
      <div className="bg-bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-black text-text-primary mb-1">How Long Visits Last</h3>
        <p className="text-[11.5px] text-text-muted mb-4">
          Visits with no recorded check-out are excluded, so these counts are
          shorter than the total visit count.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {DURATION_BUCKETS.map(b => {
            const v = buckets[b.key] || 0;
            return (
              <div key={b.key} className="p-3 bg-bg-secondary/60 rounded-xl border border-border/30">
                <span className="text-[10.5px] font-bold text-text-muted block">{b.label}</span>
                <span className={`text-2xl font-black ${b.color}`}>{v.toLocaleString('en-IN')}</span>
                <span className="text-[10px] text-text-muted block mt-0.5">
                  {b.hint} · {Math.round((v / bucketTotal) * 1000) / 10}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly trend */}
      <div className="bg-bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-black text-text-primary mb-1">Monthly Visit Volume</h3>
        <p className="text-[11.5px] text-text-muted mb-4">
          Every month in the dataset. The current month is still in progress
          {elapsedDays ? ` — ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} of data so far` : ''},
          so its bar is not comparable with the closed months beside it.
        </p>
        <MoMAreaTrendChart data={trend} height={220} accentColor="#3b82f6" />
      </div>
    </div>
  );
}

export default memo(VisitTrendsPanel);
