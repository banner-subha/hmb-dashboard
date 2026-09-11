import { memo, useMemo, useRef } from 'react';
import { Clock, Timer, CalendarRange } from 'lucide-react';
import MoMAreaTrendChart from '../charts/MoMAreaTrendChart';
import { useChartVisible } from '../../hooks/useChartVisible';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(ym) {
  const [y, m] = String(ym || '').split('-');
  const idx = parseInt(m, 10) - 1;
  return MONTH_LABELS[idx] ? `${MONTH_LABELS[idx]} ${String(y).slice(2)}` : String(ym || '');
}

/** "09:00" or "9" → "9 AM", so the axis reads like a clock and not like data. */
function clockLabel(hour) {
  const h = parseInt(String(hour), 10);
  if (Number.isNaN(h)) return String(hour ?? '');
  const suffix = h < 12 ? 'AM' : 'PM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

function shortClockLabel(hour) {
  const h = parseInt(String(hour), 10);
  if (Number.isNaN(h)) return String(hour ?? '');
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${h < 12 ? 'a' : 'p'}`;
}

const DURATION_BUCKETS = [
  { key: 'under15m', label: 'Under 15 min', hint: 'Quick drop-in', color: 'text-rose-400', bar: 'bg-rose-500' },
  { key: '15to30m', label: '15 to 30 min', hint: 'Normal call', color: 'text-amber-400', bar: 'bg-amber-500' },
  { key: '30to60m', label: '30 to 60 min', hint: 'Proper sit-down', color: 'text-emerald-400', bar: 'bg-emerald-500' },
  { key: 'over60m', label: 'Over an hour', hint: 'Long meeting', color: 'text-blue-400', bar: 'bg-blue-500' },
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
    const total = entries.reduce((s, [, v]) => s + v, 0);

    // The busiest three-hour window, stated in words so nobody has to read it
    // off the bars.
    let peak = null;
    for (let i = 0; i + 2 < entries.length; i += 1) {
      const sum = entries[i][1] + entries[i + 1][1] + entries[i + 2][1];
      if (!peak || sum > peak.sum) {
        peak = { sum, from: entries[i][0], to: entries[i + 2][0] };
      }
    }

    return { entries, max: max || 1, total, peak };
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
      <div>
        <div className="flex items-start gap-2.5 mb-1">
          <Clock className="w-4 h-4 text-accent-blue mt-0.5 shrink-0" />
          <h4 className="text-base font-extrabold text-text-primary">Visit Time of Day</h4>
        </div>
        <p className="text-[13.5px] text-text-muted mb-4 ml-6 leading-relaxed">
          Check-in times across every visit on record.
          {hourly.peak && (
            <> Busiest window is <strong className="text-text-secondary font-bold">
              {clockLabel(hourly.peak.from)} to {clockLabel(hourly.peak.to)}
            </strong>
            {hourly.total > 0 && ` — ${Math.round((hourly.peak.sum / hourly.total) * 100)}% of all visits`}.</>
          )}
        </p>
        <div ref={hourlyRef} className="flex items-end gap-1 h-48 rounded-xl bg-bg-secondary/40 border border-border/30 p-3">
          {hourly.entries.map(([hour, count]) => {
            const pct = (count / hourly.max) * 100;
            return (
              <div key={hour} className="flex-1 flex flex-col items-center justify-end h-full group min-w-0">
                <span className="text-[11px] text-text-secondary mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-bold">
                  {count.toLocaleString('en-IN')}
                </span>
                <div
                  className="w-full bg-accent-blue/60 group-hover:bg-accent-blue rounded-t transition-all duration-500"
                  style={{ height: hourlyVisible ? `${pct}%` : '0%' }}
                  title={`${clockLabel(hour)} — ${count.toLocaleString('en-IN')} visits`}
                />
                <span className="text-[10.5px] font-semibold text-text-muted mt-1.5 whitespace-nowrap">
                  {shortClockLabel(hour)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Duration buckets */}
      <div className="pt-5 border-t border-border/40">
        <div className="flex items-start gap-2.5 mb-1">
          <Timer className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <h4 className="text-base font-extrabold text-text-primary">Visit Duration</h4>
        </div>
        <p className="text-[13.5px] text-text-muted mb-4 ml-6 leading-relaxed">
          Visits with no recorded check-out are excluded, so these add up to less than the
          total visit count.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {DURATION_BUCKETS.map(b => {
            const v = buckets[b.key] || 0;
            const share = Math.round((v / bucketTotal) * 1000) / 10;
            return (
              <div key={b.key} className="p-3.5 bg-bg-secondary/50 rounded-xl border border-border/30">
                <span className="text-[12.5px] font-bold text-text-muted block mb-1.5">{b.label}</span>
                <span className={`text-3xl font-black ${b.color} leading-none`}>
                  {v.toLocaleString('en-IN')}
                </span>
                <span className="text-[12px] font-semibold text-text-muted block mt-2 mb-2">
                  {b.hint} · {share}%
                </span>
                <div className="h-1.5 rounded-full bg-bg-card overflow-hidden">
                  <div className={`h-full ${b.bar} rounded-full`} style={{ width: `${share}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly trend */}
      <div className="pt-5 border-t border-border/40">
        <div className="flex items-start gap-2.5 mb-1">
          <CalendarRange className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <h4 className="text-base font-extrabold text-text-primary">Monthly Visit Trend</h4>
        </div>
        <p className="text-[13.5px] text-text-muted mb-4 ml-6 leading-relaxed">
          Every month on record. The current month is still running
          {elapsedDays ? ` — only ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} counted so far` : ''},
          so the last point is not comparable with the completed months before it.
        </p>
        <MoMAreaTrendChart
          data={trend}
          height={230}
          accentColor="#3b82f6"
          valueLabel="Visits"
          valueUnit=""
          valueDecimals={0}
          emptyMessage="No monthly visit history yet"
        />
      </div>
    </div>
  );
}

export default memo(VisitTrendsPanel);
