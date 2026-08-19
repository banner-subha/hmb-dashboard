import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useRef } from 'react';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';
import { formatNumber } from '../../utils/formatters';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    const vol = item.volume ?? item.cur ?? 0;
    const mom = item.mom;

    return (
      <div className="chart-tooltip p-3 bg-bg-card border border-border/80 rounded-xl shadow-xl backdrop-blur-md">
        <p className="font-bold text-text-primary text-xs mb-1.5">{label || item.monthLabel}</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between items-center gap-4">
            <span className="text-text-muted">Shipped:</span>
            <span className="font-extrabold text-text-primary">{formatNumber(vol)} MT</span>
          </div>
          {mom !== undefined && mom !== null && (
            <div className="flex justify-between items-center gap-4 pt-1 border-t border-border/40 mt-1">
              <span className="text-text-muted">Change vs Last Month:</span>
              <span className={`font-bold ${mom > 0 ? 'text-green-500' : mom < 0 ? 'text-red-500' : 'text-text-muted'}`}>
                {mom > 0 ? '↑ +' : mom < 0 ? '↓ ' : ''}{Number(mom).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Custom Distinct & Visible Gradient Cursor Line for Area Chart
const GradientCursor = (props) => {
  const { points, x, width, height, top = 6, bottom } = props;
  let posX = null;
  let startY = 6;
  let endY = 180;

  if (points && points.length >= 2) {
    posX = points[0].x;
    startY = points[0].y;
    endY = points[1].y;
  } else if (points && points.length === 1) {
    posX = points[0].x;
    startY = top;
    endY = bottom !== undefined ? bottom : (height ? top + height : 180);
  } else if (x !== undefined && x !== null) {
    posX = width ? x + width / 2 : x;
    startY = top;
    endY = bottom !== undefined ? bottom : (height ? top + height : 180);
  }

  if (posX === null || posX === undefined || isNaN(posX)) return null;

  const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';

  return (
    <g className="pointer-events-none">
      {/* Soft aura line */}
      <line
        x1={posX}
        y1={startY}
        x2={posX}
        y2={endY}
        stroke={isLight ? "rgba(30, 41, 59, 0.2)" : "rgba(255, 255, 255, 0.2)"}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Main visible vertical gradient hairline */}
      <line
        x1={posX}
        y1={startY}
        x2={posX}
        y2={endY}
        stroke={isLight ? "url(#areaCursorGradientLight)" : "url(#areaCursorGradient)"}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </g>
  );
};

export default function MoMAreaTrendChart({ data, nameKey = "monthLabel", dataKey = "volume", height = 200, accentColor = "#3b82f6" }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);

  const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';

  // Darken curve stroke in light theme for crisp visibility against light cards
  let effectiveStroke = accentColor;
  if (isLight) {
    const lower = accentColor.toLowerCase();
    if (lower === '#3b82f6') effectiveStroke = '#1D6FB8';
    else if (lower === '#f59e0b') effectiveStroke = '#B45309';
    else if (lower === '#ef4444') effectiveStroke = '#B91C1C';
    else if (lower === '#10b981') effectiveStroke = '#047857';
    else effectiveStroke = '#1D6FB8';
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs py-8">
        No monthly trend data available
      </div>
    );
  }

  const gradientId = `areaGradient-${effectiveStroke.replace('#', '')}`;

  return (
    <div ref={containerRef} className="animate-fade-in w-full" style={{ height: `${height}px` }}>
      {width > 0 && (
        <AreaChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={effectiveStroke} stopOpacity={isLight ? 0.35 : 0.45} />
              <stop offset="95%" stopColor={effectiveStroke} stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="areaCursorGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.08} />
              <stop offset="30%" stopColor="#ffffff" stopOpacity={0.7} />
              <stop offset="70%" stopColor="#ffffff" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.15} />
            </linearGradient>
            <linearGradient id="areaCursorGradientLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity={0.08} />
              <stop offset="30%" stopColor="#0f172a" stopOpacity={0.7} />
              <stop offset="70%" stopColor="#0f172a" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#0f172a" stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
          <XAxis 
            dataKey={nameKey} 
            stroke="var(--color-text-muted)" 
            fontSize={11} 
            tickLine={false}
            axisLine={false}
            tickMargin={8} 
          />
          <YAxis 
            stroke="var(--color-text-muted)" 
            fontSize={10} 
            tickLine={false}
            axisLine={false}
            tickFormatter={(val) => `${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val}`} 
          />
          <Tooltip content={<CustomTooltip />} cursor={<GradientCursor />} isAnimationActive={false} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={effectiveStroke}
            strokeWidth={3}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            dot={{ r: 3.5, fill: effectiveStroke }}
            activeDot={{ r: 6, fill: effectiveStroke }}
            isAnimationActive={true}
            animationDuration={800}
          />
        </AreaChart>
      )}
    </div>
  );
}
