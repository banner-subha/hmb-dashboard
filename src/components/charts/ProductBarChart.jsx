import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { calculateMoM, getBusinessImpact, getTrendColor, formatTrend } from '../../utils/trendEngine';
import { PRODUCT_COLORS, PRODUCT_LABELS } from '../../utils/constants';
import { useMemo, useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';
import { useChartVisible } from '../../hooks/useChartVisible';
import { formatMT } from '../../utils/formatters';
import ImpactBadge from '../common/ImpactBadge';

// Tooltip using global ImpactBadge
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const trendColor = data._trendColor;
  const trendDisplay = data._trendDisplay;
  const fullLabel = PRODUCT_LABELS[data.product] || data.label || data.product;

  return (
    <div className="chart-tooltip p-3.5 min-w-[220px] space-y-2.5">
      <p className="font-bold text-text-primary text-sm leading-tight">
        {fullLabel}
      </p>

      {/* Impact badge — uses global ImpactBadge, same shape/color as alerts */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/30">
        <span className="text-text-muted text-xs font-medium">Impact</span>
        <ImpactBadge cur={data.cur_mt} prev={data.prev_mt} />
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-text-muted">Current</span>
          <span className="font-semibold text-text-primary font-mono">{formatMT(data.cur_mt)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-text-muted">Previous</span>
          <span className="font-medium text-text-secondary font-mono">{formatMT(data.prev_mt)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1.5 border-t border-border/20">
          <span className="text-text-muted">MoM</span>
          <span className="font-bold font-mono" style={{ color: trendColor }}>{trendDisplay}</span>
        </div>
      </div>
    </div>
  );
};

// Gradual dark-to-light blue descending spectrum for ranked volume bars
const BLUE_DESCENDING_PALETTE = [
  '#1D4ED8', // Deep Royal Blue (Top Volume)
  '#2563EB', // Royal Blue
  '#3B82F6', // Electric Blue
  '#60A5FA', // Sky Blue
  '#38BDF8', // Cyan Blue
  '#7DD3FC', // Light Ice Blue
  '#BAE6FD', // Pale Crystal Blue
];

export default function ProductBarChart({ data, height = 300 }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);
  const isVisible = useChartVisible(containerRef);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(d => {
      const cur = d.cur_mt !== undefined ? d.cur_mt : (d.cur ?? 0);
      const prev = d.prev_mt !== undefined ? d.prev_mt : (d.prev ?? 0);
      const mom = calculateMoM(cur, prev);
      const severity = getBusinessImpact(cur, prev).theme;
      const trendColor = getTrendColor(mom, cur, prev);
      const trendDisplay = formatTrend(mom);
      return {
        ...d,
        cur_mt: cur,
        prev_mt: prev,
        share_pct: d.share_pct !== undefined ? d.share_pct : d.share,
        _mom: mom,
        _severity: severity,
        _trendColor: trendColor,
        _trendDisplay: trendDisplay,
      };
    }).sort((a, b) => b.cur_mt - a.cur_mt);
  }, [data]);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  return (
    <div ref={containerRef} className="animate-fade-in" style={{ height: `${height}px`, width: '100%' }}>
      {width > 0 && (
        <BarChart
          width={width}
          height={height}
          data={chartData}
          layout="vertical"
          barCategoryGap="20%"
          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.25} />
          <XAxis
            type="number"
            stroke="var(--color-text-dim)"
            fontSize={12}
            tickFormatter={(val) => `${val} MT`}
          />
          <YAxis
            dataKey="product"
            type="category"
            stroke="var(--color-text-muted)"
            fontSize={12}
            fontWeight={700}
            width={48}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'var(--color-chart-cursor)' }}
            isAnimationActive={false}
          />
          <Bar
            dataKey="cur_mt"
            radius={[0, 16, 16, 0]}
            maxBarSize={24}
            background={{ fill: 'var(--color-bg-secondary)', radius: [0, 16, 16, 0] }}
            isAnimationActive={isVisible}
            animationDuration={500}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={BLUE_DESCENDING_PALETTE[index % BLUE_DESCENDING_PALETTE.length] || PRODUCT_COLORS[entry.product] || '#3B82F6'}
              />
            ))}
          </Bar>
        </BarChart>
      )}
    </div>
  );
}
