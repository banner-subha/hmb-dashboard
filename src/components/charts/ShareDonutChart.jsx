import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { PRODUCT_COLORS, PRODUCT_LABELS } from '../../utils/constants';
import { useMemo, useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';
import { useChartVisible } from '../../hooks/useChartVisible';
import { formatMT } from '../../utils/formatters';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const productName = data.name || data.product;
    const displayName = PRODUCT_LABELS[productName] || productName;
    const prodColor = PRODUCT_COLORS[productName] || '#94a3b8';
    return (
      <div className="chart-tooltip p-3">
        <p className="font-bold text-text-primary text-sm mb-1">
          {displayName} {data.isFallback && ' (Prev Period)'}
        </p>
        <div className="text-xs">
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-text-muted">{data.isFallback ? 'Prev Volume:' : 'Volume:'}</span>
            <span className="font-medium text-text-primary">{formatMT(data.value)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Share:</span>
            <span className="font-bold" style={{ color: prodColor }}>{data.computedShare}%</span>
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
  const isVisible = useChartVisible(containerRef);

  const activeWidth = width > 0 
    ? width 
    : (containerRef.current?.getBoundingClientRect?.()?.width || containerRef.current?.clientWidth || containerRef.current?.parentElement?.clientWidth || 320);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    let totalValue = data.reduce((sum, item) => sum + (item[dataKey] > 0 ? item[dataKey] : 0), 0);
    let isFallback = false;
    let activeDataKey = dataKey;

    if (totalValue === 0 && dataKey === 'cur') {
      const totalPrev = data.reduce((sum, item) => sum + (item.prev > 0 ? item.prev : 0), 0);
      if (totalPrev > 0) {
        totalValue = totalPrev;
        activeDataKey = 'prev';
        isFallback = true;
      }
    }

    return data
      .filter(item => item[activeDataKey] > 0)
      .map(item => ({
        ...item,
        value: item[activeDataKey],
        name: item[nameKey],
        computedShare: item.share !== undefined && !isFallback 
          ? item.share 
          : (totalValue > 0 ? ((item[activeDataKey] / totalValue) * 100).toFixed(1) : 0),
        isFallback
      }))
      .sort((a, b) => b.value - a.value);
  }, [data, dataKey, nameKey]);

  if (!data || data.length === 0 || chartData.length === 0) {
    return (
      <div 
        ref={containerRef} 
        className="flex items-center justify-center text-text-muted text-xs border border-dashed border-border/40 rounded-xl"
        style={{ height: `${height}px`, width: '100%' }}
      >
        No product breakdown available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="animate-fade-in w-full" style={{ height: `${height}px`, minHeight: `${height}px` }}>
      {activeWidth > 0 && (
        <PieChart width={activeWidth} height={height}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius="50%"
            outerRadius="80%"
            paddingAngle={2}
            dataKey="value"
            stroke="none"
            isAnimationActive={isVisible}
            animationDuration={500}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => {
              const fillColor = PRODUCT_COLORS[entry.name] || '#94a3b8';
              return (
                <Cell 
                  key={`cell-${index}`} 
                  fill={fillColor} 
                  opacity={entry.isFallback ? 0.55 : 0.95} 
                />
              );
            })}
          </Pie>
          <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
          <Legend 
            verticalAlign="bottom" 
            height={44} 
            iconType="circle"
            wrapperStyle={{ fontSize: '12px', color: 'var(--color-text-muted)', paddingTop: '16px' }}
          />
        </PieChart>
      )}
    </div>
  );
}
