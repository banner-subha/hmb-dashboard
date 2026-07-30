import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { calculateMoM, getTrendColor, formatTrend, getSeverityTheme } from '../../utils/trendEngine';
import { useMemo, useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';
import { formatMT } from '../../utils/formatters';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const sev = data._severity;
    const trendColor = data._trendColor;
    
    return (
      <div 
        className="chart-tooltip p-4"
        style={{
          borderLeft: `4px solid ${sev.color}`,
        }}
      >
        <p className="font-bold text-text-primary text-sm mb-3">{data.name}</p>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-6">
            <span className="text-text-muted">Volume:</span>
            <span className="font-medium text-text-primary">{formatMT(data.volume)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-text-muted">MoM:</span>
            <span className="font-bold" style={{ color: trendColor }}>
              {data._trendDisplay}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-text-muted">Impact Score:</span>
            <span className="font-bold" style={{ color: sev.color }}>
              {Math.round(data.impactScore)}
            </span>
          </div>
          <div className="flex justify-between gap-6 pt-2 border-t border-border/50 mt-2 items-center">
            <span className="text-text-muted">Severity:</span>
            <span 
              className="font-bold px-2 py-0.5 rounded text-[10px] tracking-wider uppercase"
              style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}
            >
              {sev.severity}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function RiskScatterPlot({ data, height = 300 }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(item => {
      const mom = calculateMoM(item.cur, item.prev);
      const trendColor = getTrendColor(mom, item.cur, item.prev);
      const trendDisplay = formatTrend(mom);
      const severity = getSeverityTheme(item.impactTier);

      return {
        ...item,
        volume: item.cur,
        impactScore: item.impactScore || 0,
        name: item.client || item.district || item.state,
        _mom: mom,
        _severity: severity,
        _trendColor: trendColor,
        _trendDisplay: trendDisplay,
      };
    }).filter(d => d.volume > 0 || d.prev > 0);
  }, [data]);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  return (
    <div ref={containerRef} className="animate-fade-in" style={{ height: `${height}px`, width: '100%' }}>
      {width > 0 && (
        <ScatterChart 
          width={width} 
          height={height} 
          margin={{ top: 10, right: 10, bottom: 10, left: -20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis 
            type="number" 
            dataKey="volume" 
            name="Volume" 
            stroke="var(--color-text-dim)" 
            fontSize={12}
            tickFormatter={(val) => `${val} MT`}
          />
          <YAxis 
            type="number" 
            dataKey="impactScore" 
            name="Impact Score" 
            stroke="var(--color-text-dim)" 
            fontSize={12}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#475569' }} isAnimationActive={false} />
          <Scatter data={chartData} name="Impact" isAnimationActive={true} animationDuration={700} animationEasing="ease-out">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry._severity.color} />
            ))}
          </Scatter>
        </ScatterChart>
      )}
    </div>
  );
}
