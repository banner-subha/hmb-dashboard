import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    // Use backend-provided displayColor with neutral fallback
    const color = data.displayColor || '#6b7280';
    
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
            <span className={`font-medium ${data.mom >= 75 ? 'text-severity-none' : 'text-severity-critical'}`}>
              {data.mom.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-border mt-1">
            <span className="text-text-muted">Impact Score:</span>
            <span className="font-bold" style={{ color }}>
              {data.impactScore}
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

  // Map data to x=Volume, y=Impact Score
  const chartData = data.map(item => ({
    ...item,
    volume: item.cur,
    impactScore: item.impactScore ?? item.riskScore ?? 0,
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
            dataKey="impactScore" 
            name="Impact Score" 
            stroke="#475569" 
            fontSize={11}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#475569' }} />
          <Scatter data={chartData} name="Impact">
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.displayColor || '#6b7280'} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
