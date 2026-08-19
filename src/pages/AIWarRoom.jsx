import { useData } from '../context/DataContext';
import PriorityBadge from '../components/common/PriorityBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { 
  Brain, 
  AlertTriangle, 
  Target, 
  Map as MapIcon, 
  User, 
  Activity, 
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { formatMT } from '../utils/formatters';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { m } from 'framer-motion';
import { staggerContainer, staggerItem, fadeInUp } from '../utils/motionVariants';
import { PRODUCT_LABELS } from '../utils/constants';

// Shared dark glass subcard base — solid dark bg, crisp borders
const CARD = 'rounded-2xl border p-6 transition-all duration-200 shadow-md backdrop-blur-sm';

// Per-section card variants: top border accent + bg (theme-aware via CSS vars)
const CARD_DEFAULT  = `${CARD} bg-[var(--ai-card-bg)] border-[var(--ai-card-border)]`;
const CARD_CRITICAL = `${CARD} bg-[var(--ai-card-bg)] border-[var(--ai-card-border)]`;
const CARD_ACTION   = `${CARD} bg-[var(--ai-card-bg)] border-[var(--ai-card-border)]`;
const CARD_RISK     = `${CARD} bg-[var(--ai-card-bg)] border-[var(--ai-card-border)]`;
const CARD_DIAG     = `${CARD} bg-[var(--ai-card-bg)] border-[var(--ai-card-border)]`;
const CARD_REGION   = `${CARD} bg-[var(--ai-card-bg)] border-[var(--ai-card-border)]`;

export default function AIWarRoom() {
  const { data: filteredData, overallData, loading, error } = useData();
  const data = overallData || filteredData;

  if (loading) return (
    <div className="max-w-6xl mx-auto space-y-6">
      <SkeletonLoader variant="card" className="h-32" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonLoader variant="card" count={2} />
        <SkeletonLoader variant="card" count={2} />
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data?.intelligence) return <div className="text-center text-text-muted py-12">No AI intelligence data available for this cycle.</div>;

  const { intelligence } = data;

  const stateShareMap = new Map((data.states || []).map(s => [s.state?.replace(/\s+/g, '').toUpperCase(), s.share || 0]));
  const qualifiedStates = new Set(
    (data.states || [])
      .filter(s => (s.share || 0) >= 5)
      .map(s => s.state?.replace(/\s+/g, '').toUpperCase())
  );

  const llmRiskMap = new Map(
    (intelligence.dealer_risks || []).map(r => [r.dealer?.replace(/\s+/g, '').toUpperCase(), r])
  );

  const getDealerAction = (dl) => {
    const mom = Math.abs(dl.mom || 0);
    const drop = dl.drop || Math.max(0, (dl.prev || 0) - (dl.cur || 0));
    const pending = dl.pendingQty || 0;
    const behind = (dl.lossFlag || '').toUpperCase() === 'BEHIND';
    const topProduct = (dl.products || []).sort((a, b) => (b.prev || 0) - (a.prev || 0))[0];
    const prodName = topProduct ? (PRODUCT_LABELS[topProduct.product] || topProduct.product) : null;
    const prodDrop = topProduct ? Math.max(0, (topProduct.prev || 0) - (topProduct.cur || 0)) : 0;
    const hasOffset = drop > 0 && prodDrop > drop * 1.5;

    if (drop < 1) {
      return `Minor volume fluctuation of ${formatMT(drop)} (${mom.toFixed(0)}% MoM) — within normal cycle variance. Area Sales Manager to monitor this account next cycle and confirm the trend does not deepen${prodName && hasOffset ? `, noting that ${prodName} dropped ${formatMT(prodDrop)} but was offset by growth in other products` : ''}. No immediate action required unless the decline persists.`;
    }

    if (mom >= 60 || drop >= 60) {
      if (pending > drop * 1.5) {
        return `Critical volume collapse of ${formatMT(drop)} (${mom.toFixed(0)}% MoM) with a backlog of ${formatMT(pending)} pending. Area Sales Manager must visit within 24 hours to resolve dispatch bottlenecks${prodName && !hasOffset ? `, particularly for ${prodName} which accounts for ${formatMT(prodDrop)} of the loss` : ''}, and coordinate with Dispatch Team to clear the pending queue this week.`;
      }
      return `Severe decline of ${formatMT(drop)} (${mom.toFixed(0)}% MoM) signals a potential relationship or demand issue. Area Sales Manager must schedule an urgent in-person visit within 24 hours to diagnose root cause${prodName && !hasOffset ? ` — ${prodName} alone dropped ${formatMT(prodDrop)}` : ''} — and present a recovery plan by end of this week.`;
    }

    if (mom >= 30 || drop >= 30) {
      if (behind && pending > 20) {
        return `Significant decline of ${formatMT(drop)} (${mom.toFixed(0)}% MoM) compounded by dispatch pace running behind average${prodName && !hasOffset ? `, with ${prodName} as the primary affected product` : ''}. Regional Sales Manager to visit within 48 hours, review the ${formatMT(pending)} pending orders with the dealer, and coordinate with Dispatch Team to accelerate deliveries and stabilize the account.`;
      }
      return `Substantial volume drop of ${formatMT(drop)} (${mom.toFixed(0)}% MoM) requires immediate attention. Area Sales Manager to contact the dealer within 48 hours to investigate${prodName && !hasOffset ? ` — ${prodName} volume fell by ${formatMT(prodDrop)}` : ''} — identify whether the decline is order-related or fulfillment-related, and propose a recovery timeline.`;
    }

    if (pending > drop * 2 && pending > 15) {
      return `Moderate decline of ${formatMT(drop)} (${mom.toFixed(0)}% MoM) but a significant pending backlog of ${formatMT(pending)} remains unresolved${prodName && !hasOffset ? ` (concentrated in ${prodName})` : ''}. Area Sales Manager to visit within this week, review pending orders with the dealer, and coordinate with Dispatch Team to clear the backlog before it impacts the next cycle.`;
    }

    if (behind) {
      return `Volume declined ${formatMT(drop)} (${mom.toFixed(0)}% MoM) and dispatch pace is behind the dealer's average. Area Sales Manager to visit within this week to assess whether the slowdown is demand-driven or fulfillment-driven${prodName && !hasOffset ? `, with focus on ${prodName} which dropped ${formatMT(prodDrop)}` : ''}, and agree on a catch-up plan for next cycle.`;
    }

    return `Volume declined ${formatMT(drop)} (${mom.toFixed(0)}% MoM)${prodName && !hasOffset ? `, primarily in ${prodName} (−${formatMT(prodDrop)})` : hasOffset ? `, driven by ${prodName} (−${formatMT(prodDrop)}) but partially offset by growth in other products` : ''}. Area Sales Manager to schedule a check-in within this week to understand the root cause, review any pending fulfillment gaps, and align on actions to recover volume in the next cycle.`;
  };

  const decliningInterventions = (data.dealers || [])
    .filter(dl => dl.cur > 0 && dl.prev > 0 && dl.cur < dl.prev)
    .filter(dl => qualifiedStates.has(dl.state?.replace(/\s+/g, '').toUpperCase()))
    .sort((a, b) => {
      const sa = stateShareMap.get(a.state?.replace(/\s+/g, '').toUpperCase()) || 0;
      const sb = stateShareMap.get(b.state?.replace(/\s+/g, '').toUpperCase()) || 0;
      if (sb !== sa) return sb - sa;
      return ((b.prev || 0) - (b.cur || 0)) - ((a.prev || 0) - (a.cur || 0));
    })
    .slice(0, 10)
    .map(dl => {
      const existing = llmRiskMap.get(dl.client?.replace(/\s+/g, '').toUpperCase());
      return {
        dealer: dl.client,
        district: dl.district || '',
        state: dl.state,
        risk_type: 'DECLINING',
        recommended_action: existing?.recommended_action || getDealerAction(dl),
        drop_mt: Math.max(0, (dl.prev || 0) - (dl.cur || 0)),
        mom_pct: dl.mom,
        pendingQty: dl.pendingQty || 0,
        currentDailyRate: dl.currentDailyRate || 0,
        dailyAvgQty: dl.dailyAvgQty || 0,
        lossFlag: dl.lossFlag || '',
        impactScore: dl.impactScore || 0,
      };
    });

  const getProductSentiment = (mom_pct) => {
    if (mom_pct !== null && mom_pct !== undefined) {
      if (mom_pct > 0)  return { text: 'text-severity-none',          badge: 'bg-severity-none/10 text-severity-none border border-severity-none/30' };
      if (mom_pct < -10) return { text: 'text-severity-critical',     badge: 'bg-severity-critical/10 text-severity-critical border border-severity-critical/30' };
      if (mom_pct <= -5) return { text: 'text-severity-high',         badge: 'bg-severity-high/10 text-severity-high border border-severity-high/30' };
      return                   { text: 'text-text-muted',            badge: 'bg-bg-secondary text-text-secondary border border-border' };
    }
    return { text: 'text-text-muted', badge: 'bg-bg-secondary text-text-secondary border border-border' };
  };

  const getRiskDot = (risk_type) => {
    const t = (risk_type || '').toUpperCase();
    if (t === 'INACTIVE') return { badge: 'bg-severity-critical/10 text-severity-critical border border-severity-critical/30', dot: 'bg-severity-critical' };
    if (t === 'DECLINING') return { badge: 'bg-severity-high/10 text-severity-high border border-severity-high/30', dot: 'bg-severity-high' };
    return                        { badge: 'bg-severity-medium/10 text-severity-medium border border-severity-medium/30', dot: 'bg-severity-medium' };
  };

  return (
    <m.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="max-w-7xl mx-auto space-y-6"
    >
      {/* PAGE TITLE */}
      <div className="flex items-center gap-3 border-b border-border pb-4 mb-4">
        <Brain className="w-8 h-8 text-accent-blue" />
        <h2 className="text-3xl md:text-4xl font-extrabold text-text-primary">AI Insights & Actions</h2>
      </div>

      {/* Master Card */}
      <m.div
        variants={staggerItem}
        className="overflow-hidden border border-border/60 rounded-2xl shadow-2xl bg-bg-card"
      >
        {/* Executive Summary */}
        <m.div
          variants={fadeInUp}
          className="p-8 md:p-10 border-b border-border/40 bg-gradient-to-r from-accent-blue/10 via-transparent to-transparent"
        >
          <span className="text-xs font-black text-accent-blue tracking-widest uppercase block mb-3 font-mono">
            Key Directive
          </span>
          <p className="text-xl md:text-2xl text-text-primary font-semibold leading-relaxed italic border-l-4 border-accent-blue/80 pl-6">
            "{intelligence.executive_summary}"
          </p>
        </m.div>

        {/* Two-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border/40">

          {/* ── LEFT COLUMN ──────────────────────────────── */}
          <div className="lg:col-span-7 p-8 md:p-10 space-y-9">

            {/* Column Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-border/30">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-black text-text-muted font-mono">01 /</span>
                <h3 className="text-base font-extrabold text-text-primary uppercase tracking-wider">Priority Action Plans</h3>
              </div>
              <span className="text-xs font-bold text-text-muted uppercase font-mono">Urgent Action Items</span>
            </div>

            {/* ── Critical Risk Alerts ── */}
            {intelligence.escalation_flags?.length > 0 && (
              <m.div variants={fadeInUp} className="space-y-4">
                <h4 className="text-sm font-extrabold text-severity-critical uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  Critical Risk Alerts
                </h4>
                {intelligence.escalation_flags.map((flag, idx) => (
                  <div key={idx} className={`${CARD_CRITICAL} flex gap-4 items-start border-l-4 border-l-severity-critical`}>
                    <AlertTriangle className="w-5 h-5 text-severity-critical shrink-0 mt-1" />
                    <p className="text-lg leading-relaxed font-medium text-text-primary">{flag}</p>
                  </div>
                ))}
              </m.div>
            )}

            {/* ── Recommended Actions ── */}
            {intelligence.recommended_actions?.length > 0 && (
              <m.div variants={fadeInUp} className="space-y-4">
                <h4 className="text-sm font-extrabold text-accent-blue uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Recommended Response Actions ({intelligence.recommended_actions.length})
                </h4>
                {intelligence.recommended_actions.map((act, idx) => (
                  <div key={idx} className={`${CARD_ACTION} flex flex-col gap-3.5 border-l-4 border-l-accent-blue/70 hover:border-accent-blue`}>
                    <div className="flex items-center gap-3">
                      <PriorityBadge priority={act.priority} />
                      <span className="text-sm font-extrabold text-text-muted uppercase tracking-wider">{act.owner}</span>
                    </div>
                    <p className="text-lg text-text-primary leading-relaxed font-medium">{act.action}</p>
                  </div>
                ))}
              </m.div>
            )}

            {/* ── Dealer Risks ── */}
            {decliningInterventions.length > 0 && (
              <m.div variants={fadeInUp} className="space-y-4">
                <h4 className="text-sm font-extrabold text-severity-high uppercase tracking-widest flex items-center gap-2">
                  <User className="w-5 h-5" />
                  At-Risk Dealer Interventions ({decliningInterventions.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {decliningInterventions.map((risk, idx) => {
                    const s = getRiskDot(risk.risk_type);
                    return (
                      <div key={idx} className={`${CARD_RISK} space-y-3.5 border-l-4 border-l-severity-high/70`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-extrabold text-text-primary truncate max-w-[170px]" title={risk.dealer}>
                            {risk.dealer}
                          </span>
                          <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md flex items-center gap-1.5 ${s.badge}`}>
                            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                            {risk.risk_type}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-text-muted uppercase flex items-center gap-2">
                          <MapIcon className="w-4 h-4 shrink-0" />
                          {[risk.district, risk.state].filter(Boolean).join(', ')}
                        </div>
                        <div className="text-xs font-black text-text-muted uppercase tracking-wider flex items-center gap-3">
                          <span>Volume Drop: <span className="text-severity-high font-mono">{formatMT(risk.drop_mt)}</span></span>
                          <span>vs Last Month: <span className="text-severity-high font-mono">{risk.mom_pct != null ? `${risk.mom_pct}%` : '—'}</span></span>
                        </div>
                        <p className="text-base text-text-secondary leading-relaxed border-t border-border pt-3.5">
                          <span className="font-extrabold text-xs text-text-muted uppercase block mb-1.5">Action Plan:</span>
                          {risk.recommended_action}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </m.div>
            )}

            {/* ── Regional & Pending Analysis ── */}
            {(intelligence.geographic_insights || intelligence.pending_order_intelligence) && (
              <m.div variants={fadeInUp} className="space-y-4 pt-3">
                <h4 className="text-sm font-extrabold text-accent-cyan uppercase tracking-widest flex items-center gap-2">
                  <MapIcon className="w-5 h-5" />
                  Regional & Backlog Analysis
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  {intelligence.geographic_insights && (
                    <div className={`${CARD_REGION} border-l-4 border-l-accent-cyan/70 hover:border-l-accent-cyan space-y-3`}>
                      <span className="text-xs font-black text-accent-cyan uppercase tracking-wider block">Regional Breakdown</span>
                      <p className="text-base text-text-secondary leading-relaxed font-medium">{intelligence.geographic_insights}</p>
                    </div>
                  )}
                  {intelligence.pending_order_intelligence && (
                    <div className={`${CARD_REGION} border-l-4 border-l-accent-cyan/70 hover:border-l-accent-cyan space-y-3`}>
                      <span className="text-xs font-black text-accent-cyan uppercase tracking-wider block">Order Backlog Insights</span>
                      <p className="text-base text-text-secondary leading-relaxed font-medium">{intelligence.pending_order_intelligence}</p>
                    </div>
                  )}
                </div>
              </m.div>
            )}
          </div>

          {/* ── RIGHT COLUMN ─────────────────────────────── */}
          <div className="lg:col-span-5 p-8 md:p-10 space-y-9 bg-bg-secondary/60">

            {/* Column Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-border/30">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-black text-text-muted font-mono">02 /</span>
                <h3 className="text-base font-extrabold text-text-primary uppercase tracking-wider">Performance Analysis</h3>
              </div>
              <span className="text-xs font-bold text-text-muted uppercase font-mono">Issue Analysis</span>
            </div>

            {/* ── Root Cause Analysis ── */}
            {intelligence.root_cause_analysis?.length > 0 && (
              <m.div variants={fadeInUp} className="space-y-4">
                <h4 className="text-sm font-extrabold text-severity-high uppercase tracking-widest flex items-center gap-2">
                  <Target className="w-5 h-5" />
                   Volume Loss Drivers
                </h4>
                {intelligence.root_cause_analysis.map((rc, idx) => (
                   <div key={idx} className={`${CARD_DIAG} border-l-4 border-l-accent-sky/70 hover:border-l-accent-sky`}>
                    <div className="flex items-center justify-between mb-3.5">
                      <span className="bg-bg-secondary border border-border text-text-secondary text-xs font-extrabold tracking-wider flex items-center gap-2 px-3 py-1.5 rounded-lg uppercase">
                        {rc.dimension === 'PRODUCT'  && <Layers className="w-3.5 h-3.5" />}
                        {(rc.dimension === 'STATE' || rc.dimension === 'DISTRICT') && <MapIcon className="w-3.5 h-3.5" />}
                        {rc.dimension === 'DEALER'   && <User className="w-3.5 h-3.5" />}
                        {rc.dimension}
                      </span>
                      {rc.impact_mt > 0 && (
                        <span className="text-base font-black text-severity-high font-mono">
                          -{formatMT(rc.impact_mt)} Impact
                        </span>
                      )}
                    </div>
                    <p className="text-base text-text-primary leading-relaxed font-semibold">{rc.finding}</p>
                    {rc.pct_of_total_decline > 0 && (
                      <div className="mt-4 pt-3.5 border-t border-border">
                        <div className="flex justify-between text-xs font-extrabold uppercase tracking-wider mb-2">
                          <span className="text-text-muted">Share of Decline</span>
                          <span className="text-severity-high font-mono text-sm">{rc.pct_of_total_decline}%</span>
                        </div>
                        <div className="w-full bg-bg-secondary h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-severity-high h-full rounded-full transition-all duration-500"
                            style={{ width: `${rc.pct_of_total_decline}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </m.div>
            )}

            {/* ── Product Insights (Declining + Growth) ── */}
            {intelligence.product_insights?.length > 0 && (() => {
              const allInsights = [...intelligence.product_insights];
              const declining = allInsights
                .filter(i => i.mom_pct != null ? i.mom_pct < 0 : (i.trend === 'DECLINING' || i.trend === 'BEHIND'))
                .sort((a, b) => (a.mom_pct ?? 0) - (b.mom_pct ?? 0));
              const growth = allInsights
                .filter(i => !(i.mom_pct != null ? i.mom_pct < 0 : (i.trend === 'DECLINING' || i.trend === 'BEHIND')))
                .sort((a, b) => (b.mom_pct ?? 0) - (a.mom_pct ?? 0));

              const renderInsightCard = (insight, idx) => {
                const s = getProductSentiment(insight.mom_pct);
                const isDecline = insight.mom_pct != null ? insight.mom_pct < 0 : insight.trend === 'DECLINING';
                const borderCls = isDecline ? 'border-l-severity-high/60 hover:border-l-severity-high' : 'border-l-severity-none/60 hover:border-l-severity-none';
                return (
                  <div key={idx} className={`${CARD_DEFAULT} border-l-4 ${borderCls} space-y-4`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-base font-black text-text-primary block">
                          {PRODUCT_LABELS[insight.product] || (insight.label ? insight.label.replace(/^([A-Z]+)\s*[\-\–]\s*(.+)$/, '$1 ($2)') : insight.product)}
                        </span>
                      </div>
                      <span className={`text-xs font-black tracking-wider px-3 py-1.5 rounded-lg uppercase ${s.badge}`}>
                        {insight.trend === 'DECLINING' || insight.trend === 'BEHIND' ? 'Declining' : (insight.trend === 'GROWING' || insight.trend === 'AHEAD' ? 'Growth' : (insight.trend || (isDecline ? 'Declining' : 'Growth')))}
                      </span>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-2 pt-3.5 border-t border-border text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-text-muted font-extrabold uppercase tracking-wider">Volume (MT)</span>
                        <span className="text-base font-black text-text-primary mt-1 font-mono">{formatMT(insight.cur_mt)}</span>
                      </div>
                      <div className="flex flex-col items-center border-x border-border">
                        <span className="text-xs text-text-muted font-extrabold uppercase tracking-wider">vs Last Month</span>
                        <span className={`text-base font-black mt-1 flex items-center gap-1 font-mono ${s.text}`}>
                          <MoMIndicator cur={insight.cur_mt} prev={insight.prev_mt} className="text-base font-extrabold" />
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-text-muted font-extrabold uppercase tracking-wider">Pending Orders (MT)</span>
                        <span className="text-base font-black text-text-primary mt-1 font-mono">{formatMT(insight.pending_qty)}</span>
                      </div>
                    </div>

                    {insight.primary_driver && (
                      <div className="pt-3.5 border-t border-border">
                        <span className="text-xs font-extrabold text-text-muted uppercase tracking-wider block mb-1.5">Primary Driver:</span>
                        <p className="text-base text-text-secondary leading-relaxed font-medium">{insight.primary_driver}</p>
                      </div>
                    )}
                    {insight.recommended_action && (
                      <div className="pt-3.5 border-t border-border">
                        <span className="text-xs font-extrabold text-text-muted uppercase tracking-wider block mb-1.5">Product Strategy:</span>
                        <p className="text-base text-text-secondary leading-relaxed font-semibold">{insight.recommended_action}</p>
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div className="space-y-4">
                  <h4 className="text-sm font-extrabold text-accent-blue uppercase tracking-widest flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Product Insights ({allInsights.length})
                  </h4>

                  {declining.length > 0 && (
                    <div className="space-y-4">
                      <h5 className="text-xs font-black text-severity-high uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-severity-high" />
                        Declining Products ({declining.length})
                      </h5>
                      {declining.map((insight, idx) => renderInsightCard(insight, idx))}
                    </div>
                  )}

                  {growth.length > 0 && (
                    <div className="space-y-4">
                      <h5 className="text-xs font-black text-severity-none uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-severity-none" />
                        Growth Products ({growth.length})
                      </h5>
                      {growth.map((insight, idx) => renderInsightCard(insight, idx))}
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        </div>
      </m.div>
    </m.div>
  );
}
