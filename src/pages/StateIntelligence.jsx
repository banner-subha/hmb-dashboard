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
import { Map } from 'lucide-react';

export default function StateIntelligence({ pendingAvailableMonths = [] }) {
  const { rawData, data, loading, error, filters, dispatch, filterOptions } = useData();
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

  // Compute national pending total to calculate true share of backlog (strategically correct)
  const nationalPendingTotal = useMemo(() => {
    const baseStates = rawData?.states || data?.states || [];
    return getTotalPendingForPeriod(baseStates, selectedPendingMonth);
  }, [rawData, data, selectedPendingMonth]);

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
      const totalPending = nationalPendingTotal;
      return [
        {
          accessorKey: 'state',
          header: 'State',
          meta: { width: '35%', minWidth: '180px' },
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
          meta: { width: '20%', minWidth: '110px' },
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
          meta: { width: '15%', minWidth: '80px' },
          cell: info => {
            const row = info.row.original;
            const sharePct = getSharePctForPeriod(row, selectedPendingMonth, totalPending);
            return <span className="text-text-muted">{sharePct}%</span>;
          },
        },
        {
          id: 'clearance',
          header: 'Backlog Clearance',
          meta: { width: '30%', minWidth: '160px' },
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
        meta: { width: '28%', minWidth: '220px' },
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
        meta: { width: '15%', minWidth: '110px' },
        cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
      },
      {
        accessorKey: 'prev',
        header: 'Prev Vol',
        meta: { width: '15%', minWidth: '110px' },
        cell: info => <span className="text-text-muted">{formatMT(info.getValue())}</span>,
      },
      {
        header: 'Trend',
        accessorKey: 'mom',
        meta: { width: '12%', minWidth: '95px' },
        cell: info => {
          const row = info.row.original;
          return <MoMIndicator cur={row.cur} prev={row.prev} />;
        },
      },
      {
        accessorKey: 'share',
        header: 'Share %',
        meta: { width: '10%', minWidth: '80px' },
        cell: info => <span className="text-text-muted">{info.getValue()}%</span>,
      },
      {
        id: 'pace',
        header: 'Pace vs Avg',
        meta: { width: '20%', minWidth: '165px' },
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
              <div className="flex flex-col select-none cursor-help" title={fullTooltip} style={{ minWidth: '145px', maxWidth: '170px' }}>
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

  // Compute top pending dealers for the selected state (highest → lowest)
  const topPendingDealers = useMemo(() => {
    if (!selectedStateData || !data?.dealers) return [];
    const stateNorm = selectedStateData.state?.replace(/\s+/g, '').toUpperCase();
    return (data.dealers || [])
      .filter(dl => dl.state?.replace(/\s+/g, '').toUpperCase() === stateNorm)
      .map(dl => ({
        client: dl.client,
        state: dl.state,
        district: dl.district,
        pendingQty: getPendingForPeriod(dl, selectedPendingMonth),
        products: (dl.products || []).map(p => p.product).join(', ')
      }))
      .filter(dl => dl.pendingQty > 0)
      .sort((a, b) => b.pendingQty - a.pendingQty);
  }, [selectedStateData, data?.dealers, selectedPendingMonth]);

  // Compute accent color from frontend engine for selected state
  const selectedAccentColor = selectedStateData 
    ? (metricMode === 'PENDING'
      ? (() => {
          const pendingQty = getPendingForPeriod(selectedStateData, selectedPendingMonth);
          const totalPending = nationalPendingTotal;
          const sharePct = getSharePctForPeriod(selectedStateData, selectedPendingMonth, totalPending);
          return getBusinessImpact(pendingQty, 0, sharePct, 'STATE', selectedStateData.state).theme.color;
        })()
      : getBusinessImpact(selectedStateData.cur, selectedStateData.prev, selectedStateData.share ?? 0, 'STATE', selectedStateData.state).theme.color)
    : '#6b7280';

  return (
    <div className="space-y-6">
      {/* PAGE TITLE AT THE TOP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <h2 className="text-3xl font-extrabold text-text-primary flex items-center gap-3">
          <Map className="w-7 h-7 text-accent-blue" />
          {metricMode === 'PENDING' ? 'State Pending Order Rankings' : 'State Performance Rankings'}
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: State List/Table */}
        <div className={`${selectedStateData ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6 transition-all duration-300`}>
          <div className="glass-card p-6 space-y-6">
            
            {/* Integrated Filters Row */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between pb-4 border-b border-border/40 w-full">
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-1">Filters:</span>
                
                {/* State Select */}
                <select
                  className="filter-select text-xs min-w-[110px] py-2 px-3"
                  value={filters.selectedState || ''}
                  onChange={(e) => dispatch({ type: 'SET_STATE', payload: e.target.value || null })}
                >
                  <option value="">All States</option>
                  {filterOptions.states.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {/* District Select */}
                <select
                  className="filter-select text-xs min-w-[110px] py-2 px-3"
                  value={filters.selectedDistrict || ''}
                  onChange={(e) => dispatch({ type: 'SET_DISTRICT', payload: e.target.value || null })}
                  disabled={!filters.selectedState}
                >
                  <option value="">All Districts</option>
                  {filterOptions.districts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                {/* Product Select */}
                <select
                  className="filter-select text-xs min-w-[110px] py-2 px-3"
                  value={filters.selectedProduct || ''}
                  onChange={(e) => dispatch({ type: 'SET_PRODUCT', payload: e.target.value || null })}
                >
                  <option value="">All Products</option>
                  {filterOptions.products.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                {/* Reset Filters button */}
                {(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery) && (
                  <button
                    onClick={() => dispatch({ type: 'RESET' })}
                    className="text-xs text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors ml-1 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Metric View Segmented Toggle & Month Dropdown */}
              <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-bg-card/40 border border-border/10 backdrop-blur-sm">
                  {[
                    { value: "DESPATCH", label: "Despatch" },
                    { value: "PENDING", label: "Pending" }
                  ].map(opt => {
                    const active = metricMode === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setMetricMode(opt.value)}
                        className={`text-[11px] px-3.5 py-1.5 rounded-lg border transition-all cursor-pointer font-bold uppercase tracking-wider ${
                          active 
                            ? 'bg-blue-900/40 border-blue-500 text-blue-300' 
                            : 'border-transparent text-text-muted hover:text-text-primary bg-transparent'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {metricMode === "PENDING" && (
                  <select
                    value={selectedPendingMonth}
                    onChange={(e) => setSelectedPendingMonth(e.target.value)}
                    className="text-xs px-3.5 py-1.5 rounded-xl border border-border/70 text-purple-300 bg-[#0d1526] cursor-pointer outline-none appearance-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23c4b5fd' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 8px center',
                      backgroundSize: '12px',
                      paddingRight: '28px'
                    }}
                  >
                    {sortedPendingMonths.map(opt => (
                      <option 
                        key={opt.periodKey} 
                        value={opt.periodKey}
                        className="bg-[#0d1526] text-text-primary"
                        style={{ backgroundColor: '#0d1526', color: '#F8FAFC' }}
                      >
                        {opt.label}
                      </option>
                    ))}
                    <option 
                      value="ALL"
                      className="bg-[#0d1526] text-text-primary"
                      style={{ backgroundColor: '#0d1526', color: '#F8FAFC' }}
                    >
                      Total Backlog
                    </option>
                  </select>
                )}
              </div>
            </div>

            <DataTable 
              data={states} 
              columns={columns} 
              onRowClick={(row) => dispatch({ type: 'SET_STATE', payload: row.state })}
            />
          </div>

          {/* Conditional: Top Pending Dealers (Pending mode) OR Inactive Dealers (Despatch mode) */}
          {selectedStateData && metricMode === 'PENDING' && (
            <CollapsibleCard 
              title={`Top Pending Dealers in ${selectedStateData.state}`} 
              badge={<span className="badge bg-amber-500/20 text-amber-400">{topPendingDealers.length}</span>}
            >
              {topPendingDealers.length === 0 ? (
                <div className="text-center text-text-muted py-6 text-sm">
                  No dealers with pending orders in this state.
                </div>
              ) : (
                <div className="space-y-3">
                  {topPendingDealers.slice(0, 5).map((d, i) => (
                    <div 
                      key={i} 
                      onClick={() => navigate(`/dealers?state=${d.state}&district=${d.district}&search=${d.client}`)}
                      className="p-3 bg-bg-secondary/40 hover:bg-bg-card-hover border border-border/20 hover:border-border/60 rounded-xl transition-all duration-200 cursor-pointer flex justify-between items-center gap-3 relative overflow-hidden group shadow-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-text-primary text-sm block truncate group-hover:text-accent-blue transition-colors">
                          {d.client}
                        </span>
                        <span className="text-[10px] text-text-muted uppercase mt-0.5 block truncate">
                          {d.district} • Products: {d.products || 'None'}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold text-amber-400 block">
                          {formatMT(d.pendingQty)}
                        </span>
                        <span className="text-[10px] text-text-muted">Pending</span>
                      </div>
                    </div>
                  ))}
                  {topPendingDealers.length > 5 && (
                    <div className="text-center text-xs text-text-muted pt-1">
                      + {topPendingDealers.length - 5} more dealers with pending
                    </div>
                  )}
                </div>
              )}
            </CollapsibleCard>
          )}

          {selectedStateData && metricMode === 'DESPATCH' && (
            <CollapsibleCard 
              title={`Inactive Dealers in ${selectedStateData.state}`} 
              badge={<span className="badge bg-severity-critical/20 text-severity-critical">{data.intel?.inactiveDealers?.length || 0}</span>}
            >
              {(!data.intel?.inactiveDealers || data.intel.inactiveDealers.length === 0) ? (
                <div className="text-center text-text-muted py-6 text-sm">
                  No inactive dealers in this state.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.intel.inactiveDealers.slice(0, 5).map((d, i) => (
                    <div 
                      key={i} 
                      onClick={() => navigate(`/dealers?state=${d.state}&district=${d.district}&search=${d.client}`)}
                      className="p-3 bg-bg-secondary/40 hover:bg-bg-card-hover border border-border/20 hover:border-border/60 rounded-xl transition-all duration-200 cursor-pointer flex justify-between items-center gap-3 relative overflow-hidden group shadow-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-text-primary text-sm block truncate group-hover:text-accent-blue transition-colors">
                          {d.client}
                        </span>
                        <span className="text-[10px] text-text-muted uppercase mt-0.5 block truncate">
                          {d.district} • Products: {d.products || 'None'}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold text-severity-critical block">
                          -{formatMT(d.prevVolume)}
                        </span>
                        <span className="text-[10px] text-text-muted">Lost Vol</span>
                      </div>
                    </div>
                  ))}
                  {data.intel.inactiveDealers.length > 5 && (
                    <div className="text-center text-xs text-text-muted pt-1">
                      + {data.intel.inactiveDealers.length - 5} more inactive dealers
                    </div>
                  )}
                </div>
              )}
            </CollapsibleCard>
          )}

        </div>

        {/* Right Col: Detail Panel (only shows if state selected) */}
        {selectedStateData && (
          <div className="lg:col-span-4 space-y-6">
            <CollapsibleCard 
              title={`${selectedStateData.state} ${metricMode === 'PENDING' ? 'Pending' : 'Despatch'}`} 
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
                        <span className="text-[10px] sm:text-xs font-bold text-accent-blue bg-accent-blue/10 px-2.5 py-1 rounded-full whitespace-nowrap border border-accent-blue/20">
                          {(() => {
                            const totalPending = nationalPendingTotal;
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
                        const totalPending = nationalPendingTotal;
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
