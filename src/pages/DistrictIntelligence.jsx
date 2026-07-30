import { useMemo, useEffect, useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import RiskScatterPlot from '../components/charts/RiskScatterPlot';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT, formatDays } from '../utils/formatters';
import { calculateMoM, getSeverityTheme, getBusinessImpact } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { MapPin } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
import ShareDonutChart from '../components/charts/ShareDonutChart';
import { PRODUCT_COLORS, PRODUCT_LABELS, isWestBengalUser } from '../utils/constants';
import { getPendingForPeriod, getBacklogClearance, getSharePctForPeriod, getPendingAvailableMonths } from '../utils/pending';
import { getCurMonthKey, getDespatchAvailableMonths, getHistoricalDistricts } from '../utils/despatch';

export default function DistrictIntelligence({ pendingAvailableMonths = [] }) {
  const { rawData, data, loading, error, filters, dispatch, filterOptions } = useData();
  const { user } = useAuth();
  const showNorthBengal = isWestBengalUser(user, filterOptions);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [metricMode, setMetricMode] = useState("DESPATCH");
  const [selectedPendingMonth, setSelectedPendingMonth] = useState("");
  const lastSyncedParamsRef = useRef(null);

  const sortedPendingMonths = useMemo(() => {
    return [...pendingAvailableMonths].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
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

  const filteredDistricts = useMemo(() => {
    if (!data) return [];
    if (metricMode === 'PENDING') {
      const rawDistricts = data.districts || [];
      return [...rawDistricts]
        .map(d => ({
          ...d,
          activePendingVal: getPendingForPeriod(d, selectedPendingMonth)
        }))
        .filter(d => selectedPendingMonth === 'ALL' || d.activePendingVal > 0)
        .sort((a, b) => b.activePendingVal - a.activePendingVal);
    } else {
      // DESPATCH MODE
      const curMonthKey = getCurMonthKey(rawData);
      let rawDistricts = data.districts || [];
      if (selectedPendingMonth && selectedPendingMonth !== curMonthKey) {
        rawDistricts = getHistoricalDistricts(rawData, filters, selectedPendingMonth);
      }
      return rawDistricts;
    }
  }, [data, rawData, metricMode, selectedPendingMonth, filters]);

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

  const columns = useMemo(() => {
    if (metricMode === 'PENDING') {
      return [
        {
          accessorKey: 'district',
          header: 'District',
          meta: { width: '25%', minWidth: '130px' },
          cell: info => {
            const row = info.row.original;
            return (
              <div className="flex flex-col">
                <span className="font-medium leading-tight">{info.getValue()}</span>
                <span className="text-[10px] text-text-muted tracking-wide uppercase mt-0.5">{row.state}</span>
              </div>
            );
          },
        },
        {
          id: 'pendingQty',
          accessorFn: row => getPendingForPeriod(row, selectedPendingMonth),
          header: 'Pending Orders (MT)',
          meta: { width: '20%', minWidth: '110px' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            return <span className="font-medium text-[13px]">{formatMT(pendingQty)}</span>;
          },
        },
        {
          id: 'backlog',
          accessorFn: row => {
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            let dailyAvg = row.dailyAvgQty || row.currentDailyRate || 0;
            if (dailyAvg === 0 && pendingQty > 0) {
              const stateData = data?.states?.find(s => s.state === row.state);
              dailyAvg = stateData?.dailyAvgQty || 0;
            }
            const clearance = getBacklogClearance(pendingQty, dailyAvg);
            return clearance.days || 0;
          },
          header: 'Backlog Clearance',
          meta: { width: '28%', minWidth: '160px' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            let dailyAvg = row.dailyAvgQty || row.currentDailyRate || 0;
            if (dailyAvg === 0 && pendingQty > 0) {
              const stateData = data?.states?.find(s => s.state === row.state);
              dailyAvg = stateData?.dailyAvgQty || 0;
            }
            const clearance = getBacklogClearance(pendingQty, dailyAvg);
            const theme = getSeverityTheme(clearance.status);
            return (
              <div className="flex flex-col select-none cursor-pointer">
                <span className="font-bold text-[13px]" style={{ color: theme.color }}>
                  {clearance.text}
                </span>
                {pendingQty > 0 && dailyAvg > 0 && (
                  <span className="text-[10px] text-text-muted mt-0.5">
                    vs avg {formatMT(dailyAvg)}/d
                  </span>
                )}
              </div>
            );
          }
        },
        {
          id: 'severity',
          enableSorting: false,
          header: 'Risk Level',
          meta: { width: '20%', minWidth: '110px' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            let dailyAvg = row.dailyAvgQty || row.currentDailyRate || 0;
            if (dailyAvg === 0 && pendingQty > 0) {
              const stateData = data?.states?.find(s => s.state === row.state);
              dailyAvg = stateData?.dailyAvgQty || 0;
            }
            const clearance = getBacklogClearance(pendingQty, dailyAvg);
            return (
              <div className="flex pr-4 shrink-0">
                <ImpactBadge tier={clearance.status} />
              </div>
            );
          }
        }
      ];
    }

    return [
      {
        accessorKey: 'district',
        header: 'District',
        meta: { width: '20%', minWidth: '120px' },
        cell: info => {
          const row = info.row.original;
          return (
            <div className="flex flex-col">
              <span className="font-medium leading-tight">{info.getValue()}</span>
              <span className="text-[10px] text-text-muted tracking-wide uppercase mt-0.5">{row.state}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'cur',
        header: 'Vol (MT)',
        meta: { width: '12%', minWidth: '85px' },
        cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
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
        accessorKey: 'avgPeriod',
        header: 'Avg Period',
        meta: { width: '12%', minWidth: '85px' },
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
        meta: { width: '16%', minWidth: '120px' },
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
          
          return <span style={{ color: '#6b7280' }}>—</span>;
        }
      },
      {
        id: 'severity',
        header: <div className="text-left">Risk</div>,
        meta: { width: '14%', minWidth: '100px' },
        cell: info => {
          const row = info.row.original;
          const sharePct = row.share || 0;
          const { severity, impactScore } = getBusinessImpact(row.cur, row.prev, sharePct, 'DISTRICT', row.state, row.expectedMtd);
          return (
            <div className="flex pr-4 shrink-0">
              <ImpactBadge tier={severity} score={impactScore} />
            </div>
          );
        }
      }
    ];
  }, [metricMode, selectedPendingMonth, data]);

  // NOTE: Must be declared before any early returns to satisfy Rules of Hooks.
  const districts = data?.districts || [];
  const products = data?.products || [];

  const pendingProducts = useMemo(() => {
    const productMap = {};
    let totalPending = 0;
    
    filteredDistricts.forEach(d => {
      (d.products || []).forEach(p => {
        if (filters.selectedProduct && p.product !== filters.selectedProduct) return;
        const pPending = p.pendingQty || 0;
        
        if (!productMap[p.product]) {
          const baseLabel = PRODUCT_LABELS[p.product] || p.product;
          productMap[p.product] = {
            product: p.product,
            label: baseLabel,
            cur: 0,
            prev: p.prev || 0,
            pendingQty: 0
          };
        }
        productMap[p.product].pendingQty += pPending;
        totalPending += pPending;
      });
    });
    
    return Object.values(productMap).map(p => ({
      ...p,
      cur: p.pendingQty,
      share_pct: totalPending > 0 ? Math.round((p.pendingQty / totalPending) * 100) : 0
    })).sort((a, b) => b.cur - a.cur);
  }, [filteredDistricts, filters.selectedProduct]);

  const activeProducts = useMemo(() => {
    return metricMode === 'PENDING' ? pendingProducts : products;
  }, [metricMode, pendingProducts, products]);

  if (loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-card shadow-lg">
          <SkeletonLoader variant="table-row" count={8} />
        </div>
        <div className="lg:col-span-5">
          <SkeletonLoader variant="chart" className="h-72" />
        </div>
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const hasFilters = !!(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery);

  return (
    <div className="animate-fade-in space-y-6">
      {/* PAGE TITLE AT THE TOP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-3">
          <MapPin className="w-7 h-7 text-accent-blue" />
          <h2 className="text-3xl font-extrabold text-text-primary">
            {metricMode === 'PENDING' ? 'District Pending Orders' : 'District Performance'}
          </h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {(filters.selectedState || filters.selectedDistrict) && (
            <button
              onClick={() => {
                dispatch({ type: 'RESET' });
              }}
              className="px-4 py-2 bg-bg-secondary hover:bg-border border border-border text-text-primary hover:text-text-primary text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm animate-fadeIn"
            >
              ← Back to All Districts
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: District List/Table */}
        <div className="lg:col-span-8 space-y-6">
          <div className="glass-card p-3.5 sm:p-4 lg:p-4.5 space-y-6">
            
            {/* Unified Controls Row */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 pb-3.5 border-b border-border/40 w-full">
              <select
                className="filter-select text-xs py-1.5 px-3 w-[115px] sm:w-[130px] shrink-0"
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
                  className="filter-select text-xs py-1.5 px-3 w-[115px] sm:w-[130px] shrink-0"
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
                className="filter-select text-xs py-1.5 px-3 w-[115px] sm:w-[130px] shrink-0"
                value={filters.selectedProduct || ''}
                onChange={(e) => dispatch({ type: 'SET_PRODUCT', payload: e.target.value || null })}
              >
                <option value="">All Products</option>
                {filterOptions.products.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {/* North Bengal Filter Toggle */}
              {showNorthBengal && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'TOGGLE_NORTH_BENGAL' })}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
                    filters.isNorthBengal
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                      : 'bg-bg-tertiary/60 text-white border-border/40 hover:border-border'
                  }`}
                  title="Filter North Bengal Districts (Darjeeling, Jalpaiguri, Cooch Behar, etc.)"
                >
                  <span className={`w-2 h-2 rounded-full ${filters.isNorthBengal ? 'bg-emerald-400 animate-pulse' : 'bg-white/50'}`} />
                  North Bengal
                </button>
              )}

              {(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery) && (
                <button
                  onClick={() => {
                    dispatch({ type: 'RESET' });
                  }}
                  className="shrink-0 text-xs text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors px-1 cursor-pointer whitespace-nowrap"
                >
                  Clear
                </button>
              )}

              <div className="hidden sm:block w-px h-5 bg-border/40 mx-0.5 shrink-0" />

              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-card/40 border border-border/10 shrink-0">
                {[
                  { value: "DESPATCH", label: "Despatch" },
                  { value: "PENDING", label: "Pending" }
                ].map(opt => {
                  const active = metricMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMetricMode(opt.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                        active 
                          ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/35' 
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
                className="filter-select text-xs py-1.5 px-3 w-[110px] sm:w-[125px] shrink-0"
              >
                <option value="" disabled className="bg-[#0b1329] text-text-muted">Select month</option>
                {metricMode === 'PENDING' ? (
                  <>
                    <option value="ALL" className="bg-[#0b1329] text-text-primary">Total Backlog</option>
                    {sortedPendingMonths.map(opt => (
                      <option 
                        key={opt.key || opt.periodKey} 
                        value={opt.key || opt.periodKey}
                        className="bg-[#0b1329] text-text-primary"
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
                      className="bg-[#0b1329] text-text-primary"
                    >
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            <DataTable 
              key={metricMode + '-' + selectedPendingMonth}
              data={filteredDistricts} 
              columns={columns} 
              pageSize={15}
              onRowClick={(row) => {
                dispatch({ type: 'SET_STATE', payload: row.state });
                dispatch({ type: 'SET_DISTRICT', payload: row.district });
                navigate(`/dealers?state=${row.state}&district=${row.district}`);
              }}
            />
          </div>

          <AnimatePresence mode="wait">
            {filters.selectedDistrict && (
              <m.div
                key={filters.selectedDistrict}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <CollapsibleCard 
                  title={`Inactive Dealers in ${filters.selectedDistrict}`} 
                  badge={<span className="badge bg-severity-critical/20 text-severity-critical">{data.intel?.inactiveDealers?.length || 0}</span>}
                >
                  {(!data.intel?.inactiveDealers || data.intel.inactiveDealers.length === 0) ? (
                    <div className="text-center text-text-muted py-6 text-sm">
                      No inactive dealers matching this selection.
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
                                  <span className="text-[10px] text-text-muted">{d.district}, {d.state}</span>
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
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Col: Scatter Plot & Insights */}
        <div className="lg:col-span-4 space-y-6">
          <CollapsibleCard title="District Impact Map" accentColor="#8b5cf6">
            <div className="text-xs text-text-muted mb-4">
              Visualizing volume vs impact score. High volume, critical impact districts (top right) require immediate intervention.
            </div>
            <RiskScatterPlot 
              data={filteredDistricts} 
              height={350} 
            />
          </CollapsibleCard>

          <CollapsibleCard 
            title={
              filters.selectedDistrict 
                ? `${metricMode === 'PENDING' ? 'Pending Product Mix' : 'Product Mix'}: ${filters.selectedDistrict}` 
                : filters.selectedState 
                  ? `${metricMode === 'PENDING' ? 'Pending Product Mix' : 'Product Mix'}: ${filters.selectedState}` 
                  : `${metricMode === 'PENDING' ? 'Pending Product Mix' : 'Product Mix Performance'}`
            } 
            accentColor="#f97316" 
            badge={<span className="badge bg-bg-secondary text-text-muted">{activeProducts.length}</span>}
          >
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                <div className="text-center text-xs font-semibold text-text-muted bg-bg-secondary/40 border border-border/20 rounded-xl py-1.5 px-3 w-fit mx-auto select-none tracking-wide">
                  Scope: <span className="text-accent-blue font-bold">{filters.selectedDistrict || filters.selectedState || 'All Districts'}</span>
                </div>

                {metricMode === 'DESPATCH' && products.reduce((sum, p) => sum + (p.cur || 0), 0) === 0 && products.reduce((sum, p) => sum + (p.prev || 0), 0) > 0 && (
                  <div className="p-3 bg-severity-medium/10 border border-severity-medium/20 text-severity-medium text-xs rounded-xl flex items-center justify-center gap-2 select-none animate-pulse">
                    <span>⚠️</span>
                    <span>No active sales in this period. Showing previous period product mix.</span>
                  </div>
                )}
              </div>

              <div>
                <ShareDonutChart data={activeProducts} dataKey="cur" height={240} />
              </div>

              <div>
                <h4 className="text-xs font-bold text-text-muted uppercase mb-3">
                  {metricMode === 'PENDING' ? 'Product Pending Breakdown' : 'Product MoM Breakdown'}
                </h4>
                <div className="space-y-2">
                  {[...activeProducts]
                    .sort((a, b) => {
                      if (metricMode === 'PENDING') {
                        return (b.cur || 0) - (a.cur || 0);
                      }
                      const momA = calculateMoM(a.cur, a.prev);
                      const momB = calculateMoM(b.cur, b.prev);
                      return momA - momB;
                    })
                    .map(p => {
                      const totalVolume = activeProducts.reduce((sum, item) => sum + (item.cur || 0), 0);
                      const share = totalVolume > 0 ? Math.round(((p.cur || 0) / totalVolume) * 100) : 0;
                      return (
                        <div key={p.product} className="flex justify-between items-center text-sm p-2.5 bg-bg-secondary/40 border border-border/20 rounded-xl hover:bg-bg-card-hover transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PRODUCT_COLORS[p.product] || '#6b7280' }} />
                            <span className="font-bold text-text-primary">{p.product}</span>
                            <span className="text-xs text-text-muted hidden sm:inline ml-1">
                              {PRODUCT_LABELS[p.product]?.split('–')[1]?.trim() || p.label || p.product}
                            </span>
                          </div>
                          <div className="flex gap-4 items-center">
                            <span className="text-text-muted text-right font-medium">
                              {formatMT(p.cur)}
                            </span>
                            <span className="text-xs text-text-muted w-12 text-right">
                              {share}%
                            </span>
                            <span className="w-16 text-right">
                              {metricMode === 'PENDING' ? (
                                <span className="font-semibold text-text-muted">backlog</span>
                              ) : (
                                <MoMIndicator cur={p.cur} prev={p.prev} />
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </CollapsibleCard>

          <AnimatePresence mode="wait">
            {filters.selectedState && data.intel?.concentrationRisk === 'HIGH' && (
              <m.div
                key={filters.selectedState}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
                className="p-4 bg-severity-high/10 border border-severity-high/20 rounded-lg"
              >
                <h3 className="text-sm font-bold text-severity-high mb-2">High Dealer Concentration Risk</h3>
                <p className="text-xs text-text-primary leading-relaxed">
                  Top 3 dealers drive <strong>{data.intel.top3DealerShare}%</strong> of volume in this region. 
                  Consider expanding dealer base to reduce dependency.
                </p>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
