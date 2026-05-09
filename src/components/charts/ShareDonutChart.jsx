import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_COLORS } from '../../utils/constants';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="glass-card p-3 shadow-xl border-border-accent">
        <p className="font-bold text-text-primary text-sm mb-1">{data.name || data.product}</p>
        <div className="text-xs">
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-text-muted">Volume:</span>
            <span className="font-medium text-text-primary">{data.value.toFixed(1)} MT</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Share:</span>
            <span className="font-medium text-accent-blue">{data.share}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function ShareDonutChart({ data, dataKey = "cur", nameKey = "product", height = 300 }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  // Filter out 0 values and map for recharts
  const chartData = data
    .filter(item => item[dataKey] > 0)
    .map(item => ({
      ...item,
      value: item[dataKey],
      name: item[nameKey]
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{ height: `${height}px`, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={36} 
            iconType="circle"
            wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
