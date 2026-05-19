import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { PRODUCT_COLORS } from '../../utils/constants';
import { useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const productName = data.name || data.product;
    const prodColor = PRODUCT_COLORS[productName] || '#94a3b8';
    return (
      <div className="chart-tooltip p-3">
        <p className="font-bold text-text-primary text-sm mb-1">{productName}</p>
        <div className="text-xs">
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-text-muted">Volume:</span>
            <span className="font-medium text-text-primary">{data.value.toFixed(1)} MT</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Share:</span>
            <span className="font-bold" style={{ color: prodColor }}>{data.computedShare ?? data.share}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function ShareDonutChart({ data, dataKey = "cur", nameKey = "product", height = 300 }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);

  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-full text-text-muted text-sm">No data available</div>;
  }

  // Filter out 0 values, calculate total, and map for recharts
  const totalValue = data.reduce((sum, item) => sum + (item[dataKey] > 0 ? item[dataKey] : 0), 0);
  const chartData = data
    .filter(item => item[dataKey] > 0)
    .map(item => ({
      ...item,
      value: item[dataKey],
      name: item[nameKey],
      computedShare: item.share !== undefined ? item.share : (totalValue > 0 ? ((item[dataKey] / totalValue) * 100).toFixed(1) : 0)
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div ref={containerRef} style={{ height: `${height}px`, width: '100%' }}>
      {width > 0 && (
        <PieChart width={width} height={height}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius="50%"
            outerRadius="80%"
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {chartData.map((entry, index) => {
              const fillColor = PRODUCT_COLORS[entry.name] || '#94a3b8';
              return <Cell key={`cell-${index}`} fill={fillColor} />;
            })}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={40} 
            iconType="circle"
            wrapperStyle={{ fontSize: '11px', color: '#94a3b8', paddingTop: '15px' }}
          />
        </PieChart>
      )}
    </div>
  );
}
