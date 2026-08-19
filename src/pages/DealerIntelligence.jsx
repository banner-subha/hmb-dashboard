import { useMemo, useEffect, useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import SearchInput from '../components/common/SearchInput';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import SeverityBadge from '../components/common/SeverityBadge';
import { formatMT, formatDays } from '../utils/formatters';
import { calculateMoM, getBusinessImpact, getSeverityTheme } from '../utils/trendEngine';
import { getPendingForPeriod, getBacklogClearance } from '../utils/pending';
import { getCurMonthKey, getDespatchAvailableMonths, getHistoricalDealers } from '../utils/despatch';
import { isWestBengalUser } from '../utils/constants';
import { Store } from 'lucide-react';

export default function DealerIntelligence({ pendingAvailableMonths = [] }) {
  const { rawData, data, loading, error, filters, dispatch, filterOptions } = useData();
  const { user } = useAuth();
  const showNorthBengal = isWestBengalUser(user, filterOptions);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [metricMode, setMetricMode] = useState("DESPATCH");
  const [selectedPendingMonth, setSelectedPendingMonth] = useState("");
  const lastSyncedParamsRef = useRef(null);

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

  const dealers = useMemo(() => data?.dealers || [], [data]);

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

  const filteredDealers = useMemo(() => {
    if (metricMode === 'PENDING') {
      return (data?.dealers || [])
        .map(d => ({
          ...d,
          activePendingVal: getPendingForPeriod(d, selectedPendingMonth)
        }))
        .filter(d => selectedPendingMonth === 'ALL' || d.activePendingVal > 0)
        .sort((a, b) => b.activePendingVal - a.activePendingVal);
    } else {
      // DESPATCH MODE
      const curMonthKey = getCurMonthKey(rawData);
      let rawDealers = data?.dealers || [];
      if (selectedPendingMonth && selectedPendingMonth !== curMonthKey) {
        rawDealers = getHistoricalDealers(rawData, filters, selectedPendingMonth);
      }
      
      if (statusFilter === 'ACTIVE') {
        rawDealers = rawDealers.filter(d => d.cur > 0);
      } else if (statusFilter === 'INACTIVE') {
        rawDealers = rawDealers.filter(d => d.cur === 0);
      }

      const sortParam = searchParams.get('sort');
      if (sortParam === 'avgPeriod' || sortParam === 'leadTime') {
        rawDealers = [...rawDealers].sort((a, b) => (Number(b.avgPeriod) || 0) - (Number(a.avgPeriod) || 0));
      }

      return rawDealers;
    }
  }, [data?.dealers, rawData, statusFilter, metricMode, selectedPendingMonth, filters, searchParams]);

  // Auto-select dealer if search query isolates a single dealer
  useEffect(() => {
    if (filters.searchQuery && filteredDealers.length === 1 && !selectedDealer) {
      setSelectedDealer(filteredDealers[0]);
    }
  }, [filters.searchQuery, filteredDealers, selectedDealer]);

  const columns = useMemo(() => {
    if (metricMode === 'PENDING') {
      return [
        {
          accessorKey: 'client',
          header: 'Dealer Name',
          meta: { width: '30%', minWidth: '130px' },
          cell: info => (
            <span className="font-bold text-sm sm:text-[15px] text-text-primary whitespace-normal break-words leading-tight" title={info.getValue()}>
              {info.getValue()}
            </span>
          ),
        },
        {
          accessorKey: 'district',
          header: 'Location',
          meta: { width: '20%', minWidth: '100px' },
          cell: info => <span className="text-text-muted text-xs sm:text-[13px] font-medium truncate inline-block w-full" title={`${info.getValue()}, ${info.row.original.state}`}>{info.getValue()}, {info.row.original.state}</span>,
        },
        {
          id: 'pendingQty',
          header: 'Pending (MT)',
          meta: { width: '15%', minWidth: '90px' },
          cell: info => {
            const row = info.row.original;
            const pendingQty = getPendingForPeriod(row, selectedPendingMonth);
            return <span className="font-medium text-[13px]">{formatMT(pendingQty)}</span>;
          }
        },
        {
          id: 'backlog',
          header: 'Backlog Clearance',
          meta: { width: '20%', minWidth: '140px' },
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
          header: 'Status',
          id: 'severity',
          meta: { width: '15%', minWidth: '90px' },
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
              <div 
                className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[12px] font-bold tracking-wide whitespace-nowrap border shrink-0 select-none" 
                style={{ backgroundColor: theme.bg, color: theme.color, borderColor: theme.border }}
              >
                <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                <span>{theme.severity}</span>
              </div>
            );
          },
        }
      ];
    }

    return [
      {
        accessorKey: 'client',
        header: 'Dealer',
        meta: { width: '28%', minWidth: '120px' },
        cell: info => (
          <span className="font-bold text-sm sm:text-[15px] text-text-primary whitespace-normal break-words leading-tight" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      },
      {
        accessorKey: 'district',
        header: 'Location',
        meta: { width: '18%', minWidth: '90px' },
        cell: info => <span className="text-text-muted text-xs sm:text-[13px] font-medium truncate inline-block w-full" title={`${info.getValue()}, ${info.row.original.state}`}>{info.getValue()}, {info.row.original.state}</span>,
      },
      {
        accessorKey: 'cur',
        header: 'Vol (MT)',
        meta: { width: '11%', minWidth: '80px' },
        cell: info => <span className="font-bold text-text-primary whitespace-nowrap">{formatMT(info.getValue())}</span>,
      },
      {
        header: 'MoM',
        accessorKey: 'mom',
        meta: { width: '10%', minWidth: '75px' },
        cell: info => {
          const row = info.row.original;
          return <MoMIndicator cur={row.cur} prev={row.prev} className="whitespace-nowrap" />;
        },
      },
      {
        accessorKey: 'avgPeriod',
        header: 'Avg Period',
        meta: { width: '11%', minWidth: '80px' },
        cell: info => <span className="font-semibold text-text-primary whitespace-nowrap">{formatDays(info.getValue())}</span>,
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
        meta: { width: '130px', minWidth: '120px' },
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
              <div className="flex flex-col select-none cursor-help" title={fullTooltip}>
                <span className={`text-sm font-bold ${colorClass}`}>
                  {showPct}
                </span>
                <span className="text-[11px] font-semibold text-text-primary mt-0.5 truncate block">
                  {shortRateText}
                </span>
              </div>
            );
          }
          
          return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
        }
      },
      {
        header: 'Status',
        accessorKey: 'operationalStatus',
        meta: { width: '11%', minWidth: '80px' },
        cell: info => {
          const row = info.row.original;
          const isInactive = row.isInactive || row.cur === 0;
          const statusLabel = isInactive ? 'Inactive' : (row.impactTier === 'LOW' || row.impactTier === 'NONE') ? 'Growing' : 'Declining';
          const theme = isInactive ? getSeverityTheme('CRITICAL') : getSeverityTheme(row.impactTier);

          return (
            <div 
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold tracking-wide whitespace-nowrap border shrink-0 select-none" 
              style={{ backgroundColor: theme.bg, color: theme.color, borderColor: theme.border }}
            >
              <span className="w-2 h-2 rounded-full bg-current shrink-0" />
              <span>{statusLabel}</span>
            </div>
          );
        },
      },
    ];
  }, [metricMode, selectedPendingMonth, data, rawData]);

  // NOTE: Must be declared before any early returns to satisfy Rules of Hooks.
  const dealerAlerts = data?.alerts?.filter(a => a.category === 'DEALER' && a.data?.client === selectedDealer?.client) || [];
  const aiRisk = data?.intelligence?.dealer_risks?.find(r => r.dealer === selectedDealer?.client);

  const selectedDealerProducts = useMemo(() => {
    if (!selectedDealer || !selectedDealer.products) return [];
    if (metricMode === 'DESPATCH') {
      const totalVolume = selectedDealer.cur ?? selectedDealer.qty ?? 0;
      return selectedDealer.products.map(p => {
        const val = p.cur ?? p.qty ?? p.val ?? 0;
        return {
          product: p.product,
          val,
          displayVal: formatMT(val),
          pct: totalVolume > 0 ? (val / totalVolume) * 100 : 0
        };
      }).sort((a, b) => b.val - a.val);
    } else {
      const pendingQty = getPendingForPeriod(selectedDealer, selectedPendingMonth);
      const totalDispatch = (selectedDealer.cur ?? selectedDealer.qty) || selectedDealer.products.reduce((sum, p) => sum + (p.cur ?? p.qty ?? 0), 0);
      return selectedDealer.products.map(p => {
        const pVal = p.cur ?? p.qty ?? 0;
        const share = totalDispatch > 0 ? (pVal / totalDispatch) : (1 / selectedDealer.products.length);
        const productPending = pendingQty * share;
        return {
          product: p.product,
          val: productPending,
          displayVal: formatMT(productPending),
          pct: share * 100
        };
      }).sort((a, b) => b.val - a.val);
    }
  }, [selectedDealer, metricMode, selectedPendingMonth]);

  if (loading) return (
    <div className="space-y-6">
      <div className="glass-card shadow-lg">
        <SkeletonLoader variant="table-row" count={8} />
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  // Compute accent color from frontend engine for selected dealer
  const selectedAccentColor = selectedDealer 
    ? (metricMode === 'PENDING'
      ? (() => {
          const pendingQty = getPendingForPeriod(selectedDealer, selectedPendingMonth);
          const stateData = data?.states?.find(s => s.state === selectedDealer.state);
          let dailyAvg = selectedDealer.dailyAvgQty || selectedDealer.currentDailyRate || stateData?.dailyAvgQty || 0;
          const clearance = getBacklogClearance(pendingQty, dailyAvg);
          return getSeverityTheme(clearance.status).color;
        })()
      : (selectedDealer.healthColor || '#6b7280'))
    : '#6b7280';
 
  return (
    <div className="animate-fade-in space-y-6">
      {/* PAGE TITLE AT THE TOP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <h2 className="text-3xl font-extrabold text-text-primary flex items-center gap-3">
          <Store className="w-7 h-7 text-accent-blue" />
          Dealer Performance
        </h2>
      </div>
 
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Col: Dealer Directory */}
        <div className={`${selectedDealer ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-6 transition-all duration-300 min-w-0`}>
          <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-6">
            
            {/* Unified Controls Row */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 pb-4 border-b border-border/40 w-full">
              {/* Status Filter Segmented Toggle */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-bg-card/40 border border-border/10 shrink-0">
                {[
                  { key: 'ALL', label: `All (${dealers.length})` },
                  { key: 'ACTIVE', label: `Active (${dealers.filter(d => d.cur > 0).length})` },
                  { key: 'INACTIVE', label: `Inactive (${dealers.filter(d => d.cur === 0).length})` }
                ].map(({ key, label }) => {
                  const isActive = statusFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer border ${
                        isActive 
                          ? 'bg-accent-sky/20 text-accent-sky border-accent-sky/35 shadow-sm' 
                          : 'bg-transparent text-text-muted/70 border-transparent hover:text-text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="hidden sm:block w-px h-5 bg-border/40 mx-0.5 shrink-0" />

              {/* State Select */}
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

              {/* District Select */}
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

              {/* Product Select */}
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
                  className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
                    filters.isNorthBengal
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                      : 'bg-bg-tertiary/60 text-text-secondary border-border/40 hover:border-border'
                  }`}
                  title="Filter North Bengal Districts (Darjeeling, Jalpaiguri, Cooch Behar, etc.)"
                >
                  <span className={`w-2 h-2 rounded-full ${filters.isNorthBengal ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted/40'}`} />
                  North Bengal
                </button>
              )}

              {/* Reset Filters button */}
              {(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery || filters.isNorthBengal) && (
                <button
                  onClick={() => dispatch({ type: 'RESET' })}
                  className="shrink-0 text-xs text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors px-1 cursor-pointer whitespace-nowrap"
                >
                  Clear
                </button>
              )}

              <div className="hidden sm:block w-px h-5 bg-border/40 mx-0.5 shrink-0" />

              {/* Despatch/Pending Toggle */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-secondary border border-border/40 shrink-0 metric-toggle-container shadow-inner">
                {[
                  { value: "DESPATCH", label: "Dispatch" },
                  { value: "PENDING", label: "Pending" }
                ].map(opt => {
                  const active = metricMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMetricMode(opt.value)}
                      className={`px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer border ${
                        active 
                          ? 'toggle-pill-active' 
                          : 'toggle-pill-inactive'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Month Select */}
              <select
                value={selectedPendingMonth}
                onChange={(e) => setSelectedPendingMonth(e.target.value)}
                className="filter-select text-xs py-1.5 px-3 w-[110px] sm:w-[125px] shrink-0"
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

              {/* Dealer Search Input directly inline */}
              <div className="shrink-0 w-[170px] sm:w-[190px]">
                <SearchInput placeholder="Search dealer name..." />
              </div>
            </div>

            <DataTable 
              key={metricMode + '-' + selectedPendingMonth + '-' + statusFilter + '-' + (searchParams.get('sort') || '')}
              data={filteredDealers} 
              columns={columns} 
              defaultSort={
                searchParams.get('sort') === 'avgPeriod' || searchParams.get('sort') === 'leadTime'
                  ? [{ id: 'avgPeriod', desc: true }]
                  : [{ id: metricMode === 'PENDING' ? 'pendingQty' : 'cur', desc: true }]
              }
              onRowClick={setSelectedDealer}
            />
          </div>
        </div>

        {/* Right Col: Dealer Intelligence Panel */}
        {selectedDealer && (
          <div className="xl:col-span-4 space-y-6 min-w-0">
            <CollapsibleCard 
              title="Dealer Profile" 
              accentColor={selectedAccentColor}
              badge={<button 
                onClick={(e) => { e.stopPropagation(); setSelectedDealer(null); }}
                className="text-xs text-text-muted hover:text-text-primary underline"
              >Close</button>}
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-text-primary break-words">{selectedDealer.client}</h3>
                <p className="text-sm text-text-muted">{selectedDealer.district}, {selectedDealer.state}</p>
                {(selectedDealer.isInactive || selectedDealer.cur === 0) && (
                  <div className="mt-2 inline-block px-2 py-1 bg-bg-secondary border border-border rounded text-xs font-bold text-text-muted">
                    INACTIVE THIS CYCLE
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-1">
                    {metricMode === 'PENDING' ? 'Pending (MT)' : 'Dispatched (MT)'}
                  </div>
                  <div className="text-base font-bold text-text-primary">
                    {formatMT(metricMode === 'PENDING' ? getPendingForPeriod(selectedDealer, selectedPendingMonth) : selectedDealer.cur)}
                  </div>
                </div>

                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-2">
                    {metricMode === 'PENDING' ? 'Est. Clearance' : 'Impact Level'}
                  </div>
                  <div className="mt-1">
                    {metricMode === 'PENDING' ? (
                      (() => {
                        const pendingQty = getPendingForPeriod(selectedDealer, selectedPendingMonth);
                        const stateData = data?.states?.find(s => s.state === selectedDealer.state);
                        let dailyAvg = selectedDealer.dailyAvgQty || selectedDealer.currentDailyRate || stateData?.dailyAvgQty || 0;
                        const clearance = getBacklogClearance(pendingQty, dailyAvg);
                        return <ImpactBadge tier={clearance.status} />;
                      })()
                    ) : (
                      <ImpactBadge 
                        tier={selectedDealer.impactTier}
                        score={selectedDealer.impactScore}
                      />
                    )}
                  </div>
                </div>
                <div className="p-3 bg-bg-secondary rounded-lg col-span-2 flex justify-between items-center">
                  <div className="text-xs text-text-muted">
                    {metricMode === 'PENDING' ? 'Days to Clear' : 'vs Last Month'}
                  </div>
                  {metricMode === 'PENDING' ? (
                    (() => {
                      const pendingQty = getPendingForPeriod(selectedDealer, selectedPendingMonth);
                      const stateData = data?.states?.find(s => s.state === selectedDealer.state);
                      let dailyAvg = selectedDealer.dailyAvgQty || selectedDealer.currentDailyRate || stateData?.dailyAvgQty || 0;
                      const clearance = getBacklogClearance(pendingQty, dailyAvg);
                      const theme = getSeverityTheme(clearance.status);
                      return (
                        <span className="font-bold text-sm" style={{ color: theme.color }}>
                          {clearance.text}
                        </span>
                      );
                    })()
                  ) : (
                    <MoMIndicator 
                      cur={selectedDealer.cur}
                      prev={selectedDealer.prev}
                      className="text-base" 
                    />
                  )}
                </div>
              </div>

              {/* Daily Pace Benchmark vs Current Daily Rate */}
              {(selectedDealer.dailyAvgQty !== undefined || selectedDealer.currentDailyRate !== undefined) && (() => {
                const dailyAvg = Number(selectedDealer.dailyAvgQty || 0);
                const curRate = Number(selectedDealer.currentDailyRate || 0);
                const actualMtd = selectedDealer.actualMtd ?? selectedDealer.cur ?? 0;
                const expectedMtd = selectedDealer.expectedMtd || (dailyAvg > 0 ? dailyAvg * 10 : 0);
                const delta = (selectedDealer.lossDelta !== undefined && selectedDealer.lossDelta !== 0)
                  ? Number(selectedDealer.lossDelta)
                  : (curRate - dailyAvg);
                const isBehind = selectedDealer.lossFlag === 'BEHIND' || (curRate < dailyAvg);

                return (
                  <div className="mb-6 p-4 bg-bg-secondary/60 border border-border/40 rounded-xl space-y-4 shadow-sm">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Daily Dispatch Target</h4>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${isBehind ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                        <span className={`w-2 h-2 rounded-full ${isBehind ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                        {isBehind ? 'BEHIND TARGET' : 'ON TRACK'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] text-text-muted uppercase block">Target Daily Rate</span>
                        <div className="text-base font-extrabold text-text-primary">{formatMT(dailyAvg)}/day</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-text-muted uppercase block">Current Daily Rate</span>
                        <div className="text-base font-extrabold text-text-primary">{formatMT(curRate)}/day</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-text-muted uppercase block">Expected This Month</span>
                        <div className="text-sm font-semibold text-text-primary">{formatMT(expectedMtd)}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-text-muted uppercase block">Actual Dispatched</span>
                        <div className="text-sm font-semibold text-text-primary">{formatMT(actualMtd)}</div>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-border/40 flex justify-between items-center text-xs">
                      <span className="text-text-muted">Daily Gap</span>
                      <span className={`font-bold ${delta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {delta >= 0 ? '+' : ''}{formatMT(delta)}/day
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* AI Recommendations */}
              {aiRisk && (
                <div className="mb-6 p-4 bg-accent-blue/10 border border-accent-blue/20 rounded-lg">
                  <h4 className="text-xs font-bold text-accent-blue uppercase mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">🤖 AI Recommended Action</span>
                    {selectedPendingMonth && selectedPendingMonth !== getCurMonthKey(rawData) && (
                      <span className="text-[10px] normal-case font-normal text-text-muted">(Current Cycle Insight)</span>
                    )}
                  </h4>
                  <p className="text-sm text-text-primary leading-relaxed">
                    {aiRisk.recommended_action}
                  </p>
                </div>
              )}

              {/* Active Alerts */}
              {dealerAlerts.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">Active Alerts</h4>
                  <div className="space-y-2">
                    {dealerAlerts.map((a, i) => {
                      return (
                      <div key={i} className="p-3 bg-bg-secondary rounded-lg border-l-2 border-severity-high">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={a.severity} />
                          <span className="text-xs font-bold truncate max-w-[200px]">{a.title}</span>
                        </div>
                        <p className="text-xs text-text-muted whitespace-pre-line">{a.detail}</p>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Product Mix */}
              {selectedDealerProducts.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">
                    {metricMode === 'PENDING' ? 'Product Backlog Share' : 'Product Mix'}
                  </h4>
                  <div className="space-y-2">
                    {selectedDealerProducts.map(p => (
                      <div key={p.product} className="flex justify-between items-center text-sm p-2 bg-bg-secondary rounded border border-border">
                        <span className="font-bold w-12">{p.product}</span>
                        <div className="flex-1 px-4">
                          <div className="w-full bg-bg-primary h-2 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-accent-blue" 
                              style={{ width: `${p.pct}%` }}
                            ></div>
                          </div>
                        </div>
                        <span className="text-text-muted w-16 text-right">{p.displayVal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </CollapsibleCard>
          </div>
        )}
      </div>
    </div>
  );
}
