import { useMemo, useEffect, useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ShareDonutChart from '../components/charts/ShareDonutChart';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT, formatDays } from '../utils/formatters';
import { calculateMoM, getBusinessImpact, getSeverityTheme } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { getPendingForPeriod, getTotalPendingForPeriod, getSharePctForPeriod, getBacklogClearance } from '../utils/pending';
import { getCurMonthKey, getDespatchAvailableMonths, getHistoricalStates } from '../utils/despatch';
import { isRealState } from '../utils/constants';
import { Map } from 'lucide-react';

export default function StateIntelligence({ pendingAvailableMonths = [] }) {
  const { rawData, data, loading, error, filters, dispatch, filterOptions } = useData();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [metricMode, setMetricMode] = useState("DESPATCH");
  const [selectedPendingMonth, setSelectedPendingMonth] = useState('');
  const lastSyncedParamsRef = useRef(null);

  const sortedPendingMonths = useMemo(() => {
    return [...pendingAvailableMonths].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [pendingAvailableMonths]);

  const despatchAvailableMonths = useMemo(() => getDespatchAvailableMonths(rawData), [rawData]);

  // Default pending filter date to "Total Backlog" ('ALL') when switching to PENDING mode
  useEffect(() => {
    if (metricMode === 'PENDING') {
      setSelectedPendingMonth('ALL');
    } else {
      setSelectedPendingMonth(getCurMonthKey(rawData));
    }
  }, [metricMode, rawData]);

  // Compute national pending total to calculate true share of backlog (strategically correct)
  const nationalPendingTotal = useMemo(() => {
    const baseStates = rawData?.states || data?.states || [];
    return getTotalPendingForPeriod(baseStates, selectedPendingMonth);
  }, [rawData, data, selectedPendingMonth]);

  // Sync URL params → Context: runs only when the URL itself changes.
  useEffect(() => {
    const state = searchParams.get('state') || null;
    const district = searchParams.get('district') || null;
    const product = searchParams.get('product') || null;
    const search = searchParams.get('search') || '';

    const currentUrlParamString = searchParams.toString();

    if (state || district || product || search) {
      if (lastSyncedParamsRef.current !== currentUrlParamString) {
        lastSyncedParamsRef.current = currentUrlParamString;
        dispatch({ type: 'SYNC_FILTERS', payload: { state, district, product, search } });
      }
    } else {
      lastSyncedParamsRef.current = currentUrlParamString;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync Context filters to URL params
  useEffect(() => {
    const currentState = searchParams.get('state') || null;
    const currentDistrict = searchParams.get('district') || null;
    const currentProduct = searchParams.get('product') || null;
    const currentSearch = searchParams.get('search') || '';

    const nextState = filters.selectedState || null;
    const nextDistrict = filters.selectedDistrict || null;
    const nextProduct = filters.selectedProduct || null;
    const nextSearch = filters.searchQuery || '';

    const urlHasParams = !!(currentState || currentDistrict || currentProduct || currentSearch);
    const isContextPendingHydration = urlHasParams && (
      (currentState && nextState !== currentState) ||
      (currentDistrict && nextDistrict !== currentDistrict) ||
      (currentProduct && nextProduct !== currentProduct) ||
      (currentSearch && nextSearch !== currentSearch)
    );

    if (isContextPendingHydration) {
      return;
    }

    if (
      currentState !== nextState ||
      currentDistrict !== nextDistrict ||
      currentProduct !== nextProduct ||
      currentSearch !== nextSearch
    ) {
      const params = {};
      if (nextState) params.state = nextState;
      if (nextDistrict) params.district = nextDistrict;
      if (nextProduct) params.product = nextProduct;
      if (nextSearch) params.search = nextSearch;

      const newParamString = new URLSearchParams(params).toString();
      lastSyncedParamsRef.current = newParamString;
      setSearchParams(params, { replace: true });
    }
  }, [filters.selectedState, filters.selectedDistrict, filters.selectedProduct, filters.searchQuery, searchParams, setSearchParams]);

  // Compute states data, sorted by metric (strictly filtering for valid Indian States only)
  const states = useMemo(() => {
    if (!data) return [];
    let rawStates = (data.states || []).filter(s => s && isRealState(s.state));
    if (metricMode === 'PENDING') {
      return [...rawStates]
        .map(s => ({
          ...s,
          activePendingVal: getPendingForPeriod(s, selectedPendingMonth)
        }))
        .filter(s => selectedPendingMonth === 'ALL' || s.activePendingVal > 0)
        .sort((a, b) => b.activePendingVal - a.activePendingVal);
    }
    
    // DESPATCH MODE: Sort by % share of state volume descending
    let list = [];
    const curMonthKey = getCurMonthKey(rawData);
    if (!selectedPendingMonth || selectedPendingMonth === curMonthKey) {
      list = [...rawStates];
    } else {
      list = getHistoricalStates(rawData, filters, selectedPendingMonth).filter(s => s && isRealState(s.state));
    }

    return list.sort((a, b) => {
      const shareA = a.share !== undefined ? a.share : (a.cur || 0);
      const shareB = b.share !== undefined ? b.share : (b.cur || 0);
      if (shareB !== shareA) return shareB - shareA;
      return (b.cur || 0) - (a.cur || 0);
    });
  }, [data, rawData, metricMode, selectedPendingMonth, filters]);

  const columns = useMemo(() => {
    if (metricMode === 'PENDING') {
      const totalPending = nationalPendingTotal;
      return [
        {
          id: 'severity',
          header: 'Severity',
          meta: { width: '120px', minWidth: '110px' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            const dailyAvg = row.dailyAvgQty ?? row.currentDailyRate ?? 0;
            const clearance = getBacklogClearance(pendingQty, dailyAvg);
            return (
              <div className="flex items-center min-w-0">
                <ImpactBadge tier={clearance.status} />
              </div>
            );
          },
        },
        {
          accessorKey: 'state',
          header: 'State',
          meta: { width: '180px', minWidth: '140px' },
          cell: info => <span className="font-medium truncate block">{info.getValue()}</span>,
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
          meta: { width: '12%', minWidth: '80px' },
          cell: info => {
            const row = info.row.original;
            const sharePct = getSharePctForPeriod(row, selectedPendingMonth, totalPending);
            return <span className="text-text-muted">{sharePct}%</span>;
          },
        },
        {
          id: 'clearance',
          accessorFn: row => {
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            const dailyAvg = row.dailyAvgQty ?? row.currentDailyRate ?? 0;
            return getBacklogClearance(pendingQty, dailyAvg).days || 0;
          },
          header: 'Backlog Clearance',
          meta: { width: '25%', minWidth: '160px' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            const dailyAvg = row.dailyAvgQty ?? row.currentDailyRate ?? 0;
            const clearance = getBacklogClearance(pendingQty, dailyAvg);
            const theme = getSeverityTheme(clearance.status);
            return (
              <div className="flex flex-col select-none cursor-help" title={`${clearance.text} backlog clearance`}>
                <span className="text-sm font-bold" style={{ color: theme.color }}>
                  {clearance.text}
                </span>
                {pendingQty > 0 && dailyAvg > 0 && (
                  <span className="text-[10px] text-text-muted mt-0.5 block">
                    vs avg {formatMT(dailyAvg)}/d
                  </span>
                )}
              </div>
            );
          }
        }
      ];
    }


    const totalCur = states.reduce((s, row) => s + (row.cur || 0), 0);

    return [
      {
        id: 'severity',
        header: 'Status',
        meta: { width: '105px', minWidth: '100px' },
        cell: info => {
          const row = info.row.original;
          const sharePct = totalCur > 0 ? ((row.cur || 0) / totalCur) * 100 : (row.share || 0);
          const { severity, impactScore } = getBusinessImpact(row.cur, row.prev, sharePct, 'STATE', row.state, row.expectedMtd);
          return (
            <div className="flex items-center min-w-0">
              <ImpactBadge 
                tier={severity}
                score={impactScore}
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'state',
        header: 'State',
        meta: { width: '160px', minWidth: '130px' },
        cell: info => (
          <span className="font-medium truncate block">{info.getValue()}</span>
        ),
      },
      {
        accessorKey: 'cur',
        header: 'Cur. Vol (MT)',
        meta: { width: '12%', minWidth: '95px' },
        cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
      },
      {
        accessorKey: 'prev',
        header: 'Prev. Vol (MT)',
        meta: { width: '12%', minWidth: '95px' },
        cell: info => <span className="text-text-muted">{formatMT(info.getValue())}</span>,
      },
      {
        header: 'MoM',
        accessorKey: 'mom',
        meta: { width: '10%', minWidth: '80px' },
        cell: info => {
          const row = info.row.original;
          return <MoMIndicator cur={row.cur} prev={row.prev} />;
        },
      },
      {
        accessorKey: 'share',
        header: '% Share',
        meta: { width: '8%', minWidth: '65px' },
        cell: info => <span className="text-text-muted">{info.getValue()}%</span>,
      },
      {
        accessorKey: 'avgPeriod',
        header: 'Avg Period',
        meta: { width: '10%', minWidth: '85px' },
        cell: info => <span className="font-semibold text-text-primary">{formatDays(info.getValue())}</span>,
      },
      {
        id: 'pace',
        accessorFn: row => {
          const { lossFlag, lossDeltaPct } = row;
          if (lossFlag === 'AHEAD') return Math.abs(Number(lossDeltaPct) || 0);
          if (lossFlag === 'BEHIND') return -Math.abs(Number(lossDeltaPct) || 0);
          return 0;
        },
        header: 'Pace vs Avg',
        meta: { width: '140px', minWidth: '130px' },
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
              <div className="flex flex-col select-none cursor-pointer" title={fullTooltip}>
                <span className={`text-sm font-bold ${colorClass}`}>
                  {showPct}
                </span>
                <span className="text-[10px] text-text-muted mt-0.5 truncate block">
                  {shortRateText}
                </span>
              </div>
            );
          }
          
          return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
        }
      }
    ];
  }, [metricMode, selectedPendingMonth, states]);

  // NOTE: Must be declared before any early returns to satisfy Rules of Hooks.
  const selectedStateData = states.find(s => s.state && filters.selectedState && s.state.replace(/\s+/g, '').toUpperCase() === filters.selectedState.replace(/\s+/g, '').toUpperCase());

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

  if (loading) return (
    <div className="space-y-6">
      <div className="glass-card shadow-lg">
        <SkeletonLoader variant="table-row" count={8} />
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

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
    <div className="animate-fade-in space-y-6">
      {/* PAGE TITLE AT THE TOP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-3">
          <Map className="w-7 h-7 text-accent-blue" />
          <h2 className="text-3xl font-extrabold text-text-primary">
            {metricMode === 'PENDING' ? 'State Pending Order Rankings' : 'State Performance Rankings'}
          </h2>
        </div>
        {filters.selectedState && (
          <button
            onClick={() => {
              dispatch({ type: 'SET_STATE', payload: null });
            }}
            className="px-4 py-2 bg-bg-secondary hover:bg-border border border-border text-text-primary hover:text-text-primary text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm animate-fadeIn"
          >
            ← Back to All States
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: State List/Table */}
        <div className={`${selectedStateData ? 'lg:col-span-9' : 'lg:col-span-12'} space-y-6 transition-all duration-300`}>
          <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-6">
            
            {/* Integrated Filters Row */}
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-border/40">
              <select
                className="filter-select w-full sm:w-[140px]"
                value={filters.selectedState || (filterOptions.states.length === 1 ? filterOptions.states[0] : '')}
                onChange={(e) => dispatch({ type: 'SET_STATE', payload: e.target.value || null })}
              >
                {filterOptions.states.length !== 1 && <option value="">All States</option>}
                {filterOptions.states.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {(filters.selectedState || filterOptions.districts.length > 0) && (
                <select
                  className="filter-select w-full sm:w-[140px]"
                  value={filters.selectedDistrict || ''}
                  onChange={(e) => dispatch({ type: 'SET_DISTRICT', payload: e.target.value || null })}
                >
                  <option value="">All Districts</option>
                  {filterOptions.districts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}

              <select
                className="filter-select w-full sm:w-[140px]"
                value={filters.selectedProduct || ''}
                onChange={(e) => dispatch({ type: 'SET_PRODUCT', payload: e.target.value || null })}
              >
                <option value="">All Products</option>
                {filterOptions.products.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery) && (
                <button
                  onClick={() => dispatch({ type: 'RESET' })}
                  className="text-[11px] text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors px-1 cursor-pointer whitespace-nowrap"
                >
                  Clear
                </button>
              )}

              <div className="hidden sm:block w-px h-5 bg-border/40 mx-1 flex-shrink-0" />

              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-card/40 border border-border/10 flex-shrink-0">
                {[
                  { value: "DESPATCH", label: "Despatch" },
                  { value: "PENDING", label: "Pending" }
                ].map(opt => {
                  const active = metricMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setMetricMode(opt.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                        active 
                          ? 'bg-accent-sky/20 text-accent-sky border-accent-sky/35' 
                          : 'bg-transparent text-text-muted/60 border-transparent hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <select
                value={selectedPendingMonth}
                onChange={(e) => setSelectedPendingMonth(e.target.value)}
                className="filter-select w-full sm:w-[150px]"
              >
                <option value="" disabled className="bg-bg-input text-text-muted">Select month</option>
                {metricMode === 'PENDING' ? (
                  <>
                    <option value="ALL" className="bg-bg-input text-text-primary">Total Backlog</option>
                    {sortedPendingMonths.map(opt => (
                      <option 
                        key={opt.key || opt.periodKey} 
                        value={opt.key || opt.periodKey}
                        className="bg-bg-input text-text-primary"
                      >
                        {opt.label}
                      </option>
                    ))}
                  </>
                ) : (
                  despatchAvailableMonths.map(opt => (
                    <option 
                      key={opt.key || opt.periodKey} 
                      value={opt.key || opt.periodKey}
                      className="bg-bg-input text-text-primary"
                    >
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            <DataTable 
              key={metricMode + '-' + selectedPendingMonth}
              data={states} 
              columns={columns} 
              defaultSort={[{ id: metricMode === 'PENDING' ? 'sharePct' : 'share', desc: true }]}
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
              <div className="space-y-2">
                {topPendingDealers.slice(0, 5).map((d, i) => (
                  <div 
                    key={i} 
                    onClick={() => navigate(`/dealers?state=${d.state}&district=${d.district}&search=${d.client}`)}
                    className="group cursor-pointer rounded-xl border border-border/20 hover:border-amber-500/30 bg-bg-secondary/30 hover:bg-amber-500/5 transition-all duration-200 overflow-hidden"
                  >
                    <div className="flex items-stretch">
                      {/* Rank stripe */}
                      <div className="w-1 shrink-0 bg-amber-500/40 group-hover:bg-amber-500 transition-colors" />
                      <div className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0">
                        {/* Rank number */}
                        <span className="text-[11px] font-black text-amber-400/60 group-hover:text-amber-400 w-4 shrink-0 text-center transition-colors">#{i + 1}</span>
                        {/* Info block */}
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-[13px] text-text-primary group-hover:text-amber-300 transition-colors block truncate leading-tight">{d.client}</span>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-text-muted">{d.district}</span>
                            {d.products && d.products.split(',').slice(0, 2).map((p, pi) => (
                              <span key={pi} className="text-[9px] px-1.5 py-0.5 rounded bg-border/30 text-text-muted font-medium">{p.trim()}</span>
                            ))}
                          </div>
                        </div>
                        {/* Value */}
                        <div className="text-right shrink-0">
                          <span className="text-[13px] font-black text-amber-400 block leading-tight">{formatMT(d.pendingQty)}</span>
                          <span className="text-[9px] text-text-muted uppercase tracking-wide">Pending</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {topPendingDealers.length > 5 && (
                  <div className="text-center text-xs text-text-muted pt-1 pb-0.5">
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
                <div className="space-y-2">
                  {data.intel.inactiveDealers.slice(0, 5).map((d, i) => (
                    <div 
                      key={i} 
                      onClick={() => navigate(`/dealers?state=${d.state}&district=${d.district}&search=${d.client}`)}
                      className="group cursor-pointer rounded-xl border border-border/20 hover:border-red-500/30 bg-bg-secondary/30 hover:bg-red-500/5 transition-all duration-200 overflow-hidden"
                    >
                      <div className="flex items-stretch">
                        <div className="w-1 shrink-0 bg-red-500/40 group-hover:bg-red-500 transition-colors" />
                        <div className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">Inactive</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-[13px] text-text-primary group-hover:text-red-300 transition-colors block truncate leading-tight">{d.client}</span>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] text-text-muted">{d.district}</span>
                              {d.products && d.products.split(',').slice(0, 2).map((p, pi) => (
                                <span key={pi} className="text-[9px] px-1.5 py-0.5 rounded bg-border/30 text-text-muted font-medium">{p.trim()}</span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[13px] font-black text-red-400 block leading-tight">-{formatMT(d.prevVolume)}</span>
                            <span className="text-[9px] text-text-muted uppercase tracking-wide">Lost Vol</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {data.intel.inactiveDealers.length > 5 && (
                    <div className="text-center text-xs text-text-muted pt-1 pb-0.5">
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
          <div className="lg:col-span-3 space-y-6">
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
                        <span className="font-extrabold text-sm text-text-primary">
                          {formatMT(getPendingForPeriod(selectedStateData, selectedPendingMonth))}
                        </span>
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
