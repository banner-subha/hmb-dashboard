import React, { useMemo } from 'react';
import CollapsibleCard from './CollapsibleCard';
import { formatMT, formatDays } from '../../utils/formatters';
import { PRODUCT_COLORS, PRODUCT_LABELS } from '../../utils/constants';
import { AGING_BUCKETS, getEntityAging, agingTotal, oldestBacklogLabel } from '../../utils/backlogAging';
import { Clock, Layers, CalendarX2 } from 'lucide-react';

const STANDARD_PRODUCTS = ['IG', 'GI', 'IGG', 'P', 'SS', 'RS'];

function BacklogClearanceCard({ data }) {
  const pendingTotal = data?.pendingTotal || 0;
  const products = data?.products || [];
  const dataAsOf = data?.meta?.dataAsOfDate || data?.dataAsOfDate || null;

  // Backlog ageing: prefer day-precise backend buckets (scope-aligned by
  // DataContext), else estimate from monthly pendingHistory.
  const aging = useMemo(() => {
    if (data?.pendingAgeTotal && Object.values(data.pendingAgeTotal).some(v => v > 0)) {
      return { buckets: data.pendingAgeTotal, estimated: false };
    }
    const empty = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, unknown: 0 };
    const source = (data?.states && data.states.length > 0) ? data.states : (data?.districts || []);
    let hasData = false;
    const sum = source.reduce((acc, e) => {
      const { aging: a } = getEntityAging(e, dataAsOf);
      if (agingTotal(a) > 0) hasData = true;
      Object.keys(acc).forEach(k => { acc[k] += (a[k] || 0); });
      return acc;
    }, { ...empty });
    if (!hasData || agingTotal(sum) <= 0) return null;
    Object.keys(sum).forEach(k => { sum[k] = Math.round(sum[k] * 100) / 100; });
    return { buckets: sum, estimated: !data?.pendingAgeTotal };
  }, [data?.pendingAgeTotal, data?.states, data?.districts, dataAsOf]);

  const oldest = useMemo(() => {
    if (data?.oldestPendingDate) return oldestBacklogLabel(data.oldestPendingDate, dataAsOf);
    return null;
  }, [data?.oldestPendingDate, dataAsOf]);

  const agedOver90 = aging ? (aging.buckets.d90plus || 0) : 0;

  // Calculate clearance estimate (honest 0 when capacity data is missing —
  // never fabricate a default daily rate)
  const dailyAvg = data?.dailyAvgQty || (data?.operationalContext?.overall_performance?.daily_avg_qty) || 0;
  const clearanceDays = dailyAvg > 0 ? (pendingTotal / dailyAvg) : 0;
  const backlogLoadRatio = (dailyAvg * 30 > 0) ? Math.round((pendingTotal / (dailyAvg * 30)) * 100) / 100 : 0;

  // Ensure all 6 products are displayed
  const all6Products = useMemo(() => {
    const backlogMap = new Map();

    products.forEach(p => {
      const code = p.product?.toUpperCase();
      const qty = p.pendingQty || p.pending_qty || 0;
      backlogMap.set(code, {
        product: code,
        label: PRODUCT_LABELS[code] || p.label || code,
        pendingQty: qty
      });
    });

    return STANDARD_PRODUCTS.map(code => {
      const existing = backlogMap.get(code);
      const qty = existing ? existing.pendingQty : 0;
      return {
        product: code,
        label: PRODUCT_LABELS[code] || code,
        pendingQty: qty,
        shareOfBacklog: pendingTotal > 0 ? Math.round((qty / pendingTotal) * 100) : 0
      };
    }).sort((a, b) => b.pendingQty - a.pendingQty);
  }, [products, pendingTotal]);

  if (!data) return null;

  return (
    <CollapsibleCard 
      title="Pending Orders" 
      badge={
        <span className="text-xs font-mono font-bold px-3 py-0.5 rounded-full shadow-xs badge-theme-amber">
          {formatMT(pendingTotal)}
        </span>
      }
      accentColor="#f97316"
    >
      <div className="space-y-3.5 py-0.5">
        
        {/* Estimated Clearance Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 shadow-xs shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-text-muted uppercase tracking-wide">Est. Clearance Time</div>
              <div className="text-xl sm:text-2xl font-black text-text-primary mt-0.5 tracking-tight leading-tight">
                {clearanceDays > 0 ? formatDays(clearanceDays) : (pendingTotal > 0 ? 'Capacity data unavailable' : 'No orders waiting')}
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30">
            <div className="text-xs font-bold text-text-muted uppercase tracking-wide">Daily Shipping Capacity</div>
            <div className="text-base sm:text-lg font-black text-secondary font-mono mt-0.5">{dailyAvg > 0 ? `${formatMT(dailyAvg)} / day` : '—'}</div>
          </div>
        </div>

        {/* Backlog Age Profile */}
        {aging && pendingTotal > 0 && (() => {
          const total = agingTotal(aging.buckets);
          return (
            <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/60 border border-border/50 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-text-primary uppercase tracking-wide">Backlog Age Profile</div>
                {oldest && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-500 whitespace-nowrap" title={`Oldest unfulfilled order placed ${oldest.label}`}>
                    <CalendarX2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Oldest: {oldest.ageStr}</span>
                  </div>
                )}
              </div>
              <div className="flex w-full h-2.5 rounded-full overflow-hidden border border-border/40 bg-bg-primary/80">
                {AGING_BUCKETS.map(b => {
                  const val = aging.buckets[b.key] || 0;
                  const pct = total > 0 ? (val / total) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={b.key}
                      className={`h-full ${b.colorClass} transition-all duration-300`}
                      style={{ width: `${Math.max(pct, 1.5)}%` }}
                      title={`${b.fullLabel}: ${formatMT(val)} MT (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {AGING_BUCKETS.map(b => (
                  <div key={b.key} className="flex items-center gap-1.5 text-[11px]">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${b.colorClass}`} />
                    <span className="text-text-muted font-semibold">{b.label}</span>
                    <span className="font-mono font-bold text-text-primary">{formatMT(aging.buckets[b.key] || 0)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <span className={`text-[11px] font-bold ${agedOver90 > 0 ? 'text-severity-critical' : 'text-text-muted'}`}>
                  {agedOver90 > 0 ? `${formatMT(agedOver90)} MT awaiting over 90 days` : 'No order older than 90 days'}
                </span>
                {aging.estimated && <span className="text-[10px] text-text-muted italic">month-level estimate</span>}
              </div>
            </div>
          );
        })()}

        {/* Product Backlog Distribution (All 6 Products) */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/60 border border-border/50 space-y-2 shadow-xs">
          <div className="text-xs font-bold text-text-primary uppercase tracking-wide pb-0.5">
            Waiting Orders by Product
          </div>
          <div className="space-y-1.5">
            {all6Products.map(p => {
              const color = PRODUCT_COLORS[p.product] || '#3b82f6';
              return (
                <div key={p.product} className="space-y-0.5">
                  <div className="flex justify-between items-center text-xs gap-2">
                    <div className="flex items-center gap-2 font-semibold text-text-primary min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="truncate" title={p.label}>{p.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-bold font-mono text-xs sm:text-[13px] ${p.pendingQty > 0 ? 'text-text-primary' : 'text-text-muted'}`}>
                        {formatMT(p.pendingQty)}
                      </span>
                      <span className="text-[11px] text-text-muted font-mono w-7 text-right">{p.shareOfBacklog}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-bg-primary/80 overflow-hidden border border-border/40">
                    <div 
                      className="h-full rounded-full transition-all duration-300 shadow-sm"
                      style={{ 
                        width: `${p.pendingQty > 0 ? Math.max(3, p.shareOfBacklog) : 0}%`,
                        backgroundColor: color 
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Backlog Capacity Load Ratio Footer Box */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3.5 sm:p-4 rounded-xl bg-bg-secondary/50 border border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">Queue Pressure Ratio</div>
              <div className="text-base sm:text-lg font-black text-text-primary mt-0.5 leading-tight">
                {dailyAvg > 0 ? `${backlogLoadRatio}x Monthly Volume` : '—'}
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wide">Product Types in Queue</div>
            <div className="text-base sm:text-lg font-black text-amber-500 font-mono mt-0.5 leading-tight whitespace-nowrap">
              6 Products
            </div>
          </div>
        </div>

      </div>
    </CollapsibleCard>
  );
}

export default React.memo(BacklogClearanceCard);
