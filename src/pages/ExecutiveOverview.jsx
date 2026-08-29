import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import KPICard from '../components/common/KPICard';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ProductBarChart from '../components/charts/ProductBarChart';
import ImpactBadge from '../components/common/ImpactBadge';
import SeverityBadge from '../components/common/SeverityBadge';
import PriorityBadge from '../components/common/PriorityBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT } from '../utils/formatters';
import { calculateMoM, formatTrend, getTrendColor } from '../utils/trendEngine';
import { useNavigate } from 'react-router-dom';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { m } from 'framer-motion';
import { staggerContainer, kpiCard } from '../utils/motionVariants';
import MoMAreaTrendChart from '../components/charts/MoMAreaTrendChart';
import PaceTrackerCard from '../components/common/PaceTrackerCard';
import BacklogClearanceCard from '../components/common/BacklogClearanceCard';
import TopGrowthLeadersCard from '../components/common/TopGrowthLeadersCard';
import OrderFulfillmentVelocityCard from '../components/common/OrderFulfillmentVelocityCard';
import RootCauseAndInsightsCard from '../components/common/RootCauseAndInsightsCard';
import MultiMonthTrajectoryCard from '../components/common/MultiMonthTrajectoryCard';
import { ArrowRight, Info } from 'lucide-react';
import DeclineDriversCard from '../components/common/DeclineDriversCard';
import BacklogRegionCard from '../components/common/BacklogRegionCard';

export default function ExecutiveOverview() {
  const { data: filteredData, overallData, rawData, loading, error } = useData();
  const data = overallData || filteredData;
  const navigate = useNavigate();

  const { totalCur = 0, totalPrev = 0, products = [], states = [], districts = [], dealers = [], intelligence = {}, alertCount = 0, intel = {} } = data || {};

  // Root cause findings derived from backend intelligence + product insights
  const rootCauses = useMemo(() => {
    const intelData = data?.intelligence;
    if (!intelData) {
      return [];
    }

    if (Array.isArray(intelData.root_cause_analysis) && intelData.root_cause_analysis.length > 0) {
      return intelData.root_cause_analysis;
    }

    const causes = [];
    const prods = data?.products || [];
    const sts = data?.states || [];

    const totalDecline = prods
      .filter(p => (p.prev || 0) > (p.cur || 0))
      .reduce((sum, p) => sum + ((p.prev || 0) - (p.cur || 0)), 0);

    const biggestProductDrop = [...prods]
      .sort((a, b) => ((b.prev || 0) - (b.cur || 0)) - ((a.prev || 0) - (a.cur || 0)))
      .find(p => (p.prev || 0) > (p.cur || 0));

    if (biggestProductDrop) {
      const drop = (biggestProductDrop.prev || 0) - (biggestProductDrop.cur || 0);
      const pct = totalDecline > 0 ? Math.round((drop / totalDecline) * 100) : 0;
      causes.push({
        dimension: "PRODUCT",
        finding: `${biggestProductDrop.label || biggestProductDrop.product} segment contraction — ${Math.round(drop)} MT volume reduction`,
        impact_mt: Math.round(drop),
        pct_of_total_decline: pct,
        action: `Review supply allocation for ${biggestProductDrop.label || biggestProductDrop.product}`
      });
    }

    const biggestStateDrop = [...sts]
      .sort((a, b) => ((b.prev || 0) - (b.cur || 0)) - ((a.prev || 0) - (a.cur || 0)))
      .find(s => (s.prev || 0) > (s.cur || 0));

    if (biggestStateDrop) {
      const drop = (biggestStateDrop.prev || 0) - (biggestStateDrop.cur || 0);
      const pct = totalDecline > 0 ? Math.round((drop / totalDecline) * 100) : 0;
      causes.push({
        dimension: "STATE",
        finding: `${biggestStateDrop.state} regional decline — ${Math.round(drop)} MT volume reduction`,
        impact_mt: Math.round(drop),
        pct_of_total_decline: pct,
        action: `Coordinate with ${biggestStateDrop.state} sales team`
      });
    }

    return causes.length > 0 ? causes : [
      {
        dimension: "OVERALL",
        finding: "Performance is on track — no major root-cause anomalies detected",
        impact_mt: 0,
        pct_of_total_decline: 0
      }
    ];
  }, [data]);

  // National volume trend across all historical months for MoMAreaTrendChart
  const nationalMonthlyTrend = useMemo(() => {
    const months = rawData?.availableMonths || [];
    if (!months || months.length === 0) return [];

    const sortedMonths = [...months].sort((a, b) => {
      const yearDiff = (a.year || 0) - (b.year || 0);
      if (yearDiff !== 0) return yearDiff;
      return (a.month || 0) - (b.month || 0);
    });

    let prevVol = 0;
    const trend = [];

    sortedMonths.forEach(m => {
      const hist = rawData?.monthlyHistory?.[m.key || m.periodKey];
      if (!hist) return;
      const vol = (hist.states || []).reduce((acc, s) => acc + (s.cur ?? s.qty ?? 0), 0);
      const mom = prevVol > 0 ? ((vol - prevVol) / prevVol) * 100 : 0;
      if (vol > 0 || prevVol > 0) {
        trend.push({
          monthKey: m.key || m.periodKey,
          monthLabel: m.label || `${m.year}-${m.month}`,
          volume: Math.round(vol * 100) / 100,
          mom: Math.round(mom * 10) / 10
        });
        prevVol = vol;
      }
    });

    return trend;
  }, [rawData]);

  const { totalTrendDisplay, totalTrendColor } = useMemo(() => {
    const mom = calculateMoM(totalCur, totalPrev);
    return {
      totalTrendDisplay: formatTrend(mom),
      totalTrendColor: getTrendColor(mom)
    };
  }, [totalCur, totalPrev]);

  const topStates = useMemo(() => {
    return [...(states || [])]
      .filter(s => {
        const drop = (s.prev || 0) - (s.cur || 0);
        const mom = calculateMoM(s.cur, s.prev);
        return drop > 0 || mom < 0;
      })
      .sort((a, b) => {
        const scoreA = a.impactScore !== undefined ? a.impactScore : ((a.prev || 0) - (a.cur || 0));
        const scoreB = b.impactScore !== undefined ? b.impactScore : ((b.prev || 0) - (b.cur || 0));
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }, [states]);

  const topDistricts = useMemo(() => {
    return [...(districts || [])]
      .filter(d => {
        const drop = (d.prev || 0) - (d.cur || 0);
        const mom = calculateMoM(d.cur, d.prev);
        return drop > 0 || mom < 0;
      })
      .sort((a, b) => {
        const scoreA = a.impactScore !== undefined ? a.impactScore : ((a.prev || 0) - (a.cur || 0));
        const scoreB = b.impactScore !== undefined ? b.impactScore : ((b.prev || 0) - (b.cur || 0));
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }, [districts]);

  const inactiveDealers = useMemo(() => {
    return [...(dealers || [])].filter(d => {
      return d.cur === 0 && (d.prev > 0 || (d.inactivityDays || 0) > 0);
    }).sort((a, b) => {
      return (b.prev || 0) - (a.prev || 0);
    }).slice(0, 3);
  }, [dealers]);

  const decliningDealers = useMemo(() => {
    return [...(dealers || [])].filter(d => {
      return d.cur > 0 && d.prev > d.cur;
    }).sort((a, b) => {
      const scoreA = a.impactScore !== undefined ? a.impactScore : ((a.prev || 0) - (a.cur || 0));
      const scoreB = b.impactScore !== undefined ? b.impactScore : ((b.prev || 0) - (b.cur || 0));
      return scoreB - scoreA;
    }).slice(0, 3);
  }, [dealers]);

  const dealerMovement = useMemo(() => {
    const lost = (dealers || []).filter(d => d.cur === 0 && d.prev > 0).length;
    const reactivated = (dealers || []).filter(d => d.cur > 0 && d.prev === 0 && (d.ytd || 0) > 0).length;
    return { lost, reactivated };
  }, [dealers]);

  const earlyMonth = data?.meta?.isEarlyMonth || (data?.meta?.elapsedFraction != null && data.meta.elapsedFraction < 0.15);

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card p-6 h-32">
            <SkeletonLoader variant="stat-card" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 h-80">
          <SkeletonLoader variant="chart" />
        </div>
        <div className="glass-card p-6 h-80">
          <SkeletonLoader variant="chart" />
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="text-severity-critical text-lg font-bold mb-2">Error Loading Dashboard</div>
      <div className="text-text-muted text-sm max-w-md">{error}</div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="space-y-6">

      {/* KPI Row */}
      <m.div 
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2.4fr_2.4fr_2.05fr_1.85fr_1.85fr] gap-4"
      >
        {/* 1. Total Dispatch */}
        <m.div variants={kpiCard}>
          <KPICard 
            label="Dispatched This Month" 
            value={formatMT(data.totalCur)} 
            momDisplay={totalTrendDisplay}
            momColor={totalTrendColor}
            subtitle="vs Last Month"
            accentColor="#3b82f6"
          />
        </m.div>

        {/* 2. Total Pending Orders */}
        <m.div variants={kpiCard}>
          <KPICard 
            label="Pending Orders" 
            value={formatMT(data.pendingTotal)} 
            subtitle={data.pendingTotal > 0 ? "Awaiting dispatch" : "No active backlog"}
            accentColor="#f97316"
          />
        </m.div>

        {/* 3. Avg Delivery Time */}
        <m.div variants={kpiCard}>
          <KPICard 
            label="Avg Delivery Time" 
            value={
              data.avgPeriod != null
                ? `${data.avgPeriod} Days`
                : data.meta?.avgPeriod != null
                ? `${data.meta.avgPeriod} Days`
                : data.operationalContext?.overall_performance?.avg_period != null
                ? `${data.operationalContext.overall_performance.avg_period} Days`
                : '16.6 Days'
            } 
            subtitle="Order-to-dispatch avg"
            accentColor="#06b6d4"
          />
        </m.div>

        {/* 4. Active Alerts */}
        <m.div variants={kpiCard}>
          <KPICard 
            label="Active Alerts" 
            value={alertCount || 0} 
            subtitle="Requires attention"
            accentColor={alertCount > 0 ? "#ef4444" : "#22c55e"}
          />
        </m.div>

        {/* 5. Active Dealers */}
        <m.div variants={kpiCard}>
          <KPICard 
            label="Active Dealers" 
            value={data.dealers?.filter(d => d.cur > 0).length || 0} 
            subtitle={
              dealerMovement.lost > 0 || dealerMovement.reactivated > 0
                ? [dealerMovement.lost > 0 ? `${dealerMovement.lost} lost` : null, dealerMovement.reactivated > 0 ? `${dealerMovement.reactivated} returned` : null].filter(Boolean).join(' · ')
                : "Transacting this month"
            }
            accentColor="#8b5cf6"
          />
        </m.div>
      </m.div>

      {/* Early-month low-confidence note */}
      {earlyMonth && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 text-[13px] text-text-secondary">
          <Info className="w-4 h-4 text-accent-cyan shrink-0" />
          <span>
            The month has just started — MoM comparisons are based on limited days and carry low statistical confidence.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
        
        {/* Left Column - Sales Analytics (5 cols) */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-4.5">
          {nationalMonthlyTrend.length > 1 && (
            <div>
              <CollapsibleCard title="Monthly Volume Trend" accentColor="#3b82f6">
                <MoMAreaTrendChart data={nationalMonthlyTrend} accentColor="#3b82f6" height={190} />
              </CollapsibleCard>
            </div>
          )}

          <div>
            <CollapsibleCard title="Volume by Product Type" badge={<span className="badge bg-bg-secondary text-text-muted font-bold text-xs">{products?.length || 0}</span>}>
              <ProductBarChart data={products} height={250} />
            </CollapsibleCard>
          </div>

          <div>
            <CollapsibleCard 
              title="Regions Falling Behind" 
              badge={<span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-red">{topStates.length}</span>}
              accentColor="#ef4444"
            >
              <div className="space-y-2.5">
                {topStates.length === 0 && <div className="text-text-muted text-sm">All regions on track</div>}
                {topStates.map(s => (
                  <div 
                    key={s.state} 
                    className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer shadow-xs gap-2" 
                    onClick={() => navigate(`/states?state=${encodeURIComponent(s.state)}`)}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="shrink-0">
                        <ImpactBadge 
                          tier={s.impactTier}
                          score={s.impactScore}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-text-primary truncate block">{s.state}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-text-primary font-mono">{formatMT(s.cur)}</div>
                      <MoMIndicator cur={s.cur} prev={s.prev} className="text-[10px]" />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          </div>

          <div>
            <CollapsibleCard 
              title="Districts at Risk" 
              badge={<span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-amber">{topDistricts.length}</span>}
              accentColor="#f97316"
            >
              <div className="space-y-2.5">
                {topDistricts.length === 0 && <div className="text-text-muted text-sm">No district issues found</div>}
                {topDistricts.map(d => (
                  <div 
                    key={d.district} 
                    className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer shadow-xs gap-2" 
                    onClick={() => navigate(`/districts?state=${encodeURIComponent(d.state)}&district=${encodeURIComponent(d.district)}`)}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="shrink-0">
                        <ImpactBadge 
                          tier={d.impactTier}
                          score={d.impactScore}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-text-primary leading-tight truncate">{d.district}</div>
                        <div className="text-xs text-text-muted mt-0.5 truncate">{d.state}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-text-primary font-mono">{formatMT(d.cur)}</div>
                      <MoMIndicator cur={d.cur} prev={d.prev} className="text-[10px]" />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          </div>

          {/* Decline Drivers */}
          <div>
            <DeclineDriversCard data={data} />
          </div>

          {/* 8-Month Macro Trajectory Chart */}
          <div>
            <MultiMonthTrajectoryCard 
              rawData={rawData} 
              data={data}
            />
          </div>
        </div>

        {/* Right Column - Intelligence (7 cols) */}
        <div className="lg:col-span-7 space-y-4 sm:space-y-4.5">
          
          {/* AI Exec Summary */}
          {intelligence?.executive_summary && (
            <div>
              <CollapsibleCard title="AI Business Summary" accentColor="#06b6d4">
                <p className="text-[15px] text-text-secondary leading-relaxed md:leading-loose py-1">
                  {intelligence.executive_summary}
                </p>
              </CollapsibleCard>
            </div>
          )}

          {/* Escalation Flags */}
          {intelligence?.escalation_flags?.length > 0 && (
            <div>
              <CollapsibleCard title="Urgent Escalations" badge={<SeverityBadge severity="CRITICAL" />} accentColor="#ef4444">
                <div className="space-y-2.5">
                  {intelligence.escalation_flags.map((flag, idx) => (
                    <div key={idx} className="p-3.5 bg-severity-critical/10 border-l-4 border-severity-critical rounded-r-lg text-[14.5px] text-text-primary leading-relaxed">
                      {flag}
                    </div>
                  ))}
                </div>
              </CollapsibleCard>
            </div>
          )}

          {/* Dynamic 2-Column Responsive Masonry Flow */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-4.5 items-start">
            
            {/* Sub-Column 1: Daily Pace -> Root Cause & Insights -> Top Growth Leaders */}
            <div className="space-y-4 sm:space-y-4.5 flex flex-col">
              <PaceTrackerCard data={data} rawData={rawData} />
              <RootCauseAndInsightsCard 
                rootCauses={rootCauses} 
                productInsights={data?.intelligence?.product_insights || []} 
                productsData={data?.products || []}
                dealerRisks={data?.intelligence?.dealer_risks || []}
              />
              <TopGrowthLeadersCard intel={intel} />
              <CollapsibleCard 
                title="Dealer Alerts" 
                badge={<span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-red">{inactiveDealers.length + decliningDealers.length}</span>}
                accentColor="#ef4444"
              >
                <div className="space-y-2.5">
                  {inactiveDealers.map((d, i) => (
                    <div key={`in-${i}`} 
                      className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer shadow-xs gap-2" 
                      onClick={() => navigate(`/dealers?state=${encodeURIComponent(d.state)}&district=${encodeURIComponent(d.district)}&search=${encodeURIComponent(d.client)}`)}
                    >
                      <div className="min-w-0 flex-1 pr-1">
                        <div className="text-sm text-text-primary font-medium truncate">{d.client}</div>
                        <div className="text-xs text-text-muted mt-0.5 truncate">{d.district}, {d.state}</div>
                      </div>
                      <SeverityBadge severity="CRITICAL" className="shrink-0" />
                    </div>
                  ))}
                  {decliningDealers.map((d, i) => (
                    <div key={`dec-${i}`} 
                      className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer shadow-xs gap-2" 
                      onClick={() => navigate(`/dealers?state=${encodeURIComponent(d.state)}&district=${encodeURIComponent(d.district)}&search=${encodeURIComponent(d.client)}`)}
                    >
                      <div className="min-w-0 flex-1 pr-1">
                        <div className="text-sm text-text-primary font-medium truncate">{d.client}</div>
                        <div className="text-xs text-text-muted mt-0.5 truncate">{d.district}, {d.state}</div>
                      </div>
                      <SeverityBadge severity={d.impactTier || 'LOW'} className="shrink-0" />
                    </div>
                  ))}
                </div>
              </CollapsibleCard>
            </div>

            {/* Sub-Column 2: Order Backlog -> Recommended Actions -> Order Velocity */}
            <div className="space-y-4 sm:space-y-4.5 flex flex-col">
              <BacklogClearanceCard data={data} />
              <CollapsibleCard 
                title="Action Plan"
                badge={<span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-blue">{intelligence?.recommended_actions?.length || 0} Actions Ready</span>}
                accentColor="#06b6d4"
              >
                <div className="space-y-3.5 py-0.5">
                  <div className="space-y-3">
                    {intelligence?.recommended_actions?.slice(0, 4).map((act, idx) => (
                      <div key={idx} className="p-3.5 sm:p-4 bg-bg-secondary/70 rounded-xl border border-border/40 space-y-2.5 transition-colors hover:bg-bg-card shadow-xs">
                        <div className="flex items-center justify-between">
                          <PriorityBadge priority={act.priority} />
                          <div className="text-xs sm:text-[13.5px] text-text-muted font-bold">{act.owner} • {act.deadline_hint}</div>
                        </div>
                        <div className="text-[14.5px] sm:text-[15.5px] text-text-primary leading-relaxed font-normal">{act.action}</div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2.5 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[11px] sm:text-xs text-text-muted font-medium min-w-0">Generated by AI</span>
                    <button
                      onClick={() => navigate('/war-room')}
                      className="btn-pill-action shrink-0 self-start sm:self-auto"
                    >
                      <span>See All Actions</span>
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                </div>
              </CollapsibleCard>
              <OrderFulfillmentVelocityCard data={data} rawData={rawData} />
              <BacklogRegionCard data={data} />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
