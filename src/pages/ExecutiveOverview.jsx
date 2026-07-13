import { useData } from '../context/DataContext';
import FilterBar from '../components/common/FilterBar';
import KPICard from '../components/common/KPICard';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ProductBarChart from '../components/charts/ProductBarChart';
import AlertSeverityChart from '../components/charts/AlertSeverityChart';
import ImpactBadge from '../components/common/ImpactBadge';
import SeverityBadge from '../components/common/SeverityBadge';
import PriorityBadge from '../components/common/PriorityBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT } from '../utils/formatters';
import { calculateMoM, formatTrend, getTrendColor, getSeverityTheme, getBusinessImpact } from '../utils/trendEngine';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { m } from 'framer-motion';
import { staggerContainer, kpiCard } from '../utils/motionVariants';


export default function ExecutiveOverview() {
  const { data, loading, error } = useData();
  const navigate = useNavigate();

  if (loading) return (
    <div className="space-y-6">
      <SkeletonLoader variant="kpi" count={4} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <SkeletonLoader variant="chart" count={2} className="h-72" />
        </div>
        <div className="lg:col-span-7 space-y-6">
          <SkeletonLoader variant="card" count={3} />
        </div>
      </div>
    </div>
  );
  if (error) return <div className="text-severity-critical text-center py-12">Error loading data: {error}</div>;
  if (!data) return null;

  const { intel, intelligence, products, alerts, alertCount } = data;

  // Compute total MoM on frontend
  const totalMoM = calculateMoM(data.totalCur, data.totalPrev);
  const totalTrendDisplay = formatTrend(totalMoM);
  const totalTrendColor = getTrendColor(totalMoM, data.totalCur, data.totalPrev);

  const topStates = (intel?.scoredStates || []).filter(s => {
    const mom = calculateMoM(s.cur, s.prev);
    return mom < 0;
  }).slice(0, 5);
  const topDistricts = (intel?.scoredDistricts || []).slice(0, 5);
  const inactiveDealers = (intel?.inactiveDealers || []).slice(0, 3);
  const decliningDealers = (intel?.scoredDealers || []).filter(d => {
    if (d.isInactive) return false;
    const mom = calculateMoM(d.cur, d.prev);
    return mom < 0;
  }).slice(0, 3);

  return (
    <div className="space-y-6">
      <FilterBar />

      {/* KPI Row */}
      <m.div 
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <m.div variants={kpiCard}>
          <KPICard 
            label="Total Dispatch" 
            value={formatMT(data.totalCur)} 
            momDisplay={totalTrendDisplay}
            momColor={totalTrendColor}
            subtitle="vs Previous Period"
            accentColor="#3b82f6"
          />
        </m.div>
        <m.div variants={kpiCard}>
          <KPICard 
            label="Total Pending Orders" 
            value={formatMT(data.pendingTotal)} 
            subtitle={data.pendingTotal > 0 ? "Active Order Backlog" : "No active backlog"}
            accentColor="#f97316"
          />
        </m.div>
        <m.div variants={kpiCard}>
          <KPICard 
            label="Active Alerts" 
            value={alertCount || 0} 
            subtitle="requires attention"
            accentColor={alertCount > 0 ? "#ef4444" : "#22c55e"}
          />
        </m.div>
        <m.div variants={kpiCard}>
          <KPICard 
            label="Active Dealers" 
            value={data.dealers?.filter(d => d.cur > 0).length || 0} 
            subtitle="currently transacting"
            accentColor="#8b5cf6"
          />
        </m.div>
      </m.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column - Sales Analytics (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <CollapsibleCard title="Product Performance" badge={<span className="badge bg-bg-secondary text-text-muted">{products?.length || 0}</span>}>
              <ProductBarChart data={products} height={250} />
            </CollapsibleCard>
          </div>

          <div>
            <CollapsibleCard title="Top Declining States">
              <div className="space-y-3">
                {topStates.length === 0 && <div className="text-text-muted text-sm">No declining states</div>}
                {topStates.map(s => (
                  <div key={s.state} className="flex items-center justify-between p-2 hover:bg-bg-card-hover rounded-lg cursor-pointer transition-colors" onClick={() => navigate(`/states?state=${s.state}`)}>
                    <div className="flex items-center gap-4">
                      <div className="w-[100px] flex-shrink-0">
                        <ImpactBadge 
                          tier={s.impactTier}
                          score={s.impactScore}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.state}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-text-primary">{formatMT(s.cur)}</div>
                      <MoMIndicator cur={s.cur} prev={s.prev} className="text-[10px]" />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          </div>

          <div>
            <CollapsibleCard title="District Hotspots">
              <div className="space-y-3">
                {topDistricts.length === 0 && <div className="text-text-muted text-sm">No district data</div>}
                {topDistricts.map(d => (
                  <div key={d.district} className="flex items-center justify-between p-2 hover:bg-bg-card-hover rounded-lg cursor-pointer transition-colors" onClick={() => navigate(`/districts?district=${d.district}`)}>
                    <div className="flex items-center gap-4">
                      <div className="w-[100px] flex-shrink-0">
                        <ImpactBadge 
                          tier={d.impactTier}
                          score={d.impactScore}
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium leading-none">{d.district}</div>
                        <div className="text-[10px] text-text-muted mt-1">{d.state}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-text-primary">{formatMT(d.cur)}</div>
                      <MoMIndicator cur={d.cur} prev={d.prev} className="text-[10px]" />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          </div>
        </div>

        {/* Right Column - Intelligence (7 cols) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* AI Exec Summary */}
          {intelligence?.executive_summary && (
            <div>
              <CollapsibleCard title="AI Executive Summary" accentColor="#06b6d4">
                <p className="text-[15px] text-text-secondary leading-relaxed md:leading-loose py-2">
                  {intelligence.executive_summary}
                </p>
              </CollapsibleCard>
            </div>
          )}

          {/* Escalation Flags */}
          {intelligence?.escalation_flags?.length > 0 && (
            <div>
              <CollapsibleCard title="Escalation Flags" badge={<SeverityBadge severity="CRITICAL" />} accentColor="#ef4444">
                <div className="space-y-3">
                  {intelligence.escalation_flags.map((flag, idx) => (
                    <div key={idx} className="p-4 bg-severity-critical/10 border-l-4 border-severity-critical rounded-r-lg text-[15px] text-text-primary leading-relaxed">
                      {flag}
                    </div>
                  ))}
                </div>
              </CollapsibleCard>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CollapsibleCard title="Root Cause Analysis">
              <div className="space-y-4">
                {intelligence?.root_cause_analysis?.map((rc, idx) => (
                  <div key={idx} className="p-4 bg-bg-secondary rounded-lg border-l-2 border-accent-blue space-y-1.5">
                    <div className="text-sm font-bold text-accent-blue leading-relaxed">{rc.finding}</div>
                    {rc.impact_mt > 0 && (
                      <div className="text-[11px] text-text-muted mt-1">
                        Impact: <span className="text-severity-high font-bold">-{formatMT(rc.impact_mt)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleCard>

            <CollapsibleCard title="Recommended Actions">
              <div className="space-y-4">
                {intelligence?.recommended_actions?.slice(0, 4).map((act, idx) => (
                  <div key={idx} className="flex flex-col gap-3 py-4 border-b border-border last:border-0">
                    <div className="flex items-center justify-between">
                      <PriorityBadge priority={act.priority} />
                      <div className="text-[11px] text-text-muted">{act.owner} • {act.deadline_hint}</div>
                    </div>
                    <div className="text-sm text-text-primary leading-relaxed">{act.action}</div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          </div>

          <div>
            <CollapsibleCard title="Dealer Impact Alerts">
              <div className="space-y-3">
                {inactiveDealers.map((d, i) => (
                    <div key={`in-${i}`} 
                      className="flex items-center justify-between p-3 rounded-lg bg-bg-card border border-border/50 transition-colors hover:bg-bg-secondary"
                    >
                      <div>
                        <div className="text-sm text-text-primary font-medium truncate max-w-[150px] sm:max-w-[200px]">{d.client}</div>
                        <div className="text-xs text-text-muted mt-0.5">{d.district}, {d.state}</div>
                      </div>
                      <SeverityBadge severity="CRITICAL" />
                    </div>
                ))}
                {decliningDealers.map((d, i) => {
                  return (
                    <div key={`dec-${i}`} 
                      className="flex items-center justify-between p-3 rounded-lg bg-bg-card border border-border/50 transition-colors hover:bg-bg-secondary"
                    >
                      <div>
                        <div className="text-sm text-text-primary font-medium truncate max-w-[150px] sm:max-w-[200px]">{d.client}</div>
                        <div className="text-xs text-text-muted mt-0.5">{d.district}, {d.state}</div>
                      </div>
                      <SeverityBadge severity={d.impactTier || 'LOW'} />
                    </div>
                  );
                })}
              </div>
            </CollapsibleCard>
          </div>
        </div>
      </div>
    </div>
  );
}
