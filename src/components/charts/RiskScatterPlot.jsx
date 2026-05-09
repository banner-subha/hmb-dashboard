import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="glass-card p-3 shadow-xl border-border-accent">
        <p className="font-bold text-text-primary text-sm mb-2">{data.name}</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Volume:</span>
            <span className="font-medium text-text-primary">{data.volume.toFixed(1)} MT</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">MoM:</span>
            <span className={`font-medium ${data.mom >= 0 ? 'text-severity-none' : 'text-severity-critical'}`}>
              {data.mom >= 0 ? '+' : ''}{data.mom.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-border mt-1">
            <span className="text-text-muted">Risk Score:</span>
            <span className="font-bold" style={{ color: getRiskColor(data.riskScore) }}>
              {data.riskScore}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const getRiskColor = (score) => {
  if (score >= 70) return '#ef4444'; // CRITICAL
  if (score >= 40) return '#f97316'; // HIGH
  return '#22c55e'; // LOW
};

export default function RiskScatterPlot({ data, height = 300 }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  // Map data to x=Volume, y=Risk Score
  const chartData = data.map(item => ({
    ...item,
    volume: item.cur,
    name: item.client || item.district || item.state,
  })).filter(d => d.volume > 0 || d.prev > 0);

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
            dataKey="riskScore" 
            name="Risk Score" 
            stroke="#475569" 
            fontSize={11}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#475569' }} />
          <Scatter data={chartData} name="Risk">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getRiskColor(entry.riskScore)} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
