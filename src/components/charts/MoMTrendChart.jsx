import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { calculateMoM } from '../../utils/trendEngine';
import { useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';
import { formatNumber } from '../../utils/formatters';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip p-3">
        <p className="font-bold text-text-primary text-sm mb-2">{label}</p>
        <div className="space-y-1 text-xs">
          {payload.map((entry, index) => (
            <div key={index} className="flex justify-between gap-4">
              <span className="text-text-muted">{entry.name}:</span>
              <span className="font-medium" style={{ color: entry.color }}>{formatNumber(entry.value)} MT</span>
            </div>
          ))}
          {payload.length === 2 && (() => {
            const d = payload[1].payload;
            const mom = calculateMoM(d.cur ?? d.cur_mt ?? 0, d.prev ?? d.prev_mt ?? 0);
            return (
            <div className="flex justify-between gap-4 pt-1 border-t border-border mt-1">
              <span className="text-text-muted">MoM:</span>
              <span className={`font-bold ${mom > 0 ? 'text-severity-none' : mom < 0 ? 'text-severity-critical' : 'text-text-muted'}`}>
                {mom > 0 ? '↑' : mom < 0 ? '↓' : ''} {mom.toFixed(1)}%
              </span>
            </div>
            );
          })()}
        </div>
      </div>
    );
  }
  return null;
};

export default function MoMTrendChart({ data, nameKey = "name", height = 300 }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  return (
    <div ref={containerRef} className="animate-fade-in" style={{ height: `${height}px`, width: '100%' }}>
      {width > 0 && (
        <BarChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey={nameKey} stroke="var(--color-text-dim)" fontSize={12} tickMargin={12} />
          <YAxis stroke="var(--color-text-dim)" fontSize={12} tickFormatter={(val) => `${val}`} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#0a0f1e' }} isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--color-text-muted)', paddingTop: '12px' }} />
          <Bar dataKey="prev" name="Previous" fill="var(--color-text-dim)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={true} animationDuration={500} animationEasing="ease-out" />
          <Bar dataKey="cur" name="Current" fill="var(--color-accent-blue)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={true} animationDuration={600} animationEasing="ease-out" />
        </BarChart>
      )}
    </div>
  );
}
