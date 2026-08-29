import React, { useMemo, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import CollapsibleCard from './CollapsibleCard';
import { formatMT } from '../../utils/formatters';
import { useDebouncedResize } from '../../hooks/useDebouncedResize';
import { useChartVisible } from '../../hooks/useChartVisible';
import { Layers } from 'lucide-react';

const REGION_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#8b5cf6', '#06b6d4'];
const OTHERS_COLOR = '#64748b';

const BacklogTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="chart-tooltip p-3">
        <p className="font-bold text-text-primary text-sm mb-1">{d.name}</p>
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Pending:</span>
            <span className="font-bold text-text-primary">{formatMT(d.value)} MT</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-muted">Share of backlog:</span>
            <span className="font-bold" style={{ color: d.color }}>{d.computedShare}%</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

function BacklogRegionCard({ data }) {
  const navigate = useNavigate();
  const chartRef = useRef(null);
  const [sliceHovered, setSliceHovered] = useState(false);
  const { width: chartWidth } = useDebouncedResize(chartRef, 150);
  const isVisible = useChartVisible(chartRef);

  const { slices, total, topState, topShare, estimated } = useMemo(() => {
    const states = (data?.states || []).filter(s => (s.pendingQty || 0) > 0);
    let totalVal = states.reduce((sum, s) => sum + (s.pendingQty || 0), 0);

    let source = states.map(s => ({ name: s.state, value: s.pendingQty }));
    let est = false;

    // Legacy/sample payload without per-state pending totals: use the
    // month-bucketed pending history as an estimate.
    if (totalVal <= 0) {
      source = (data?.states || []).map(s => {
        const histSum = Object.values(s.pendingHistory || {}).reduce((a, v) => a + (v || 0), 0);
        return { name: s.state, value: histSum };
      }).filter(s => s.value > 0);
      totalVal = source.reduce((sum, s) => sum + s.value, 0);
      est = totalVal > 0;
    }

    if (totalVal <= 0) return { slices: [], total: 0, topState: null, topShare: 0, estimated: false };

    source.sort((a, b) => b.value - a.value);
    const top = source.slice(0, 5);
    const rest = source.slice(5).reduce((sum, s) => sum + s.value, 0);
    const items = top.map((s, i) => ({ ...s, color: REGION_COLORS[i % REGION_COLORS.length] }));
    if (rest > 0) items.push({ name: 'Other Regions', value: rest, color: OTHERS_COLOR });

    const withShare = items.map(s => ({ ...s, computedShare: Math.round((s.value / totalVal) * 100) }));
    return {
      slices: withShare,
      total: totalVal,
      topState: source[0]?.name || null,
      topShare: Math.round((source[0]?.value / totalVal) * 100),
      estimated: est,
    };
  }, [data]);

  if (!slices.length) return null;

  return (
    <CollapsibleCard
      title="Backlog by Region"
      badge={
        <span className="text-xs font-mono font-bold px-3 py-0.5 rounded-full shadow-xs badge-theme-amber">
          {formatMT(total)}
        </span>
      }
      accentColor="#f97316"
    >
      <div className="space-y-2.5 py-0.5">
        <div ref={chartRef} className="relative w-full" style={{ height: '180px' }} onMouseLeave={() => setSliceHovered(false)}>
          {chartWidth > 0 && (
            <PieChart width={chartWidth} height={180} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={isVisible}
                animationDuration={500}
                animationEasing="ease-out"
                onMouseEnter={() => setSliceHovered(true)}
                onMouseLeave={() => setSliceHovered(false)}
              >
                {slices.map((entry, idx) => (
                  <Cell
                    key={`slice-${idx}`}
                    fill={entry.color}
                    className="cursor-pointer"
                    onClick={() => entry.name !== 'Other Regions' && navigate(`/states?state=${encodeURIComponent(entry.name)}`)}
                  />
                ))}
              </Pie>
              <Tooltip content={<BacklogTooltip />} isAnimationActive={false} wrapperClassName="!z-10" />
            </PieChart>
          )}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5 transition-opacity duration-150 ${sliceHovered ? 'opacity-0' : 'opacity-100'}`}
          >
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest leading-none">Open Backlog</span>
            <span className="text-base sm:text-lg font-black text-text-primary font-mono leading-none">{Math.round(total).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            <span className="text-[9px] font-bold text-text-muted leading-none">MT</span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1">
          {slices.map(s => (
            <div
              key={s.name}
              className={`flex items-center gap-1.5 text-[11px] ${s.name !== 'Other Regions' ? 'cursor-pointer hover:opacity-80' : ''}`}
              onClick={() => s.name !== 'Other Regions' && navigate(`/states?state=${encodeURIComponent(s.name)}`)}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-text-muted font-semibold">{s.name}</span>
              <span className="font-mono font-bold text-text-primary">{s.computedShare}%</span>
            </div>
          ))}
        </div>

        {topState && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-bg-secondary/60 border border-border/40">
            <Layers className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
            <span className="text-[12px] text-text-secondary leading-snug">
              <strong className="text-text-primary">{topState}</strong> carries <strong className="text-text-primary">{topShare}%</strong> of all unfulfilled orders — clear this region's queue first to release the widest share of stuck volume.
              {estimated && <span className="text-text-muted italic"> (estimated from order month)</span>}
            </span>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}

export default React.memo(BacklogRegionCard);
