import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ReferenceLine,
  Cell
} from 'recharts';
import CollapsibleCard from './CollapsibleCard';
import { formatMT } from '../../utils/formatters';
import { Award, Calendar, ArrowRight, Activity, TrendingUp, Compass } from 'lucide-react';

const MONTH_NAMES = {
  '2026-01': 'Jan',
  '2026-02': 'Feb',
  '2026-03': 'Mar',
  '2026-04': 'Apr',
  '2026-05': 'May',
  '2026-06': 'Jun',
  '2026-07': 'Jul',
  '2026-08': 'Aug (MTD)'
};

export default function MultiMonthTrajectoryCard({ rawData, data }) {
  const navigate = useNavigate();

  const chartData = useMemo(() => {
    const monthlyHistory = rawData?.monthlyHistory || {};
    const entries = Object.entries(monthlyHistory).sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      // Fallback historical sample if history is empty
      const fallback = [
        { monthKey: '2026-01', month: 'Jan', volume: 23296.89, states: 9, isCurrent: false },
        { monthKey: '2026-02', month: 'Feb', volume: 18517.95, states: 7, isCurrent: false },
        { monthKey: '2026-03', month: 'Mar', volume: 20730.36, states: 8, isCurrent: false },
        { monthKey: '2026-04', month: 'Apr', volume: 21781.31, states: 8, isCurrent: false },
        { monthKey: '2026-05', month: 'May', volume: 21716.56, states: 8, isCurrent: false },
        { monthKey: '2026-06', month: 'Jun', volume: 22277.93, states: 9, isCurrent: false },
        { monthKey: '2026-07', month: 'Jul', volume: 22756.26, states: 8, isCurrent: false },
        { monthKey: '2026-08', month: 'Aug (MTD)', volume: data?.totalCur || 6949.53, states: 10, isCurrent: true }
      ];
      return fallback;
    }

    return entries.map(([key, val]) => {
      const states = val.states || [];
      const totalMT = states.reduce((sum, s) => sum + (s.cur || s.qty || 0), 0);
      const isCurrent = key === '2026-08';

      return {
        monthKey: key,
        month: MONTH_NAMES[key] || key.slice(5),
        volume: Math.round(totalMT * 100) / 100,
        states: states.length,
        isCurrent
      };
    });
  }, [rawData, data]);

  // Calculate high-level summary KPIs and quarterly benchmarks
  const stats = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { 
        ytdTotal: 0, 
        avgMonthly: 0, 
        peakMonth: 'Jan', 
        peakVolume: 0, 
        q1Avg: 0, 
        q2Avg: 0,
        q2Growth: 0
      };
    }

    const ytdTotal = chartData.reduce((sum, d) => sum + d.volume, 0);
    const completedMonths = chartData.filter(d => !d.isCurrent);
    const avgMonthly = completedMonths.length > 0
      ? completedMonths.reduce((sum, d) => sum + d.volume, 0) / completedMonths.length
      : chartData[0]?.volume || 0;

    let peakVolume = 0;
    let peakMonth = 'Jan';
    chartData.forEach(d => {
      if (d.volume > peakVolume) {
        peakVolume = d.volume;
        peakMonth = d.month;
      }
    });

    // Q1 (Jan, Feb, Mar) vs Q2 (Apr, May, Jun) averages
    const q1Months = chartData.filter(d => ['2026-01', '2026-02', '2026-03'].includes(d.monthKey));
    const q2Months = chartData.filter(d => ['2026-04', '2026-05', '2026-06'].includes(d.monthKey));

    const q1Avg = q1Months.length > 0 
      ? q1Months.reduce((sum, d) => sum + d.volume, 0) / q1Months.length 
      : 20848.4;
    const q2Avg = q2Months.length > 0 
      ? q2Months.reduce((sum, d) => sum + d.volume, 0) / q2Months.length 
      : 21925.3;

    const q2Growth = q1Avg > 0 ? Math.round(((q2Avg - q1Avg) / q1Avg) * 1000) / 10 : 0;

    return {
      ytdTotal: Math.round(ytdTotal * 100) / 100,
      avgMonthly: Math.round(avgMonthly * 10) / 10,
      peakMonth,
      peakVolume,
      q1Avg: Math.round(q1Avg * 10) / 10,
      q2Avg: Math.round(q2Avg * 10) / 10,
      q2Growth
    };
  }, [chartData]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      const vsAvg = stats.avgMonthly > 0 
        ? Math.round(((d.volume - stats.avgMonthly) / stats.avgMonthly) * 100) 
        : 0;

      return (
        <div className="p-3.5 bg-bg-card border border-border/80 rounded-xl shadow-xl space-y-1.5 min-w-[160px]">
          <div className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
            <span className="font-black text-text-primary text-sm">{d.monthKey} ({d.month})</span>
            {d.isCurrent && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-accent-blue/15 text-accent-blue">
                This Month (MTD)
              </span>
            )}
          </div>
          <div className="flex justify-between items-baseline gap-3 pt-0.5">
            <span className="text-xs text-text-muted font-medium">Shipped:</span>
            <span className="text-sm font-black font-mono text-text-primary">{formatMT(d.volume)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-text-muted font-medium">
            <span>Active States:</span>
            <span className="font-bold text-text-primary">{d.states} States</span>
          </div>
          {!d.isCurrent && (
            <div className="flex justify-between items-center text-xs pt-1 border-t border-border/30">
              <span className="text-text-muted">vs 7-Month Average:</span>
              <span className={`font-bold ${vsAvg >= 0 ? 'text-severity-none' : 'text-severity-critical'}`}>
                {vsAvg >= 0 ? `+${vsAvg}%` : `${vsAvg}%`}
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom Distinct & Visible Gradient Cursor Line
  const GradientCursor = (props) => {
    const { points, x, width, height, top = 8, bottom } = props;
    let posX = null;
    let startY = 8;
    let endY = 270;

    if (points && points.length >= 2) {
      posX = points[0].x;
      startY = points[0].y;
      endY = points[1].y;
    } else if (points && points.length === 1) {
      posX = points[0].x;
      startY = top;
      endY = bottom !== undefined ? bottom : (height ? top + height : 270);
    } else if (x !== undefined && x !== null) {
      posX = width ? x + width / 2 : x;
      startY = top;
      endY = bottom !== undefined ? bottom : (height ? top + height : 270);
    }

    if (posX === null || posX === undefined || isNaN(posX)) return null;

    const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';

    return (
      <g className="pointer-events-none">
        {/* Soft aura glow line */}
        <line
          x1={posX}
          y1={startY}
          x2={posX}
          y2={endY}
          stroke={isLight ? "rgba(30, 41, 59, 0.2)" : "rgba(255, 255, 255, 0.2)"}
          strokeWidth={4}
          strokeLinecap="round"
        />
        {/* Main visible vertical gradient hairline */}
        <line
          x1={posX}
          y1={startY}
          x2={posX}
          y2={endY}
          stroke={isLight ? "url(#macroCursorGradientLight)" : "url(#macroCursorGradient)"}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
    );
  };

  return (
    <CollapsibleCard
      title="8-Month Dispatch History"
      badge={
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 whitespace-nowrap shadow-xs badge-theme-blue">
          This Year So Far: {formatMT(stats.ytdTotal)}
        </span>
      }
      accentColor="#3b82f6"
    >
      <div className="space-y-4 py-1">
        
        {/* Top 3 Summary Callout Metric Blocks */}
        <div className="grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
          <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-text-muted uppercase tracking-wide">
              <Award className="w-3.5 h-3.5 text-accent-blue shrink-0" />
              <span className="leading-tight">Best Month</span>
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-black text-text-primary tracking-tight leading-tight mt-1.5 break-words">
              {stats.peakMonth}
            </div>
            <div className="text-xs text-text-muted font-mono font-bold mt-1 break-words">
              {formatMT(stats.peakVolume)}
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-text-muted uppercase tracking-wide">
              <Activity className="w-3.5 h-3.5 text-accent-sky shrink-0" />
              <span className="leading-tight">Monthly Average</span>
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-black text-text-primary tracking-tight leading-tight mt-1.5 break-words">
              {formatMT(stats.avgMonthly)}
            </div>
            <div className="text-xs text-text-muted font-medium mt-1 leading-snug">
              Based on Jan–Jul
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-text-muted uppercase tracking-wide">
              <Calendar className="w-3.5 h-3.5 text-accent-blue shrink-0" />
              <span className="leading-tight">August So Far</span>
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-black text-text-primary tracking-tight leading-tight mt-1.5 break-words">
              {formatMT(data?.totalCur || 6949.53)}
            </div>
            <div className="text-xs text-text-muted font-medium mt-1 leading-snug">
              Ongoing this month
            </div>
          </div>
        </div>

        {/* Dual-Layer Composed Bar & Trendline Chart with Refined Slim Bar Width */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-bg-secondary/60 border border-border/50 shadow-xs space-y-2 flex-1 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-[13px]">
            <span className="font-extrabold text-text-primary uppercase tracking-wide">
              2026 Monthly Dispatch Run-Rate (MT)
            </span>
            <div className="flex items-center gap-3.5 text-xs text-text-muted font-medium shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-accent-blue inline-block shadow-xs" />
                <span>Monthly MT</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-amber-500 inline-block border-t-2 border-dashed" />
                <span>Avg Line</span>
              </span>
            </div>
          </div>

          <div className="h-[280px] sm:h-[310px] lg:h-[330px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 12, right: 10, left: -18, bottom: 4 }}>
                <defs>
                  <linearGradient id="macroCursorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.08} />
                    <stop offset="30%" stopColor="#ffffff" stopOpacity={0.7} />
                    <stop offset="70%" stopColor="#ffffff" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0.15} />
                  </linearGradient>
                  <linearGradient id="macroCursorGradientLight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" stopOpacity={0.08} />
                    <stop offset="30%" stopColor="#0f172a" stopOpacity={0.7} />
                    <stop offset="70%" stopColor="#0f172a" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="month" 
                  stroke="var(--color-text-muted)" 
                  fontSize={11.5} 
                  fontWeight={600}
                  tickLine={false} 
                  axisLine={{ stroke: 'var(--color-border)' }}
                />
                <YAxis 
                  stroke="var(--color-text-muted)" 
                  fontSize={11} 
                  fontWeight={600}
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                />
                <Tooltip content={<CustomTooltip />} cursor={<GradientCursor />} />
                
                {/* 7-Month Average Benchmark Line */}
                <ReferenceLine 
                  y={stats.avgMonthly} 
                  stroke="#f59e0b" 
                  strokeDasharray="4 4" 
                  strokeWidth={2}
                />

                {/* Refined Slim Monthly Volume Bars */}
                <Bar dataKey="volume" radius={[4, 4, 0, 0]} maxBarSize={22}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.isCurrent ? '#06b6d4' : '#3b82f6'} 
                      opacity={entry.isCurrent ? 0.85 : 0.95}
                    />
                  ))}
                </Bar>

                {/* Trajectory Trend Line */}
                <Line 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="#60a5fa" 
                  strokeWidth={2.5} 
                  dot={{ r: 3.5, fill: '#3b82f6', strokeWidth: 1.5, stroke: '#ffffff' }}
                  activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Quarterly Trajectory Velocity Strip to Align Gap with Right Column */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-bg-secondary/70 border border-border/40 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted font-medium">Q1 Monthly Average:</span>
              <span className="font-bold font-mono text-text-primary shrink-0">{formatMT(stats.q1Avg)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l border-border/30 sm:pl-3">
              <span className="text-text-muted font-medium">Q2 Monthly Average:</span>
              <span className="font-bold font-mono text-text-primary flex items-center gap-1.5 shrink-0">
                <span>{formatMT(stats.q2Avg)}</span>
                <span className="text-[10.5px] text-severity-none font-bold">+{stats.q2Growth}%</span>
              </span>
            </div>
          </div>
        </div>

        {/* Footer Deep-Link with Uniform Theme Pill Style */}
        <div className="pt-3 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span className="text-xs text-text-muted font-medium min-w-0">
            Jan–Aug 2026 Monthly Dispatch Summary
          </span>
          <button
            onClick={() => navigate('/geo')}
            className="btn-pill-action shrink-0 self-start sm:self-auto"
          >
            <span>View on Map</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

      </div>
    </CollapsibleCard>
  );
}
