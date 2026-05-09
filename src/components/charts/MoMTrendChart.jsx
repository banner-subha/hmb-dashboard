import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3 shadow-xl border-border-accent">
        <p className="font-bold text-text-primary text-sm mb-2">{label}</p>
        <div className="space-y-1 text-xs">
          {payload.map((entry, index) => (
            <div key={index} className="flex justify-between gap-4">
              <span className="text-text-muted">{entry.name}:</span>
              <span className="font-medium" style={{ color: entry.color }}>{entry.value.toFixed(1)} MT</span>
            </div>
          ))}
          {payload.length === 2 && (
            <div className="flex justify-between gap-4 pt-1 border-t border-border mt-1">
              <span className="text-text-muted">MoM:</span>
              <span className={`font-bold ${payload[1].payload.mom >= 0 ? 'text-severity-none' : 'text-severity-critical'}`}>
                {payload[1].payload.mom >= 0 ? '▲' : '▼'} {Math.abs(payload[1].payload.mom).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export default function MoMTrendChart({ data, nameKey = "name", height = 300 }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  return (
    <div style={{ height: `${height}px`, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
          <XAxis dataKey={nameKey} stroke="#475569" fontSize={11} tickMargin={10} />
          <YAxis stroke="#475569" fontSize={11} tickFormatter={(val) => `${val}`} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#0a0f1e' }} />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '10px' }} />
          <Bar dataKey="prev" name="Previous" fill="#475569" radius={[2, 2, 0, 0]} maxBarSize={40} />
          <Bar dataKey="cur" name="Current" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
