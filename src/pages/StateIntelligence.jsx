import { useMemo, useEffect, useState } from 'react';
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
import { getPendingForPeriod, getTotalPendingForPeriod, getSharePctForPeriod, getBacklogClearance } from '../utils/pending';

export default function StateIntelligence({ pendingAvailableMonths = [] }) {
  const { data, loading, error, filters, dispatch } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [metricMode, setMetricMode] = useState("DESPATCH");
  const [selectedPendingMonth, setSelectedPendingMonth] = useState(() => pendingAvailableMonths[0]?.periodKey || '');

  useEffect(() => {
    if (pendingAvailableMonths && pendingAvailableMonths.length > 0 && !selectedPendingMonth) {
      setSelectedPendingMonth(pendingAvailableMonths[0].periodKey);
    }
  }, [pendingAvailableMonths, selectedPendingMonth]);

  const sortedPendingMonths = useMemo(() => {
    return [...pendingAvailableMonths].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [pendingAvailableMonths]);

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

  // Compute states data, sorted by metric
  const states = useMemo(() => {
    if (!data) return [];
    let rawStates = data.states || [];
    if (metricMode === 'PENDING') {
      return [...rawStates]
        .map(s => ({
          ...s,
          activePendingVal: getPendingForPeriod(s, selectedPendingMonth)
        }))
        .filter(s => selectedPendingMonth === 'ALL' || s.activePendingVal > 0)
        .sort((a, b) => b.activePendingVal - a.activePendingVal);
    }
    return rawStates;
  }, [data, metricMode, selectedPendingMonth]);

  const columns = useMemo(() => {
    if (metricMode === 'PENDING') {
      const totalPending = getTotalPendingForPeriod(states, selectedPendingMonth);
      return [
        {
          accessorKey: 'state',
          header: 'State',
          meta: { width: '35%', minWidth: '200px' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            const sharePct = getSharePctForPeriod(row, selectedPendingMonth, totalPending);
            const { severity, impactScore } = getBusinessImpact(pendingQty, 0, sharePct, 'STATE', row.state);
            
            return (
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-[85px] flex-shrink-0">
                  <ImpactBadge 
                    tier={severity}
                    score={impactScore}
                  />
                </div>
                <span className="font-medium truncate block">{info.getValue()}</span>
              </div>
            );
          },
        },
        {
          id: 'pendingQty',
          header: 'Pending Orders',
          meta: { width: '15%' },
          cell: info => {
            const row = info.row.original;
            const val = getPendingForPeriod(row, selectedPendingMonth);
            const allTime = getPendingForPeriod(row, 'ALL');
            return (
              <div className="flex flex-col">
                <span className="font-medium">{formatMT(val)}</span>
                {selectedPendingMonth !== 'ALL' && (
                  <span className="text-[10px] text-text-muted mt-0.5">
                    all-time: {formatMT(allTime)}
                  </span>
                )}
              </div>
            );
          },
        },
        {
          id: 'sharePct',
          header: 'Share %',
          meta: { width: '15%' },
          cell: info => {
            const row = info.row.original;
            const sharePct = getSharePctForPeriod(row, selectedPendingMonth, totalPending);
            return <span className="text-text-muted">{sharePct}%</span>;
          },
        },
        {
          id: 'clearance',
          header: 'Backlog Clearance',
          meta: { width: '25%' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            const dailyAvg = row.dailyAvgQty ?? 0;
            const clearance = getBacklogClearance(pendingQty, dailyAvg);
            
            if (pendingQty > 0) {
              const colorClass = clearance.status === 'CRITICAL' ? 'text-[#ef4444]' : clearance.status === 'HIGH' ? 'text-[#f97316]' : clearance.status === 'MEDIUM' ? 'text-[#eab308]' : 'text-[#22c55e]';
              return (
                <div className="flex flex-col select-none cursor-help" title={`${clearance.text} backlog clearance`}>
                  <span className={`text-sm font-bold ${colorClass}`}>
                    {clearance.text}
                  </span>
                  <span className="text-[10px] text-text-muted mt-0.5 block">
                    vs avg {formatMT(dailyAvg)}/d
                  </span>
                </div>
              );
            }
            return <span style={{ color: '#6b7280' }}>0 days (Clear)</span>;
          }
        }
      ];
    }

    return [
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
    ];
  }, [metricMode, selectedPendingMonth, states]);

  const topImpactedDistricts = useMemo(() => {
    if (!data || !data.states || !data.districts || !filters.selectedState) return [];

    const selectedStateName = filters.selectedState.replace(/\s+/g, '').toUpperCase();
    const stateDistricts = data.districts.filter(d => d.state && d.state.replace(/\s+/g, '').toUpperCase() === selectedStateName);

    if (metricMode === 'PENDING') {
      const totalPending = getTotalPendingForPeriod(stateDistricts, selectedPendingMonth);
      return stateDistricts
        .map(d => {
          const cur = getPendingForPeriod(d, selectedPendingMonth);
          const sharePct = getSharePctForPeriod(d, selectedPendingMonth, totalPending);
          const { severity, impactScore, theme } = getBusinessImpact(cur, 0, sharePct, 'DISTRICT', d.state);
          return {
            ...d,
            cur,
            prev: 0,
            mom: null,
            impactScore,
            severity,
            theme,
            drop: cur
          };
        })
        .filter(d => d.cur > 0)
        .sort((a, b) => b.cur - a.cur)
        .slice(0, 5);
    }

    const totalCur = data.totalCur ?? 0;
    return stateDistricts
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
  }, [data, filters.selectedState, metricMode, selectedPendingMonth]);

  if (loading) return (
    <div className="space-y-6">
      <div className="glass-card shadow-lg">
        <SkeletonLoader variant="table-row" count={8} />
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const selectedStateData = (data.states || []).find(s => s.state && filters.selectedState && s.state.replace(/\s+/g, '').toUpperCase() === filters.selectedState.replace(/\s+/g, '').toUpperCase());

  // Compute product-wise pending orders proportionally to despatch volumes
  const stateProductsWithPending = useMemo(() => {
    if (!selectedStateData || !selectedStateData.products) return [];
    const totalStateCur = selectedStateData.products.reduce((sum, p) => sum + (p.cur || 0), 0);
    const statePendingQty = getPendingForPeriod(selectedStateData, selectedPendingMonth);
    return selectedStateData.products.map(p => {
      const share = totalStateCur > 0 ? (p.cur || 0) / totalStateCur : 0;
      return {
        ...p,
        pendingQty: statePendingQty * share
      };
    });
  }, [selectedStateData, selectedPendingMonth]);

  // Compute accent color from frontend engine for selected state
  const selectedAccentColor = selectedStateData 
    ? (metricMode === 'PENDING'
      ? (() => {
          const pendingQty = getPendingForPeriod(selectedStateData, selectedPendingMonth);
          const totalPending = getTotalPendingForPeriod(states, selectedPendingMonth);
          const sharePct = getSharePctForPeriod(selectedStateData, selectedPendingMonth, totalPending);
          return getBusinessImpact(pendingQty, 0, sharePct, 'STATE', selectedStateData.state).theme.color;
        })()
      : getBusinessImpact(selectedStateData.cur, selectedStateData.prev, selectedStateData.share ?? 0, 'STATE', selectedStateData.state).theme.color)
    : '#6b7280';

  return (
    <div className="space-y-6">
      <FilterBar>
        {/* Divider */}
        <div className="w-[0.5px] h-6 bg-border/60 self-center hidden md:block" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-2">Metric View</span>
          {[
            { value: "DESPATCH", label: "Despatch" },
            { value: "PENDING", label: "Pending" }
          ].map(opt => {
            const active = metricMode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setMetricMode(opt.value)}
                className={`text-[11px] px-4 py-1.5 rounded-full border transition-all cursor-pointer ${active ? 'bg-blue-900/40 border-blue-500 text-blue-300' : 'border-border/60 text-text-muted hover:text-text-primary bg-transparent'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {metricMode === "PENDING" && (
          <>
            <div className="w-[0.5px] h-6 bg-border/60 self-center hidden md:block" />
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-2">Month</span>
              <select
                value={selectedPendingMonth}
                onChange={(e) => setSelectedPendingMonth(e.target.value)}
                className="filter-select select-field"
                style={{
                  fontSize: '12px',
                  padding: '4px 28px 4px 10px',
                  borderRadius: '99px',
                  border: '0.5px solid #2d3f55',
                  color: '#c4b5fd',
                  background: '#2a1f3a',
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23c4b5fd' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '12px'
                }}
              >
                <option value="ALL">All-Time Pending</option>
                {sortedPendingMonths.map(opt => (
                  <option key={opt.periodKey} value={opt.periodKey}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </FilterBar>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: State List/Table */}
        <div className={`${selectedStateData ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6 transition-all duration-300`}>
          <CollapsibleCard title={metricMode === 'PENDING' ? 'State Pending Order Rankings' : 'State Performance Rankings'}>
            <DataTable 
              data={states} 
              columns={columns} 
              onRowClick={(row) => dispatch({ type: 'SET_STATE', payload: row.state })}
            />
          </CollapsibleCard>

          {/* Top 5 Impacted Districts */}
          {selectedStateData && (
            <CollapsibleCard title={metricMode === 'PENDING' ? `Top 5 Districts by Pending (${selectedStateData.state})` : `Top 5 Impacted Districts (${selectedStateData.state})`}>
              {topImpactedDistricts.length === 0 ? (
                <div className="text-center text-text-muted py-6 text-sm">
                  No district pending orders available for this state.
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
                            <span className="text-[10px] text-text-muted">
                              {metricMode === 'PENDING' ? 'Pending MT' : 'Current Vol'}
                            </span>
                          </div>
                          <div className="w-[70px] flex justify-end">
                            {metricMode === 'PENDING' ? (
                              <span className="text-xs font-bold text-accent-blue">
                                {(() => {
                                  const totalPending = getTotalPendingForPeriod(data.districts.filter(td => td.state === d.state), selectedPendingMonth);
                                  return getSharePctForPeriod(d, selectedPendingMonth, totalPending);
                                })()}% share
                              </span>
                            ) : (
                              <MoMIndicator cur={d.cur} prev={d.prev} className="text-xs font-bold" />
                            )}
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
                            {metricMode === 'PENDING' ? (
                              <>
                                Backlog clearance: <strong style={{ color: d.theme.color }} className="font-bold">
                                  {getBacklogClearance(d.cur, d.dailyAvgQty).text}
                                </strong>
                              </>
                            ) : (
                              d.drop > 0 ? (
                                <>
                                  Loss of <strong style={{ color: d.theme.color }} className="font-bold">{formatMT(d.drop)}</strong>
                                </>
                              ) : (
                                <span className="text-severity-low font-medium">No volume loss</span>
                              )
                            )}
                          </span>
                          <span className="text-[10px] text-text-muted bg-bg-primary/50 px-2 py-0.5 rounded font-mono border border-border/10">
                            {metricMode === 'PENDING' ? `Score: ${d.impactScore}` : `Impact: ${d.impactScore}`}
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
              title={`${selectedStateData.state} ${metricMode === 'PENDING' ? 'Pending Analysis' : 'Intelligence'}`} 
              accentColor={selectedAccentColor}
              badge={<button 
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_STATE', payload: null }); }}
                className="text-xs text-text-muted hover:text-text-primary underline cursor-pointer"
              >Clear</button>}
            >
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-bg-secondary rounded-lg flex flex-col justify-center">
                  <div className="text-xs text-text-muted">
                    {metricMode === 'PENDING' ? 'Pending Orders' : 'MoM Trend'}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    {metricMode === 'PENDING' ? (
                      <>
                        <span className="font-extrabold text-sm text-text-primary">
                          {formatMT(getPendingForPeriod(selectedStateData, selectedPendingMonth))}
                        </span>
                        <span className="text-xs font-bold text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">
                          {(() => {
                            const totalPending = getTotalPendingForPeriod(states, selectedPendingMonth);
                            return getSharePctForPeriod(selectedStateData, selectedPendingMonth, totalPending);
                          })()}% Share
                        </span>
                      </>
                    ) : (
                      <MoMIndicator 
                        cur={selectedStateData.cur}
                        prev={selectedStateData.prev}
                        className="text-base" 
                      />
                    )}
                  </div>
                </div>

                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-2">
                    {metricMode === 'PENDING' ? 'Aging Risk' : 'Business Impact'}
                  </div>
                  <div className="mt-1">
                    {metricMode === 'PENDING' ? (
                      (() => {
                        const pendingQty = getPendingForPeriod(selectedStateData, selectedPendingMonth);
                        const totalPending = getTotalPendingForPeriod(states, selectedPendingMonth);
                        const sharePct = getSharePctForPeriod(selectedStateData, selectedPendingMonth, totalPending);
                        const { severity, impactScore } = getBusinessImpact(pendingQty, 0, sharePct, 'STATE', selectedStateData.state);
                        return <ImpactBadge tier={severity} score={impactScore} />;
                      })()
                    ) : (
                      <ImpactBadge 
                        tier={selectedStateData.impactTier}
                        score={selectedStateData.impactScore}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Daily Pace Benchmark vs Current Daily Rate */}
              {selectedStateData.dailyAvgQty !== undefined && (
                <div className="mb-6 p-4 bg-bg-secondary/60 border border-border/40 rounded-xl space-y-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Daily Pace Benchmark</h4>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${selectedStateData.lossFlag === 'BEHIND' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                      <span className={`w-2 h-2 rounded-full ${selectedStateData.lossFlag === 'BEHIND' ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                      {selectedStateData.lossFlag === 'BEHIND' ? 'BEHIND BENCHMARK' : 'ON TRACK'}
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
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">
                    {metricMode === 'PENDING' ? 'Pending Product Mix' : 'Product Mix'}
                  </h4>
                  <ShareDonutChart 
                    data={metricMode === 'PENDING' ? stateProductsWithPending : selectedStateData.products} 
                    dataKey={metricMode === 'PENDING' ? 'pendingQty' : 'cur'}
                    height={240} 
                  />
                </div>
                
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">
                    {metricMode === 'PENDING' ? 'Product Pending Breakdown' : 'Product MoM Breakdown'}
                  </h4>
                  <div className="space-y-2">
                    {(metricMode === 'PENDING'
                      ? [...stateProductsWithPending].sort((a, b) => (b.pendingQty || 0) - (a.pendingQty || 0))
                      : [...selectedStateData.products].sort((a, b) => {
                          const momA = calculateMoM(a.cur, a.prev);
                          const momB = calculateMoM(b.cur, b.prev);
                          return momA - momB;
                        })
                    )?.map(p => (
                      <div key={p.product} className="flex justify-between items-center text-sm p-2 bg-bg-secondary rounded">
                        <span className="font-medium">{p.product}</span>
                        <div className="flex gap-4">
                          <span className="text-text-muted w-16 text-right">
                            {formatMT(metricMode === 'PENDING' ? p.pendingQty : p.cur)}
                          </span>
                          <span className="w-16 text-right font-semibold">
                            {metricMode === 'PENDING' ? (
                              selectedStateData.pendingQty > 0 ? (
                                `${Math.round((p.pendingQty / selectedStateData.pendingQty) * 100)}% share`
                              ) : (
                                '0% share'
                              )
                            ) : (
                              <MoMIndicator cur={p.cur} prev={p.prev} />
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => navigate(`/districts?state=${selectedStateData.state}`)}
                  className="w-full py-2 bg-bg-secondary hover:bg-border border border-border rounded-lg text-sm transition-colors text-center cursor-pointer"
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
