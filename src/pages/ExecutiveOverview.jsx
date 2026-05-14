import { useData } from '../context/DataContext';
import FilterBar from '../components/common/FilterBar';
import KPICard from '../components/common/KPICard';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ProductBarChart from '../components/charts/ProductBarChart';
import AlertSeverityChart from '../components/charts/AlertSeverityChart';
import ImpactBadge from '../components/common/ImpactBadge';
import SeverityBadge from '../components/common/SeverityBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT } from '../utils/formatters';
import { useNavigate } from 'react-router-dom';

export default function ExecutiveOverview() {
  const { data, loading, error } = useData();
  const navigate = useNavigate();

  if (loading) return <div className="text-text-muted text-center py-12">Loading executive dashboard...</div>;
  if (error) return <div className="text-severity-critical text-center py-12">Error loading data: {error}</div>;
  if (!data) return null;

  const { intel, intelligence, products, alerts, alertCount } = data;

  const topStates = (intel?.scoredStates || []).filter(s => s.mom < 0).slice(0, 5);
  const topDistricts = (intel?.scoredDistricts || []).slice(0, 5);
  const inactiveDealers = (intel?.inactiveDealers || []).slice(0, 3);
  const decliningDealers = (intel?.scoredDealers || []).filter(d => !d.isInactive && d.mom < 0).slice(0, 3);

  return (
    <div className="animate-fade-in space-y-6">
      <FilterBar />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          label="Total Dispatch" 
          value={formatMT(data.totalCur)} 
          momPct={data.totalMoM}
          subtitle="vs Previous Period"
          accentColor="#3b82f6"
        />
        <KPICard 
          label="Pending Orders" 
          value={formatMT(data.pendingTotal)} 
          subtitle="open order book"
          accentColor="#f97316"
        />
        <KPICard 
          label="Active Alerts" 
          value={alertCount || 0} 
          subtitle="requires attention"
          accentColor={alertCount > 0 ? "#ef4444" : "#22c55e"}
        />
        <KPICard 
          label="Active Dealers" 
          value={data.dealers?.length || 0} 
          subtitle="currently transacting"
          accentColor="#8b5cf6"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column - Sales Analytics (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <CollapsibleCard title="Product Performance" badge={<span className="badge bg-bg-secondary text-text-muted">{products?.length || 0}</span>}>
            <ProductBarChart data={products} height={250} />
          </CollapsibleCard>

          <CollapsibleCard title="Top Declining States">
            <div className="space-y-3">
              {topStates.length === 0 && <div className="text-text-muted text-sm">No declining states</div>}
              {topStates.map(s => (
                <div key={s.state} className="flex items-center justify-between p-2 hover:bg-bg-card-hover rounded-lg cursor-pointer transition-colors" onClick={() => navigate(`/states?state=${s.state}`)}>
                  <div className="flex items-center gap-2">
                    <ImpactBadge score={s.impactScore ?? s.riskScore ?? 0} />
                    <span className="text-sm font-medium">{s.state}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-secondary">{formatMT(s.cur)}</div>
                    <MoMIndicator pct={s.mom} className="text-xs" />
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="District Hotspots">
            <div className="space-y-3">
              {topDistricts.length === 0 && <div className="text-text-muted text-sm">No district data</div>}
              {topDistricts.map(d => (
                <div key={d.district} className="flex items-center justify-between p-2 hover:bg-bg-card-hover rounded-lg cursor-pointer transition-colors" onClick={() => navigate(`/districts?district=${d.district}`)}>
                  <div className="flex items-center gap-2">
                    <ImpactBadge score={d.impactScore ?? d.riskScore ?? 0} />
                    <div>
                      <div className="text-sm font-medium leading-none">{d.district}</div>
                      <div className="text-[10px] text-text-muted mt-1">{d.state}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-secondary">{formatMT(d.cur)}</div>
                    <MoMIndicator pct={d.mom} className="text-xs" />
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        </div>

        {/* Right Column - Intelligence (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* AI Exec Summary */}
          {intelligence?.executive_summary && (
            <CollapsibleCard title="AI Executive Summary" accentColor="#06b6d4">
              <p className="text-sm text-text-secondary leading-relaxed">
                {intelligence.executive_summary}
              </p>
            </CollapsibleCard>
          )}

          {/* Escalation Flags */}
          {intelligence?.escalation_flags?.length > 0 && (
            <CollapsibleCard title="Escalation Flags" badge={<SeverityBadge severity="CRITICAL" />} accentColor="#ef4444">
              <div className="space-y-2">
                {intelligence.escalation_flags.map((flag, idx) => (
                  <div key={idx} className="p-3 bg-severity-critical/10 border-l-4 border-severity-critical rounded-r-lg text-sm text-text-primary">
                    {flag}
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CollapsibleCard title="Root Cause Analysis">
              <div className="space-y-3">
                {intelligence?.root_cause_analysis?.map((rc, idx) => (
                  <div key={idx} className="p-3 bg-bg-secondary rounded-lg border-l-2 border-accent-blue">
                    <div className="text-xs font-bold text-accent-blue mb-1">{rc.finding}</div>
                    {rc.impact_mt > 0 && (
                      <div className="text-[10px] text-text-muted">
                        Impact: <span className="text-severity-high font-bold">-{rc.impact_mt} MT</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleCard>

            <CollapsibleCard title="Recommended Actions">
              <div className="space-y-3">
                {intelligence?.recommended_actions?.slice(0, 4).map((act, idx) => (
                  <div key={idx} className="flex gap-3 p-3 border-b border-border last:border-0">
                    <SeverityBadge severity={act.priority} className="mt-0.5" />
                    <div>
                      <div className="text-xs text-text-primary leading-relaxed">{act.action}</div>
                      <div className="text-[10px] text-text-muted mt-1">{act.owner} • {act.deadline_hint}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          </div>

          <CollapsibleCard title="Dealer Impact Alerts">
            <div className="space-y-3">
              {inactiveDealers.map((d, i) => (
                <div key={`in-${i}`} className="flex items-center justify-between p-2">
                  <div>
                    <div className="text-sm text-text-primary font-medium truncate max-w-[150px] sm:max-w-[200px]">{d.client}</div>
                    <div className="text-xs text-text-muted">{d.district}, {d.state}</div>
                  </div>
                  <SeverityBadge severity="CRITICAL" />
                </div>
              ))}
              {decliningDealers.map((d, i) => (
                <div key={`dec-${i}`} className="flex items-center justify-between p-2">
                  <div>
                    <div className="text-sm text-text-primary font-medium truncate max-w-[150px] sm:max-w-[200px]">{d.client}</div>
                    <div className="text-xs text-text-muted">{d.district}, {d.state}</div>
                  </div>
                  <SeverityBadge severity="HIGH" />
                </div>
              ))}
            </div>
          </CollapsibleCard>

        </div>
      </div>
    </div>
  );
}
