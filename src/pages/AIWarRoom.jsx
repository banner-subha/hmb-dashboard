import { useData } from '../context/DataContext';
import CollapsibleCard from '../components/common/CollapsibleCard';
import SeverityBadge from '../components/common/SeverityBadge';
import AlertIntelligenceGrid from '../components/common/AlertIntelligenceGrid';
import { Brain, AlertTriangle, Target, Search, Map } from 'lucide-react';
import { formatMT } from '../utils/formatters';

export default function AIWarRoom() {
  const { data, loading, error } = useData();

  if (loading) return <div className="text-center py-12">Loading AI Intel...</div>;
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data?.intelligence) return <div className="text-center text-text-muted py-12">No AI intelligence data available for this cycle.</div>;

  const { intelligence } = data;

  return (
    <div className="animate-fade-in max-w-5xl mx-auto space-y-6">
      
      {/* Header Panel */}
      <div className="glass-card p-6 border-l-4 border-accent-blue bg-gradient-to-br from-bg-card to-bg-secondary relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-5 p-4 pointer-events-none">
          <Brain className="w-32 h-32" />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-extrabold text-text-primary mb-2 flex items-center gap-3">
            <Brain className="w-6 h-6 text-accent-blue" />
            AI Operations Command Center
          </h2>
          <p className="text-text-secondary max-w-3xl leading-relaxed">
            {intelligence.executive_summary}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Escalation Board */}
        <div className="space-y-6">
          <CollapsibleCard title="Priority Escalations" accentColor="#ef4444" badge={<SeverityBadge severity="CRITICAL" />}>
            <div className="space-y-3">
              {intelligence.escalation_flags?.map((flag, i) => (
                <div key={i} className="flex gap-3 p-3 bg-severity-critical/10 border border-severity-critical/20 rounded-lg items-start">
                  <AlertTriangle className="w-5 h-5 text-severity-critical shrink-0 mt-0.5" />
                  <p className="text-sm text-text-primary">{flag}</p>
                </div>
              ))}
              {(!intelligence.escalation_flags || intelligence.escalation_flags.length === 0) && (
                <div className="text-sm text-text-muted text-center py-4">No critical escalations this cycle.</div>
              )}
            </div>
          </CollapsibleCard>

          {/* Action Tracker */}
          <CollapsibleCard title="Action Recommendations" accentColor="#22c55e" badge={<span className="badge bg-severity-none/20 text-severity-none">{intelligence.recommended_actions?.length || 0}</span>}>
            <div className="space-y-4">
              {intelligence.recommended_actions?.map((act, i) => (
                <div key={i} className="relative pl-4 border-l-2 border-border pb-4 last:pb-0">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-bg-card border-2 border-accent-blue"></div>
                  <div className="flex gap-2 items-center mb-1">
                    <SeverityBadge severity={act.priority} />
                    <span className="text-xs font-bold text-text-muted uppercase">{act.owner}</span>
                    <span className="text-xs text-text-secondary ml-auto">{act.deadline_hint}</span>
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed mt-1">
                    {act.action}
                  </p>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        </div>

        <div className="space-y-6">
          {/* Root Cause Clustering */}
          <CollapsibleCard title="Root Cause Analysis" accentColor="#f97316">
            <div className="space-y-4">
              {intelligence.root_cause_analysis?.map((rc, i) => (
                <div key={i} className="p-4 bg-bg-secondary rounded-lg border border-border hover:border-border-accent transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="badge bg-bg-card border border-border text-text-secondary flex items-center gap-1">
                      {rc.dimension === 'PRODUCT' && <Target className="w-3 h-3" />}
                      {rc.dimension === 'STATE' && <Map className="w-3 h-3" />}
                      {rc.dimension === 'DISTRICT' && <Map className="w-3 h-3" />}
                      {rc.dimension === 'DEALER' && <Search className="w-3 h-3" />}
                      {rc.dimension}
                    </span>
                    {rc.impact_mt > 0 && (
                      <span className="text-xs font-bold text-severity-high">
                        -{formatMT(rc.impact_mt)} Impact
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-primary leading-relaxed">
                    {rc.finding}
                  </p>
                  {rc.pct_of_total_decline > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs text-text-secondary">Contribution to decline</span>
                        <span className="text-xs font-bold text-severity-medium">{rc.pct_of_total_decline}%</span>
                      </div>
                      <div className="w-full bg-bg-primary h-2.5 rounded-full overflow-hidden">
                        <div className="bg-severity-medium h-full rounded-full transition-all duration-500" style={{ width: `${rc.pct_of_total_decline}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleCard>

          {/* Geographic Insights */}
          {intelligence.geographic_insights && (
            <CollapsibleCard title="Geographic Insights" accentColor="#8b5cf6">
              <div className="p-4 bg-bg-secondary rounded-lg border border-border relative">
                <Map className="absolute right-4 top-4 w-12 h-12 text-border-accent opacity-20 pointer-events-none" />
                <p className="text-sm text-text-secondary leading-relaxed relative z-10">
                  {intelligence.geographic_insights}
                </p>
              </div>
            </CollapsibleCard>
          )}
        </div>
      </div>

      {/* Alert Intelligence Layer */}
      <AlertIntelligenceGrid alerts={data.alerts || []} />
    </div>
  );
}
