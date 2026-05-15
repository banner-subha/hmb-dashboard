import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { calculateMoM, getSeverity, getTrendColor, formatTrend } from '../../utils/trendEngine';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const mom = data._mom;
    const sev = data._severity;
    const trendColor = data._trendColor;
    const trendDisplay = data._trendDisplay;

    return (
      <div className="glass-card p-3 shadow-xl border-border-accent">
        <p className="font-bold text-text-primary text-sm mb-2">{data.label || data.product}</p>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Impact:</span>
            <span className="font-bold" style={{ color: sev.color }}>{sev.severity}</span>
          </div>
          <div className="pt-2 border-t border-border mt-2 space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">Current:</span>
              <span className="font-medium text-text-primary">{data.cur_mt?.toFixed(1)} MT</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-text-muted">Previous:</span>
              <span className="font-medium text-text-secondary">{data.prev_mt?.toFixed(1)} MT</span>
            </div>
            <div className="flex justify-between gap-4 pt-1 border-t border-border/5 mt-1">
              <span className="text-text-muted">MoM:</span>
              <span className="font-bold" style={{ color: trendColor }}>
                {trendDisplay}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function ProductBarChart({ data, height = 300 }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  // Compute ALL derived values on the frontend from raw cur/prev
  const chartData = data.map(d => {
    const cur = d.cur_mt !== undefined ? d.cur_mt : (d.cur ?? 0);
    const prev = d.prev_mt !== undefined ? d.prev_mt : (d.prev ?? 0);
    const mom = calculateMoM(cur, prev);
    const severity = getSeverity(mom);
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
  });

  return (
    <div style={{ height: `${height}px`, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
          <XAxis type="number" stroke="#475569" fontSize={12} tickFormatter={(val) => `${val} MT`} />
          <YAxis dataKey="product" type="category" stroke="#94a3b8" fontSize={12} width={50} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#0a0f1e' }} />
          <Bar dataKey="cur_mt" radius={[0, 4, 4, 0]} maxBarSize={32}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry._severity.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
