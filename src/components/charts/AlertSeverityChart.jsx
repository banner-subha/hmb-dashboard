import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { SEVERITY_CONFIG } from '../../utils/constants';
import { getBusinessImpact } from '../../utils/trendEngine';
import { useMemo, useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';
import { ShieldAlert, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const config = SEVERITY_CONFIG[data.name] || SEVERITY_CONFIG.NONE;
    return (
      <div className="chart-tooltip p-2.5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }}></span>
          <span className="font-bold text-text-primary text-xs">{data.name} Risk</span>
        </div>
        <div className="text-xs">
          <span className="text-text-muted">Count: </span>
          <span className="font-bold text-text-primary">{data.value} Alerts</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function AlertSeverityChart({ alerts, height = 210 }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);

  const chartData = useMemo(() => {
    if (!alerts || alerts.length === 0) return [];
    const counts = alerts.reduce((acc, alert) => {
      const cur = alert.data?.cur ?? alert.cur ?? 0;
      const prev = alert.data?.prev ?? alert.prev ?? 0;
      const sev = getBusinessImpact(cur, prev).severity;
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});

    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
    return Object.keys(counts).map(severity => ({
      name: severity,
      value: counts[severity]
    })).sort((a, b) => order[a.name] - order[b.name]);
  }, [alerts]);

  const totalAlerts = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);

  if (!alerts || alerts.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-xs py-8">No active alerts recorded</div>;
  }

  return (
    <div className="flex flex-col justify-between h-full space-y-2.5">
      <div ref={containerRef} className="animate-fade-in" style={{ height: `${height}px`, width: '100%' }}>
        {width > 0 && (
          <PieChart width={width} height={height}>
            <Pie
              data={chartData}
              cx="50%"
              cy="48%"
              innerRadius={36}
              outerRadius={65}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
              isAnimationActive={true}
              animationDuration={700}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={(SEVERITY_CONFIG[entry.name] || SEVERITY_CONFIG.NONE).color} 
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
            <Legend 
              verticalAlign="bottom" 
              height={36} 
              iconType="circle"
              wrapperStyle={{ fontSize: '11px', color: 'var(--color-text-muted)' }}
            />
          </PieChart>
        )}
      </div>

      {/* Severity Breakdown Summary Grid (Fills Room Cleanly) */}
      <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-border/40 text-center">
        {chartData.slice(0, 3).map(item => {
          const config = SEVERITY_CONFIG[item.name] || SEVERITY_CONFIG.NONE;
          return (
            <div key={item.name} className="p-1.5 rounded bg-bg-secondary/50 border border-border/30">
              <div className="text-[10px] font-semibold text-text-muted uppercase truncate">{item.name}</div>
              <div className="text-xs font-black" style={{ color: config.color }}>{item.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
