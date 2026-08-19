import React from 'react';
import CollapsibleCard from './CollapsibleCard';
import { formatMT, formatDays } from '../../utils/formatters';
import { PRODUCT_COLORS, PRODUCT_LABELS } from '../../utils/constants';
import { Clock, Layers } from 'lucide-react';

export default function BacklogClearanceCard({ data }) {
  if (!data) return null;

  const pendingTotal = data.pendingTotal || 0;
  const products = data.products || [];
  
  // Calculate clearance estimate
  const dailyAvg = data.dailyAvgQty || (data.operationalContext?.overall_performance?.daily_avg_qty) || 712.63;
  const clearanceDays = dailyAvg > 0 ? (pendingTotal / dailyAvg) : 0;
  const backlogLoadRatio = (dailyAvg * 30 > 0) ? Math.round((pendingTotal / (dailyAvg * 30)) * 100) / 100 : 0;
  
  // Standard 6 product codes
  const standardProducts = ['IG', 'GI', 'IGG', 'P', 'SS', 'RS'];
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

  // Ensure all 6 products are displayed
  const all6Products = standardProducts.map(code => {
    const existing = backlogMap.get(code);
    const qty = existing ? existing.pendingQty : 0;
    return {
      product: code,
      label: PRODUCT_LABELS[code] || code,
      pendingQty: qty,
      shareOfBacklog: pendingTotal > 0 ? Math.round((qty / pendingTotal) * 100) : 0
    };
  }).sort((a, b) => b.pendingQty - a.pendingQty);

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
        <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-text-muted uppercase tracking-wider">Est. Clearance Time</div>
              <div className="text-xl sm:text-2xl font-black text-text-primary mt-0.5 tracking-tight leading-tight">
                {clearanceDays > 0 ? formatDays(clearanceDays) : 'No orders waiting'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-text-muted uppercase tracking-wider">Daily Shipping Capacity</div>
            <div className="text-base sm:text-lg font-black text-text-secondary font-mono mt-0.5">{formatMT(dailyAvg)} / day</div>
          </div>
        </div>

        {/* Product Backlog Distribution (All 6 Products) */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/60 border border-border/50 space-y-2 shadow-xs">
          <div className="text-xs font-bold text-text-primary uppercase tracking-wider pb-0.5">
            Waiting Orders by Product
          </div>
          <div className="space-y-1.5">
            {all6Products.map(p => {
              const color = PRODUCT_COLORS[p.product] || '#3b82f6';
              return (
                <div key={p.product} className="space-y-0.5">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 font-semibold text-text-primary truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="truncate">{p.label}</span>
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
        <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-bg-secondary/50 border border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Queue Pressure Ratio</div>
              <div className="text-base sm:text-lg font-black text-text-primary mt-0.5 leading-tight">
                {backlogLoadRatio}x our normal monthly volume
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Product Types in Queue</div>
            <div className="text-base sm:text-lg font-black text-amber-500 font-mono mt-0.5 leading-tight whitespace-nowrap">
              6 Products
            </div>
          </div>
        </div>

      </div>
    </CollapsibleCard>
  );
}
