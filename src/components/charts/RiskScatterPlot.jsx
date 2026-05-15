import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { calculateMoM, getTrendColor, formatTrend, getSeverityLevel, getSeverityTheme } from '../../utils/trendEngine';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const sev = data._severity;
    const trendColor = data._trendColor;
    
    return (
      <div 
        className="glass-card p-4 shadow-2xl transition-all"
        style={{
          borderColor: sev.border,
          boxShadow: sev.shadow,
          borderLeft: `4px solid ${sev.color}`,
          background: 'rgba(15, 23, 42, 0.95)'
        }}
      >
        <p className="font-bold text-text-primary text-sm mb-3">{data.name}</p>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-6">
            <span className="text-text-muted">Volume:</span>
            <span className="font-medium text-text-primary">{data.volume.toFixed(1)} MT</span>
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
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  const chartData = data.map(item => {
    const mom = calculateMoM(item.cur, item.prev);
    const trendColor = getTrendColor(mom, item.cur, item.prev);
    const trendDisplay = formatTrend(mom);
    const impactScore = item.impactScore ?? item.riskScore ?? 0;
    const sevLevel = getSeverityLevel(impactScore);
    const severity = getSeverityTheme(sevLevel);

    return {
      ...item,
      volume: item.cur,
      impactScore,
      name: item.client || item.district || item.state,
      _mom: mom,
      _severity: severity,
      _trendColor: trendColor,
      _trendDisplay: trendDisplay,
    };
  }).filter(d => d.volume > 0 || d.prev > 0);

  return (
    <div style={{ height: `${height}px`, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis 
            type="number" 
            dataKey="volume" 
            name="Volume" 
            stroke="#475569" 
            fontSize={11}
            tickFormatter={(val) => `${val} MT`}
          />
          <YAxis 
            type="number" 
            dataKey="impactScore" 
            name="Impact Score" 
            stroke="#475569" 
            fontSize={11}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#475569' }} />
          <Scatter data={chartData} name="Impact">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry._severity.color} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
