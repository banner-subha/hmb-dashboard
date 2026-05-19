import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { SEVERITY_CONFIG } from '../../utils/constants';
import { getBusinessImpact } from '../../utils/trendEngine';
import { useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const config = SEVERITY_CONFIG[data.name] || SEVERITY_CONFIG.NONE;
    return (
      <div className="chart-tooltip p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }}></span>
          <span className="font-bold text-text-primary text-sm">{data.name}</span>
        </div>
        <div className="text-xs">
          <span className="text-text-muted">Count: </span>
          <span className="font-medium text-text-primary">{data.value} Alerts</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function AlertSeverityChart({ alerts, height = 250 }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);

  if (!alerts || alerts.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No alerts available</div>;
  }

  // Aggregate alerts by severity
  const counts = alerts.reduce((acc, alert) => {
    const cur = alert.data?.cur ?? alert.cur ?? 0;
    const prev = alert.data?.prev ?? alert.prev ?? 0;
    const sev = getBusinessImpact(cur, prev).severity;
    acc[sev] = (acc[sev] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.keys(counts).map(severity => ({
    name: severity,
    value: counts[severity]
  })).sort((a, b) => {
    // Sort by SEVERITY_ORDER
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
    return order[a.name] - order[b.name];
  });

  return (
    <div ref={containerRef} style={{ height: `${height}px`, width: '100%' }}>
      {width > 0 && (
        <PieChart width={width} height={height}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={(SEVERITY_CONFIG[entry.name] || SEVERITY_CONFIG.NONE).color} 
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={36} 
            iconType="circle"
            wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }}
          />
        </PieChart>
      )}
    </div>
  );
}
