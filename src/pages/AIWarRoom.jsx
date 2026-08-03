import { useData } from '../context/DataContext';
import PriorityBadge from '../components/common/PriorityBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { 
  Brain, 
  AlertTriangle, 
  Target, 
  Map, 
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

  const getProductSentiment = (mom_pct) => {
    if (mom_pct < -10) return { text: 'text-severity-critical', badge: 'bg-severity-critical/10 text-severity-critical border border-severity-critical/30' };
    if (mom_pct <= -5) return { text: 'text-severity-high',     badge: 'bg-severity-high/10 text-severity-high border border-severity-high/30' };
    if (mom_pct > 0)   return { text: 'text-severity-none',     badge: 'bg-severity-none/10 text-severity-none border border-severity-none/30' };
    return                    { text: 'text-text-muted',        badge: 'bg-bg-secondary text-text-secondary border border-border' };
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
            {intelligence.dealer_risks?.length > 0 && (
              <m.div variants={fadeInUp} className="space-y-4">
                <h4 className="text-sm font-extrabold text-severity-high uppercase tracking-widest flex items-center gap-2">
                  <User className="w-5 h-5" />
                  At-Risk Dealer Interventions ({intelligence.dealer_risks.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {intelligence.dealer_risks.map((risk, idx) => {
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
                          <Map className="w-4 h-4 shrink-0" />
                          {risk.district}, {risk.state}
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
                  <Map className="w-5 h-5" />
                  Regional Performance & Pending Analysis
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  {intelligence.geographic_insights && (
                    <div className={`${CARD_REGION} border-l-4 border-l-accent-cyan/70 hover:border-l-accent-cyan space-y-3`}>
                      <span className="text-xs font-black text-accent-cyan uppercase tracking-wider block">Regional Performance Analysis</span>
                      <p className="text-base text-text-secondary leading-relaxed font-medium">{intelligence.geographic_insights}</p>
                    </div>
                  )}
                  {intelligence.pending_order_intelligence && (
                    <div className={`${CARD_REGION} border-l-4 border-l-accent-cyan/70 hover:border-l-accent-cyan space-y-3`}>
                      <span className="text-xs font-black text-accent-cyan uppercase tracking-wider block">Fulfillment Bottlenecks & Backlog</span>
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
                <h3 className="text-base font-extrabold text-text-primary uppercase tracking-wider">Performance Diagnostics</h3>
              </div>
              <span className="text-xs font-bold text-text-muted uppercase font-mono">Root Cause Analysis</span>
            </div>

            {/* ── Root Cause Analysis ── */}
            {intelligence.root_cause_analysis?.length > 0 && (
              <m.div variants={fadeInUp} className="space-y-4">
                <h4 className="text-sm font-extrabold text-severity-high uppercase tracking-widest flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Volume Loss Root Causes
                </h4>
                {intelligence.root_cause_analysis.map((rc, idx) => (
                   <div key={idx} className={`${CARD_DIAG} border-l-4 border-l-accent-sky/70 hover:border-l-accent-sky`}>
                    <div className="flex items-center justify-between mb-3.5">
                      <span className="bg-bg-secondary border border-border text-text-secondary text-xs font-extrabold tracking-wider flex items-center gap-2 px-3 py-1.5 rounded-lg uppercase">
                        {rc.dimension === 'PRODUCT'  && <Layers className="w-3.5 h-3.5" />}
                        {(rc.dimension === 'STATE' || rc.dimension === 'DISTRICT') && <Map className="w-3.5 h-3.5" />}
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

            {/* ── Product Insights (Declining Products Only) ── */}
            {intelligence.product_insights?.filter(i => i.trend === 'DECLINING' || (typeof i.mom_pct === 'number' && i.mom_pct < 0)).length > 0 && (
              <m.div variants={fadeInUp} className="space-y-4">
                <h4 className="text-sm font-extrabold text-accent-blue uppercase tracking-widest flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Product Insights
                </h4>
                {intelligence.product_insights
                  .filter(insight => insight.trend === 'DECLINING' || (typeof insight.mom_pct === 'number' && insight.mom_pct < 0))
                  .map((insight, idx) => {
                  const s = getProductSentiment(insight.mom_pct);
                  return (
                    <div key={idx} className={`${CARD_DEFAULT} border-l-4 border-l-accent-blue/60 hover:border-l-accent-blue space-y-4`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-base font-black text-text-primary block">
                            {PRODUCT_LABELS[insight.product] || (insight.label ? insight.label.replace(/^([A-Z]+)\s*[\-\–]\s*(.+)$/, '$1 ($2)') : insight.product)}
                          </span>
                        </div>
                        <span className={`text-xs font-black tracking-wider px-3 py-1.5 rounded-lg uppercase ${s.badge}`}>
                          {insight.trend}
                        </span>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-2 pt-3.5 border-t border-border text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-text-muted font-extrabold uppercase tracking-wider">Volume (MT)</span>
                          <span className="text-base font-black text-text-primary mt-1 font-mono">{formatMT(insight.cur_mt)}</span>
                        </div>
                        <div className="flex flex-col items-center border-x border-border">
                          <span className="text-xs text-text-muted font-extrabold uppercase tracking-wider">MoM Change</span>
                          <span className={`text-base font-black mt-1 flex items-center gap-1 font-mono ${s.text}`}>
                            <MoMIndicator cur={insight.cur_mt} prev={insight.prev_mt} className="text-base font-extrabold" />
                          </span>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-text-muted font-extrabold uppercase tracking-wider">Pending (MT)</span>
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
                })}
              </m.div>
            )}

          </div>
        </div>
      </m.div>
    </m.div>
  );
}
