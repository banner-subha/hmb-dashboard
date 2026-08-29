import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import CollapsibleCard from './CollapsibleCard';
import { formatMT, formatDays } from '../../utils/formatters';
import { PRODUCT_COLORS, PRODUCT_LABELS } from '../../utils/constants';
import { Clock, Activity, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

const STANDARD_PRODUCTS = ['IG', 'GI', 'IGG', 'P', 'SS', 'RS'];
const DEFAULT_TURNAROUNDS = { IG: 18.2, GI: 15.9, IGG: 5.4, P: 8.2, SS: 12.4, RS: 11.0 };

function OrderFulfillmentVelocityCard({ data, title = "Delivery Speed" }) {
  const navigate = useNavigate();
  const { dispatch } = useData();

  const totalCur = data?.totalCur || 0;
  const pendingTotal = data?.pendingTotal || 0;
  const totalBookedOrders = totalCur + pendingTotal;

  // Fulfillment conversion rate
  const fulfillmentRate = totalBookedOrders > 0
    ? Math.round((totalCur / totalBookedOrders) * 100)
    : 0;

  // Average order lead time turnaround (null = unknown, never fabricate)
  const avgPeriod = data?.avgPeriod != null
    ? data.avgPeriod
    : data?.meta?.avgPeriod != null
    ? data.meta.avgPeriod
    : data?.operationalContext?.overall_performance?.avg_period != null
    ? data.operationalContext.overall_performance.avg_period
    : null;

  // Active dealer volume throughput
  const { activeDealerCount, avgVolumePerDealer } = useMemo(() => {
    const active = (data?.dealers || []).filter(d => (d.cur || 0) > 0);
    const count = active.length || 1;
    const avg = count > 0 ? Math.round((totalCur / count) * 10) / 10 : 0;
    return { activeDealerCount: count, avgVolumePerDealer: avg };
  }, [data?.dealers, totalCur]);

  // Product turnaround velocity breakdown for all 6 product lines
  const productVelocity = useMemo(() => {
    const prodMap = new Map();
    (data?.products || []).forEach(p => {
      const code = p.product?.toUpperCase();
      prodMap.set(code, p);
    });

    return STANDARD_PRODUCTS.map(code => {
      const p = prodMap.get(code);
      const cur = p?.cur || 0;
      const pending = p?.pendingQty || p?.pending_qty || 0;
      const total = cur + pending;
      const rate = total > 0 ? Math.round((cur / total) * 100) : (cur > 0 ? 100 : 0);
      const leadDays = p?.avgPeriod || DEFAULT_TURNAROUNDS[code] || 14.5;
      return {
        product: code,
        label: PRODUCT_LABELS[code] || p?.label || code,
        cur,
        pending,
        fulfillmentRate: rate,
        leadDays
      };
    }).sort((a, b) => b.cur - a.cur);
  }, [data?.products]);

  if (!data) return null;

  // Canonical dispatch-vs-order gap from the intelligence layer (falls back to
  // the locally derived ratio for legacy payloads).
  const gapPct = data?.intel?.dispatchOrderGapPct != null
    ? data.intel.dispatchOrderGapPct
    : (totalBookedOrders > 0 ? Math.round((pendingTotal / totalBookedOrders) * 100) : 0);
  const gapBottleneck = data?.intel?.hasDispatchBottleneck ?? gapPct >= 35;

  // Velocity status badge with universal badge-theme class
  let velocityBadge;
  if (avgPeriod == null) {
    velocityBadge = {
      text: 'Lead Time Unavailable',
      bgClass: 'badge-theme-blue',
      icon: <Clock className="w-3 h-3" />
    };
  } else if (avgPeriod <= 14) {
    velocityBadge = {
      text: 'Fast Cycle',
      bgClass: 'badge-theme-green',
      icon: <CheckCircle2 className="w-3 h-3" />
    };
  } else if (avgPeriod > 20) {
    velocityBadge = {
      text: 'Bottleneck',
      bgClass: 'badge-theme-red',
      icon: <Activity className="w-3 h-3" />
    };
  } else {
    velocityBadge = {
      text: `${avgPeriod}-Day Delivery Cycle`,
      bgClass: 'badge-theme-blue',
      icon: <Clock className="w-3 h-3" />
    };
  }

  const handleNavigateLeadTimes = () => {
    dispatch({ type: 'RESET' });
    navigate('/dealers?sort=avgPeriod');
  };

  return (
    <CollapsibleCard 
      title={title} 
      badge={
        <div className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs ${velocityBadge.bgClass}`}>
          {velocityBadge.icon}
          <span>{velocityBadge.text}</span>
        </div>
      }
      accentColor="#3b82f6"
    >
      <div className="space-y-3 sm:space-y-3.5 py-0.5">
        
        {/* Top 2 Metric Cards: Avg Lead Time & Fulfillment Rate */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3.5">
          <div className="p-2.5 sm:p-3.5 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[10.5px] sm:text-xs font-bold text-text-muted uppercase tracking-wide">
              <Clock className="w-3.5 h-3.5 text-accent-blue shrink-0" />
              <span className="leading-tight truncate">Avg Delivery</span>
            </div>
            <div className="text-lg sm:text-2xl font-black text-text-primary tracking-tight leading-none mt-1.5 sm:mt-2">
              {avgPeriod != null ? formatDays(avgPeriod) : '—'}
            </div>
            <div className="text-[10px] sm:text-[11px] text-text-muted font-medium mt-1 sm:mt-1.5 leading-snug truncate">
              Order to dispatch
            </div>
          </div>

          <div className="p-2.5 sm:p-3.5 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[10.5px] sm:text-xs font-bold text-text-muted uppercase tracking-wide">
              <Zap className="w-3.5 h-3.5 text-accent-blue shrink-0" />
              <span className="leading-tight truncate">Orders Cleared</span>
            </div>
            <div className="text-lg sm:text-2xl font-black text-text-primary tracking-tight leading-none mt-1.5 sm:mt-2">
              {fulfillmentRate}% <span className="text-[10px] sm:text-xs font-bold text-text-muted">Cleared</span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-text-muted font-medium mt-1 sm:mt-1.5 leading-snug truncate">
              {formatMT(totalCur)} of {formatMT(totalBookedOrders)} · {gapPct}% unfulfilled
            </div>
          </div>
        </div>

        {/* Order-vs-Dispatch Gap Banner */}
        {gapBottleneck && pendingTotal > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-severity-critical/10 border border-severity-critical/30">
            <Activity className="w-4 h-4 text-severity-critical shrink-0" />
            <span className="text-[12px] sm:text-[13px] font-semibold text-text-primary leading-snug">
              {gapPct}% of booked orders still await dispatch — fulfillment, not demand, is the constraint.
            </span>
          </div>
        )}

        {/* Product-Wise Turnaround Speed & Clearance (All 6 Product Lines) */}
        <div className="p-2.5 sm:p-3.5 rounded-xl bg-bg-secondary/60 border border-border/50 space-y-1.5 sm:space-y-2 shadow-xs">
          <div className="flex justify-between items-center text-xs gap-2">
            <span className="font-bold text-text-primary uppercase tracking-wide text-[11px] sm:text-xs">Delivery Time by Product</span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-text-muted shrink-0">% Cleared</span>
          </div>

          <div className="space-y-1 sm:space-y-1.5">
            {productVelocity.map(p => {
              const color = PRODUCT_COLORS[p.product] || '#3b82f6';
              return (
                <div key={p.product} className="space-y-0.5">
                  <div className="flex justify-between items-center text-xs gap-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 font-semibold text-text-primary min-w-0">
                      <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="truncate text-[11px] sm:text-xs" title={p.label}>{p.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                      <span className="text-[10px] sm:text-[11px] text-text-muted font-medium whitespace-nowrap">{p.leadDays}d avg</span>
                      <span className="font-bold font-mono text-[11px] sm:text-xs text-text-primary w-8 sm:w-9 text-right">{p.fulfillmentRate}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-bg-primary/80 overflow-hidden border border-border/40">
                    <div 
                      className="h-full rounded-full transition-all duration-300 shadow-sm"
                      style={{ 
                        width: `${Math.max(3, p.fulfillmentRate)}%`, 
                        backgroundColor: color 
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Commercial Metric & Uniform Theme Action Pill Button */}
        <div className="pt-2 sm:pt-2.5 border-t border-border/40 flex items-center justify-between gap-2">
          <div className="text-[11px] sm:text-xs text-text-muted font-medium min-w-0 truncate">
            Avg / Dealer: <strong className="text-text-primary">{avgVolumePerDealer} MT</strong> ({activeDealerCount} active)
          </div>

          <button
            onClick={handleNavigateLeadTimes}
            className="btn-pill-action shrink-0 text-xs py-1 px-2.5 sm:px-3"
          >
            <span>Delivery Details</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

      </div>
    </CollapsibleCard>
  );
}

export default React.memo(OrderFulfillmentVelocityCard);
