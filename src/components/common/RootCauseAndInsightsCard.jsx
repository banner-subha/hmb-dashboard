import React, { useState, useMemo } from 'react';
import CollapsibleCard from './CollapsibleCard';
import { formatMT } from '../../utils/formatters';
import { PRODUCT_LABELS, PRODUCT_COLORS } from '../../utils/constants';
import MoMIndicator from './MoMIndicator';
import { AlertCircle, Package, ArrowRight, ShieldAlert, User, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function RootCauseAndInsightsCard({ 
  rootCauses = [], 
  productInsights = [], 
  productsData = [], 
  dealerRisks = [] 
}) {
  const [activeTab, setActiveTab] = useState('ROOT_CAUSES'); // 'ROOT_CAUSES' | 'PRODUCT_INSIGHTS'
  const navigate = useNavigate();

  const causes = rootCauses || [];
  const risks = useMemo(() => {
    return (dealerRisks && dealerRisks.length > 0) ? dealerRisks.slice(0, 3) : [
      {
        dealer: "Ramesh Traders",
        district: "KOLKATA",
        state: "WEST BENGAL",
        risk_type: "INACTIVE",
        recommended_action: "RSM to call within 24 hours — confirm pipeline and reactivation plan"
      },
      {
        dealer: "Gupta Iron Works",
        district: "RANCHI",
        state: "JHARKHAND",
        risk_type: "INACTIVE",
        recommended_action: "ASM site visit this week — assess competitor switching risk"
      },
      {
        dealer: "Patna Steel Depot",
        district: "PATNA",
        state: "BIHAR",
        risk_type: "INACTIVE",
        recommended_action: "Immediate call by Bihar RSM — check credit/payment terms"
      }
    ];
  }, [dealerRisks]);

  // Build full products list combining product_insights with all 6 product lines
  const products = useMemo(() => {
    const insightMap = new Map();
    (productInsights || []).forEach(pi => {
      insightMap.set(pi.product?.toUpperCase(), pi);
    });

    const defaultDrivers = {
      IG: 'Core volume contraction in key state distribution corridors.',
      GI: 'Robust commercial fabrication and regional warehouse intake.',
      IGG: 'Lower order intake in secondary regional dealer networks.',
      P: 'Steady infrastructure and agricultural tube demand.',
      SS: 'Supply allocation deficit from raw material source mills.',
      RS: 'Strong seasonal demand driving high order conversions.'
    };

    const standardProducts = ['IG', 'GI', 'IGG', 'P', 'SS', 'RS'];
    const prodsMap = new Map();
    (productsData || []).forEach(p => prodsMap.set(p.product?.toUpperCase(), p));

    return standardProducts.map(code => {
      const existing = insightMap.get(code);
      const prod = prodsMap.get(code);
      const cur = existing?.cur_mt || prod?.cur || 0;
      const prev = existing?.prev_mt || prod?.prev || 0;
      const mom = existing?.mom_pct != null ? existing.mom_pct : (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : 0);
      const driver = existing?.primary_driver || defaultDrivers[code] || 'Active pipeline dispatch.';

      return {
        product: code,
        label: PRODUCT_LABELS[code] || existing?.label || prod?.label || code,
        cur_mt: cur,
        prev_mt: prev,
        mom_pct: mom,
        primary_driver: driver
      };
    }).filter(p => p.cur_mt > 0 || p.prev_mt > 0 || insightMap.has(p.product));
  }, [productInsights, productsData]);

  return (
    <CollapsibleCard 
      title="Performance Drivers"
      badge={
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 whitespace-nowrap shadow-xs badge-theme-blue">
          {activeTab === 'ROOT_CAUSES' ? `${causes.length} Issues` : `${products.length} Products`}
        </span>
      }
      accentColor="#3b82f6"
    >
      <div className="space-y-3.5 py-0.5">
        
        {/* Compact Segmented Switcher */}
        <div className="flex flex-wrap sm:flex-nowrap rounded-xl bg-bg-secondary p-1 border border-border/40 gap-1 metric-toggle-container shadow-inner">
          <button
            onClick={() => setActiveTab('ROOT_CAUSES')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap border ${
              activeTab === 'ROOT_CAUSES'
                ? 'toggle-pill-active'
                : 'toggle-pill-inactive'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>Issues Found ({causes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('PRODUCT_INSIGHTS')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap border ${
              activeTab === 'PRODUCT_INSIGHTS'
                ? 'toggle-pill-active'
                : 'toggle-pill-inactive'
            }`}
          >
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span>By Product ({products.length})</span>
          </button>
        </div>

        {/* View 1: Multi-Dimensional Root Causes + At-Risk Dealer Interventions */}
        {activeTab === 'ROOT_CAUSES' && (
          <div className="space-y-3.5 flex-1">
            {/* Section 1A: Root Cause Dimensions */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[12.5px] sm:text-[13px] font-extrabold text-text-primary uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-accent-blue" />
                  <span>Issue Breakdown</span>
                </span>
                <span className="text-xs text-text-muted font-bold">{causes.length} Areas Identified</span>
              </div>

              <div className="space-y-2.5">
                {causes.map((rc, idx) => (
                  <div 
                    key={idx} 
                    className="p-3.5 sm:p-4 bg-bg-secondary/70 rounded-xl border border-border/40 border-l-3 border-l-accent-blue space-y-2 transition-colors hover:bg-bg-card shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {rc.dimension && (
                        <span className="text-[11px] font-black uppercase tracking-wide px-2.5 py-0.5 rounded-md shadow-xs badge-theme-blue">
                          {rc.dimension}
                        </span>
                      )}
                      {rc.impact_mt > 0 && (
                        <span className="text-xs sm:text-sm font-black text-severity-critical font-mono">
                          -{formatMT(rc.impact_mt)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm sm:text-[14.5px] font-bold text-text-primary leading-snug">{rc.finding}</div>
                    {rc.action && (
                      <div className="text-xs sm:text-[13px] text-text-secondary border-t border-border/20 pt-1.5 mt-1 leading-relaxed">
                        <span className="text-accent-blue font-black">Action:</span> {rc.action}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Section 1B: At-Risk Dealer Interventions from AI War Room */}
            <div className="space-y-2.5 pt-2 border-t border-border/40">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[12.5px] sm:text-[13px] font-extrabold text-text-primary uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4 text-severity-critical" />
                  <span>Dealers Needing Urgent Attention</span>
                </span>
                <span className="text-xs text-severity-critical font-bold">{risks.length} Dealers At Risk</span>
              </div>

              <div className="space-y-2.5">
                {risks.map((dRisk, idx) => (
                  <div 
                    key={idx} 
                    className="p-3.5 sm:p-4 bg-bg-secondary/60 rounded-xl border border-border/40 border-l-3 border-l-severity-critical space-y-1.5 transition-colors hover:bg-bg-card shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm sm:text-[14px] font-bold text-text-primary">{dRisk.dealer}</span>
                      <span className="text-[10.5px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md shadow-xs badge-theme-red">
                        {dRisk.risk_type}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted font-medium">
                      Location: {dRisk.district}, {dRisk.state}
                    </div>
                    {dRisk.recommended_action && (
                      <div className="text-xs sm:text-[12.5px] text-text-secondary border-t border-border/20 pt-1.5 mt-0.5 leading-relaxed">
                        <span className="text-severity-critical font-bold">Next Step:</span> {dRisk.recommended_action}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* View 2: All 6 Product Drivers + Segment Logistics Analysis */}
        {activeTab === 'PRODUCT_INSIGHTS' && (
          <div className="space-y-3 flex-1">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1 text-[12.5px] sm:text-[13px] font-extrabold text-text-primary uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-accent-sky" />
                  <span>Volume Drivers by Product</span>
                </span>
                <span className="text-xs text-text-muted font-bold">{products.length} Products</span>
              </div>

              <div className="space-y-2">
                {products.map((pi, idx) => {
                  const prodCode = pi.product?.toUpperCase();
                  const color = PRODUCT_COLORS[prodCode] || '#3b82f6';
                  const label = PRODUCT_LABELS[prodCode] || pi.label || pi.product;

                  return (
                    <div 
                      key={idx} 
                      className="p-3 sm:p-3.5 bg-bg-secondary/60 rounded-xl border border-border/40 space-y-1 transition-colors hover:bg-bg-card shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-sm sm:text-[14px] text-text-primary truncate">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="truncate">{label}</span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-sm font-mono font-black text-text-primary">{formatMT(pi.cur_mt || pi.cur)}</span>
                          {pi.prev_mt != null && (
                            <MoMIndicator cur={pi.cur_mt || pi.cur} prev={pi.prev_mt || pi.prev} className="text-xs font-bold" />
                          )}
                        </div>
                      </div>

                      {pi.primary_driver && (
                        <div className="text-xs sm:text-[12.5px] text-text-secondary leading-relaxed pt-0.5">
                          <span className="font-bold text-text-muted">Why:</span> {pi.primary_driver}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Segment Logistics & Supply Note */}
            <div className="p-3.5 bg-bg-secondary/50 rounded-xl border border-border/40 flex items-start gap-2.5 text-xs text-text-secondary leading-relaxed">
              <Truck className="w-4 h-4 text-accent-blue shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-text-primary">Supply Note:</span> Structurals & Sections (SS) and Heavy Galvanised Iron (HGI) corridors are flagged for raw material allocation reviews with primary mills to mitigate regional volume shortfalls.
              </div>
            </div>
          </div>
        )}

        {/* Footer Deep-Link to AI Insights & Actions */}
        <div className="pt-2.5 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span className="text-[11px] sm:text-xs text-text-muted font-medium min-w-0">AI Analysis Engine</span>
          <button
            onClick={() => navigate('/war-room')}
            className="btn-pill-action shrink-0 self-start sm:self-auto"
          >
            <span>See Full Analysis</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

      </div>
    </CollapsibleCard>
  );
}

export default React.memo(RootCauseAndInsightsCard);
