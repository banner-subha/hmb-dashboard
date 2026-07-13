import { useData } from '../context/DataContext';
import CollapsibleCard from '../components/common/CollapsibleCard';
import SeverityBadge from '../components/common/SeverityBadge';
import PriorityBadge from '../components/common/PriorityBadge';
import { Brain, AlertTriangle, Target, Search, Map } from 'lucide-react';
import { formatMT } from '../utils/formatters';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function AIWarRoom() {
  const { data, loading, error } = useData();

  if (loading) return (
    <div className="max-w-5xl mx-auto space-y-6">
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

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* Header Panel */}
      <div className="glass-card p-8 border-l-4 border-accent-blue bg-gradient-to-br from-bg-card to-bg-secondary relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-5 p-4 pointer-events-none">
          <Brain className="w-32 h-32" />
        </div>
        <div className="relative z-10 pr-12 md:pr-16">
          <h2 className="text-4xl font-extrabold text-text-primary mb-4 flex items-center gap-3">
            <Brain className="w-8 h-8 text-accent-blue" />
            Executive Summary
          </h2>
          <p className="text-base text-text-secondary leading-loose">
            {intelligence.executive_summary}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Escalation Board */}
        <div className="flex flex-col gap-6">
          <CollapsibleCard title="Priority Escalations" accentColor="#ef4444" badge={<SeverityBadge severity="CRITICAL" />}>
            <div className="space-y-5">
              {intelligence.escalation_flags?.map((flag, i) => (
                <div key={i} className="flex gap-4 p-5 bg-severity-critical/10 border border-severity-critical/20 rounded-lg items-start">
                  <AlertTriangle className="w-5 h-5 text-severity-critical shrink-0 mt-1" />
                  <p className="text-[15px] text-text-primary leading-7">{flag}</p>
                </div>
              ))}
              {(!intelligence.escalation_flags || intelligence.escalation_flags.length === 0) && (
                <div className="text-sm text-text-muted text-center py-6">No critical escalations this cycle.</div>
              )}
            </div>
          </CollapsibleCard>

          {/* Action Tracker */}
          <CollapsibleCard title="Action Recommendations" accentColor="#22c55e" badge={<span className="badge bg-severity-none/20 text-severity-none">{intelligence.recommended_actions?.length || 0}</span>}>
            <div className="space-y-5">
              {intelligence.recommended_actions?.map((act, i) => (
                <div key={i} className="flex flex-col gap-4 p-6 bg-bg-secondary rounded-lg border border-border">
                  <div className="flex items-center justify-between">
                    <PriorityBadge priority={act.priority} />
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold text-text-muted uppercase">{act.owner}</span>
                      <span className="text-[11px] text-text-secondary mt-0.5">{act.deadline_hint}</span>
                    </div>
                  </div>
                  <p className="text-[15px] text-text-primary leading-7">
                    {act.action}
                  </p>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        </div>

        <div className="flex flex-col gap-6">
          {/* Root Cause Clustering */}
          <CollapsibleCard title="Root Cause Analysis" accentColor="#f97316">
            <div className="space-y-5">
              {intelligence.root_cause_analysis?.map((rc, i) => (
                <div key={i} className="p-6 bg-bg-secondary rounded-lg border border-border hover:border-border-accent transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <span className="badge bg-bg-card border border-border text-text-secondary flex items-center gap-1.5">
                      {rc.dimension === 'PRODUCT' && <Target className="w-3.5 h-3.5" />}
                      {rc.dimension === 'STATE' && <Map className="w-3.5 h-3.5" />}
                      {rc.dimension === 'DISTRICT' && <Map className="w-3.5 h-3.5" />}
                      {rc.dimension === 'DEALER' && <Search className="w-3.5 h-3.5" />}
                      {rc.dimension}
                    </span>
                    {rc.impact_mt > 0 && (
                      <span className="text-sm font-bold text-severity-high">
                        -{formatMT(rc.impact_mt)} Impact
                      </span>
                    )}
                  </div>
                  <p className="text-[15px] text-text-primary leading-7">
                    {rc.finding}
                  </p>
                  {rc.pct_of_total_decline > 0 && (
                    <div className="mt-6">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-text-secondary">Contribution to decline</span>
                        <span className="text-sm font-bold text-severity-medium">{rc.pct_of_total_decline}%</span>
                      </div>
                      <div className="w-full bg-bg-primary h-3 rounded-full overflow-hidden">
                        <div className="bg-severity-medium h-full rounded-full transition-all duration-500" style={{ width: `${rc.pct_of_total_decline}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {(!intelligence.root_cause_analysis || intelligence.root_cause_analysis.length === 0) && (
                <div className="text-sm text-text-muted text-center py-8">
                  No root cause analysis items generated for this cycle.
                </div>
              )}
            </div>
          </CollapsibleCard>

          {/* Geographic Insights */}
          {intelligence.geographic_insights && (
            <CollapsibleCard title="Geographic Insights" accentColor="#8b5cf6">
              <div className="p-6 bg-bg-secondary rounded-lg border border-border relative">
                <Map className="absolute right-4 top-4 w-12 h-12 text-border-accent opacity-20 pointer-events-none" />
                <p className="text-[15px] text-text-secondary leading-7 relative z-10">
                  {intelligence.geographic_insights}
                </p>
              </div>
            </CollapsibleCard>
          )}
        </div>
      </div>
    </div>
  );
}
