import { useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ShareDonutChart from '../components/charts/ShareDonutChart';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT } from '../utils/formatters';
import { calculateMoM, getBusinessImpact } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function StateIntelligence() {
  const { data, loading, error, filters, dispatch } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Sync URL params to Context filters
  useEffect(() => {
    const stateParam = searchParams.get('state');
    const districtParam = searchParams.get('district');
    dispatch({ type: 'SET_STATE', payload: stateParam || null });
    if (districtParam) dispatch({ type: 'SET_DISTRICT', payload: districtParam });
  }, [searchParams, dispatch]);

  // Sync Context filters to URL params
  useEffect(() => {
    const params = {};
    if (filters.selectedState) params.state = filters.selectedState;
    if (filters.selectedDistrict) params.district = filters.selectedDistrict;
    setSearchParams(params);
  }, [filters.selectedState, filters.selectedDistrict, setSearchParams]);

  const columns = useMemo(() => [
    {
      accessorKey: 'state',
      header: 'State',
      meta: { width: '35%', minWidth: '200px' },
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[85px] flex-shrink-0">
              <ImpactBadge 
              tier={row.impactTier}
              score={row.impactScore}
            />
            </div>
            <span className="font-medium truncate block">{info.getValue()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'cur',
      header: 'Current Vol',
      meta: { width: '12%' },
      cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
    },
    {
      accessorKey: 'prev',
      header: 'Prev Vol',
      meta: { width: '12%' },
      cell: info => <span className="text-text-muted">{formatMT(info.getValue())}</span>,
    },
    {
      header: 'Trend',
      accessorKey: 'mom',
      meta: { width: '12%' },
      cell: info => {
        const row = info.row.original;
        return <MoMIndicator cur={row.cur} prev={row.prev} />;
      },
    },
    {
      accessorKey: 'share',
      header: 'Share %',
      meta: { width: '8%' },
      cell: info => <span className="text-text-muted">{info.getValue()}%</span>,
    },
    {
      id: 'pace',
      header: 'Pace vs Avg',
      meta: { width: '170px' },
      cell: info => {
        const row = info.row.original;
        const { lossFlag, lossDeltaPct, currentDailyRate, dailyAvgQty } = row;
        
        const curRate = currentDailyRate != null ? Number(currentDailyRate) : 0;
        const avgQty = dailyAvgQty != null ? Number(dailyAvgQty) : 0;
        const rawDeltaPct = lossDeltaPct != null ? Number(lossDeltaPct) : 0;
        const deltaPct = Math.min(300, rawDeltaPct);
        
        if (lossFlag === 'AHEAD' || lossFlag === 'BEHIND') {
          const isAhead = lossFlag === 'AHEAD';
          const sign = isAhead ? '+' : '';
          const showPct = lossDeltaPct !== undefined ? `${isAhead ? '▲' : '▼'} ${sign}${deltaPct}%` : (isAhead ? '▲' : '▼');
          const colorClass = isAhead ? 'text-[#22c55e]' : 'text-[#ef4444]';
          
          const fullTooltip = `${curRate.toFixed(2)} MT/day vs avg ${avgQty.toFixed(2)} MT/day (${isAhead ? 'above' : 'below'} historical daily avg by ${Math.abs(deltaPct)}%)`;
          const shortRateText = `${curRate.toFixed(1)} vs ${avgQty.toFixed(1)} MT/d`;
          
          return (
            <div className="flex flex-col select-none cursor-help" title={fullTooltip} style={{ minWidth: '160px', maxWidth: '180px' }}>
              <span className={`text-sm font-bold ${colorClass}`}>
                {showPct}
              </span>
              <span className="text-[10px] text-text-muted mt-0.5 truncate block">
                {shortRateText}
              </span>
            </div>
          );
        }
        
        return <span style={{ color: '#6b7280' }}>—</span>;
      }
    }
  ], []);

  const topImpactedDistricts = useMemo(() => {
    if (!data || !data.states || !data.districts || !filters.selectedState) return [];

    const selectedStateData = data.states.find(s => s.state && filters.selectedState && s.state.replace(/\s+/g, '').toUpperCase() === filters.selectedState.replace(/\s+/g, '').toUpperCase());
    if (!selectedStateData) return [];

    const totalCur = data.totalCur ?? 0;
    return data.districts
      .map(d => {
        const cur = d.cur || 0;
        const prev = d.prev || 0;
        const mom = calculateMoM(cur, prev);
        const share = totalCur > 0 ? (cur / totalCur) * 100 : 0;
        const { impactScore, severity, theme } = getBusinessImpact(cur, prev, share, 'DISTRICT', d.state);
        const drop = Math.max(0, prev - cur);
        return {
          ...d,
          cur,
          prev,
          mom,
          impactScore,
          severity,
          theme,
          drop
        };
      })
      .sort((a, b) => b.impactScore - a.impactScore || b.drop - a.drop || b.cur - a.cur)
      .slice(0, 5);
  }, [data, filters.selectedState]);

  if (loading) return (
    <div className="space-y-6">
      <div className="glass-card shadow-lg">
        <SkeletonLoader variant="table-row" count={8} />
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const states = data.states || [];
  const selectedStateData = states.find(s => s.state && filters.selectedState && s.state.replace(/\s+/g, '').toUpperCase() === filters.selectedState.replace(/\s+/g, '').toUpperCase());

  // Compute accent color from frontend engine for selected state
  const selectedAccentColor = selectedStateData 
    ? getBusinessImpact(selectedStateData.cur, selectedStateData.prev, selectedStateData.share ?? 0, 'STATE', selectedStateData.state).theme.color 
    : '#6b7280';

  return (
    <div className="space-y-6">
      <FilterBar />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: State List/Table */}
        <div className={`${selectedStateData ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6 transition-all duration-300`}>
          <CollapsibleCard title="State Performance Rankings">
            <DataTable 
              data={states} 
              columns={columns} 
              onRowClick={(row) => dispatch({ type: 'SET_STATE', payload: row.state })}
            />
          </CollapsibleCard>

          {/* Top 5 Impacted Districts */}
          {selectedStateData && (
            <CollapsibleCard title={`Top 5 Impacted Districts (${selectedStateData.state})`}>
              {topImpactedDistricts.length === 0 ? (
                <div className="text-center text-text-muted py-6 text-sm">
                  No district data available for this state.
                </div>
              ) : (
                <div className="space-y-3">
                  {topImpactedDistricts.map(d => (
                    <div 
                      key={d.district}
                      onClick={() => {
                        dispatch({ type: 'SET_STATE', payload: d.state });
                        dispatch({ type: 'SET_DISTRICT', payload: d.district });
                        navigate(`/districts?state=${d.state}&district=${d.district}`);
                      }}
                      className="p-3 bg-bg-secondary/40 hover:bg-bg-card-hover border border-border/20 hover:border-border/60 rounded-xl transition-all duration-200 cursor-pointer flex flex-col gap-2 relative overflow-hidden group shadow-sm"
                    >
                      {/* Top Row: Name and badge, Volume and trend */}
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-bold text-text-primary text-sm sm:text-base truncate group-hover:text-accent-blue transition-colors">
                            {d.district}
                          </span>
                           <ImpactBadge tier={d.severity} score={d.impactScore} />
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-right">
                          <div>
                            <span className="font-semibold text-text-primary text-sm block">
                              {formatMT(d.cur)}
                            </span>
                            <span className="text-[10px] text-text-muted">Current Vol</span>
                          </div>
                          <div className="w-[70px] flex justify-end">
                            <MoMIndicator cur={d.cur} prev={d.prev} className="text-xs font-bold" />
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: Progress bar and description */}
                      <div className="space-y-1.5 mt-1">
                        <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden relative border border-border/10">
                          <div 
                            className="h-full rounded-full transition-all duration-500 ease-out" 
                            style={{ 
                              width: `${d.impactScore}%`, 
                              backgroundColor: d.theme.color,
                              boxShadow: `0 0 8px ${d.theme.color}40`
                            }} 
                          />
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-text-muted">
                            {d.drop > 0 ? (
                              <>
                                Loss of <strong style={{ color: d.theme.color }} className="font-bold">{formatMT(d.drop)}</strong>
                              </>
                            ) : (
                              <span className="text-severity-low font-medium">No volume loss</span>
                            )}
                          </span>
                          <span className="text-[10px] text-text-muted bg-bg-primary/50 px-2 py-0.5 rounded font-mono border border-border/10">
                            Impact: {d.impactScore}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleCard>
          )}
        </div>

        {/* Right Col: Detail Panel (only shows if state selected) */}
        {selectedStateData && (
          <div className="lg:col-span-5 space-y-6">
            <CollapsibleCard 
              title={`${selectedStateData.state} Intelligence`} 
              accentColor={selectedAccentColor}
              badge={<button 
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_STATE', payload: null }); }}
                className="text-xs text-text-muted hover:text-text-primary underline"
              >Clear</button>}
            >
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-bg-secondary rounded-lg flex justify-between items-center">
                  <div className="text-xs text-text-muted">MoM Trend</div>
                  <MoMIndicator 
                    cur={selectedStateData.cur}
                    prev={selectedStateData.prev}
                    className="text-base" 
                  />
                </div>

                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-2">Business Impact</div>
                  <div className="mt-1">
                    <ImpactBadge 
                      tier={selectedStateData.impactTier}
                      score={selectedStateData.impactScore}
                    />
                  </div>
                </div>
              </div>

              {/* Daily Pace Benchmark vs Current Daily Rate */}
              {selectedStateData.dailyAvgQty !== undefined && (
                <div className="mb-6 p-4 bg-bg-secondary/60 border border-border/40 rounded-xl space-y-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Daily Pace Benchmark</h4>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${selectedStateData.lossFlag ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                      <span className={`w-2 h-2 rounded-full ${selectedStateData.lossFlag ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                      {selectedStateData.lossFlag ? 'BEHIND BENCHMARK' : 'ON TRACK'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Daily Avg Benchmark</span>
                      <div className="text-base font-extrabold text-text-primary">{formatMT(selectedStateData.dailyAvgQty)}/day</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Current Daily Rate</span>
                      <div className="text-base font-extrabold text-text-primary">{formatMT(selectedStateData.currentDailyRate)}/day</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Expected MTD Pace</span>
                      <div className="text-sm font-semibold text-text-primary">{formatMT(selectedStateData.expectedMtd)}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Actual MTD Dispatch</span>
                      <div className="text-sm font-semibold text-text-primary">{formatMT(selectedStateData.actualMtd)}</div>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-border/40 flex justify-between items-center text-xs">
                    <span className="text-text-muted">Pace Variance (Delta)</span>
                    <span className={`font-bold ${selectedStateData.lossDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {selectedStateData.lossDelta >= 0 ? '+' : ''}{formatMT(selectedStateData.lossDelta)}/day
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">Product Mix</h4>
                  <ShareDonutChart data={selectedStateData.products} height={240} />
                </div>
                
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">Product MoM Breakdown</h4>
                  <div className="space-y-2">
                    {selectedStateData.products?.sort((a,b) => {
                      const momA = calculateMoM(a.cur, a.prev);
                      const momB = calculateMoM(b.cur, b.prev);
                      return momA - momB;
                    }).map(p => (
                      <div key={p.product} className="flex justify-between items-center text-sm p-2 bg-bg-secondary rounded">
                        <span className="font-medium">{p.product}</span>
                        <div className="flex gap-4">
                          <span className="text-text-muted w-16 text-right">{formatMT(p.cur)}</span>
                          <span className="w-16 text-right"><MoMIndicator cur={p.cur} prev={p.prev} /></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => navigate(`/districts?state=${selectedStateData.state}`)}
                  className="w-full py-2 bg-bg-secondary hover:bg-border border border-border rounded-lg text-sm transition-colors text-center"
                >
                  View District Breakdown →
                </button>
              </div>
            </CollapsibleCard>
          </div>
        )}
      </div>
    </div>
  );
}
