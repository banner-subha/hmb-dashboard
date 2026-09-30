import { useMemo, useEffect, useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useDashboardTelemetry } from '../context/DashboardTelemetryContext';
import { useAuth } from '../context/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SearchInput from '../components/common/SearchInput';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import RiskScatterPlot from '../components/charts/RiskScatterPlot';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT, formatDays } from '../utils/formatters';
import { calculateMoM, getBusinessImpact } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { MapPin } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
import ShareDonutChart from '../components/charts/ShareDonutChart';
import { PRODUCT_COLORS, getProductFullName, isWestBengalUser } from '../utils/constants';
import { getPendingForPeriod, getBacklogClearance } from '../utils/pending';
import { getCurMonthKey, getDespatchAvailableMonths, getHistoricalDistricts } from '../utils/despatch';
import ExportDropdown from '../components/common/ExportDropdown';
import { downloadCsv, getExportFilename } from '../utils/csvExport';

export default function DistrictIntelligence() {
  const { rawData, data, loading, error, filters, dispatch, filterOptions } = useData();
  const { user } = useAuth();
  const showNorthBengal = isWestBengalUser(user, filterOptions);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [selectedPendingMonth, setSelectedPendingMonth] = useState(
    () => getCurMonthKey(rawData),
  );
  const lastSyncedParamsRef = useRef(null);

  const despatchAvailableMonths = useMemo(() => getDespatchAvailableMonths(rawData), [rawData]);

  // Reset the month back to the current despatch month when the data changes.
  //
  // Applied during the render that carries the change rather than from an
  // effect: an effect committed one frame of the new data still holding the old
  // month, which reads as a wrong figure rather than as a transition.
  const [monthResetDeps, setMonthResetDeps] = useState({ rawData });
  if (monthResetDeps.rawData !== rawData) {
    setMonthResetDeps({ rawData });
    setSelectedPendingMonth(getCurMonthKey(rawData));
  }

  const filteredDistricts = useMemo(() => {
    if (!data) return [];
    let list;
    const curMonthKey = getCurMonthKey(rawData);
    let rawDistricts = data.districts || [];
    if (selectedPendingMonth && selectedPendingMonth !== curMonthKey) {
      rawDistricts = getHistoricalDistricts(rawData, filters, selectedPendingMonth);
    }

    const trendParam = searchParams.get('trend');
    if (trendParam === 'GROWING') {
      const sourceDistricts = rawData?.districts || data.districts || [];
      const growing = sourceDistricts.filter(d => {
        const mom = calculateMoM(d.cur, d.prev);
        return mom > 0 && d.cur > 0;
      });
      list = growing.sort((a, b) => {
        const gainA = (a.cur || 0) - (a.prev || 0);
        const gainB = (b.cur || 0) - (b.prev || 0);
        return gainB - gainA;
      });
    } else {
      list = rawDistricts;
    }

    if (filters.searchQuery) {
      const q = filters.searchQuery.trim().toLowerCase();
      list = list.filter(d => 
        d.district?.toLowerCase().includes(q) || 
        d.state?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [data, rawData, selectedPendingMonth, filters, searchParams]);

  useDashboardTelemetry({
    tabName: 'District Intelligence',
    filters: {
      state: filters.selectedState || 'ALL',
      district: filters.selectedDistrict || 'ALL',
      product: filters.selectedProduct || 'ALL',
      selectedMonth: selectedPendingMonth,
      search: filters.searchQuery || '',
    },
    visibleKpis: {
      districtCount: filteredDistricts?.length || 0,
      totalCurrentMT: data?.totalCur ? Math.round(data.totalCur * 10) / 10 : 0,
    },
  });

  // Sync URL params → Context: runs only when the URL itself changes.
  const hasHydratedRef = useRef(false);

  // Sync URL params to Context filters
  useEffect(() => {
    const state = searchParams.get('state') || null;
    const district = searchParams.get('district') || null;
    const product = searchParams.get('product') || null;
    const search = searchParams.get('search') || '';

    const currentUrlParamString = searchParams.toString();

    if (lastSyncedParamsRef.current !== currentUrlParamString) {
      lastSyncedParamsRef.current = currentUrlParamString;
      dispatch({ type: 'SYNC_FILTERS', payload: { state, district, product, search } });
      hasHydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync Context filters to URL params
  useEffect(() => {
    if (!hasHydratedRef.current && searchParams.toString() !== '') {
      // Awaiting initial hydration from URL params into DataContext
      return;
    }
    hasHydratedRef.current = true;

    const currentState = searchParams.get('state') || null;
    const currentDistrict = searchParams.get('district') || null;
    const currentProduct = searchParams.get('product') || null;
    const currentSearch = searchParams.get('search') || '';
    const currentTrend = searchParams.get('trend') || null;

    const nextState = filters.selectedState || null;
    const nextDistrict = filters.selectedDistrict || null;
    const nextProduct = filters.selectedProduct || null;
    const nextSearch = filters.searchQuery || '';

    if (
      currentState !== nextState ||
      currentDistrict !== nextDistrict ||
      currentProduct !== nextProduct ||
      currentSearch !== nextSearch
    ) {
      const params = {};
      if (currentTrend) params.trend = currentTrend;
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
    return [
      {
        accessorKey: 'district',
        header: 'District',
        meta: { width: '18%', minWidth: '120px' },
        cell: info => {
          const row = info.row.original;
          const val = String(info.getValue() ?? '');
          const isPlaceholder = val === '0' || val.toUpperCase() === 'VERBAL';
          return (
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-medium leading-tight">{val}</span>
                {isPlaceholder && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 tracking-wide">
                    {val === '0' ? 'Unassigned / Pending' : 'Verbal Order'}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-text-muted tracking-wide uppercase mt-0.5">{row.state}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'cur',
        header: 'Vol (MT)',
        meta: { width: '11%', minWidth: '80px' },
        cell: info => <span className="font-bold text-text-primary whitespace-nowrap">{formatMT(info.getValue())}</span>,
      },
      {
        accessorKey: 'prev',
        header: 'Prev MTD (MT)',
        meta: { width: '11%', minWidth: '85px' },
        cell: info => <span className="font-medium text-text-muted whitespace-nowrap">{formatMT(info.getValue())}</span>,
      },
      {
        header: 'MoM',
        accessorKey: 'mom',
        meta: { width: '9%', minWidth: '70px' },
        cell: info => {
          const row = info.row.original;
          return <MoMIndicator cur={row.cur} prev={row.prev} className="whitespace-nowrap" />;
        },
      },
      {
        accessorKey: 'avgPeriod',
        header: 'Avg Period',
        meta: { width: '10%', minWidth: '75px' },
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
        meta: { width: '16%', minWidth: '120px' },
        cell: info => {
          const row = info.row.original;
          const { lossFlag, lossDeltaPct, currentDailyRate, dailyAvgQty } = row;
          
          const curRate = currentDailyRate != null ? Number(currentDailyRate) : 0;
          const avgQty = dailyAvgQty != null ? Number(dailyAvgQty) : 0;
          const rawDeltaPct = lossDeltaPct != null ? Number(lossDeltaPct) : 0;
          const deltaPct = Math.min(300, rawDeltaPct);
          
          if (lossFlag === 'AHEAD' || lossFlag === 'BEHIND' || curRate > 0 || avgQty > 0) {
            const isAhead = lossFlag === 'AHEAD' || (lossFlag !== 'BEHIND' && curRate >= avgQty);
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
                <span className="text-[11px] font-semibold text-text-primary mt-0.5 truncate block">
                  {shortRateText}
                </span>
              </div>
            );
          }
          
          return (
            <div className="flex flex-col select-none cursor-pointer" title="0.0 MT/day vs avg 0.0 MT/day (On Track)">
              <span className="text-sm font-bold text-text-muted">
                0.0%
              </span>
              <span className="text-[11px] font-semibold text-text-primary mt-0.5 truncate block">
                0.0 vs 0.0 MT/d
              </span>
            </div>
          );
        }
      },
      {
        id: 'severity',
        header: <div className="text-left">Risk</div>,
        meta: { width: '14%', minWidth: '135px' },
        cell: info => {
          const row = info.row.original;
          const sharePct = row.share || 0;
          const { severity, impactScore } = getBusinessImpact(row.cur, row.prev, sharePct, 'DISTRICT', row.state, row.expectedMtd, row.lossFlag, row.lossDeltaPct);
          return (
            <div className="flex pr-4 shrink-0">
              <ImpactBadge tier={severity} score={impactScore} />
            </div>
          );
        }
      }
    ];
  }, []);

  const handleExportFiltered = () => {
    const totalVolume = filteredDistricts.reduce((sum, r) => sum + (Number(r.cur) || 0), 0);
    const cols = [
      { label: 'State', key: 'state' },
      { label: 'District', key: 'district' },
      { label: 'Despatch Volume (MT)', getValue: r => (r.cur != null ? Number(r.cur).toFixed(1) : '0.0') },
      { label: 'Previous Volume (MT)', getValue: r => (r.prev != null ? Number(r.prev).toFixed(1) : '0.0') },
      { label: 'MoM Growth %', getValue: r => (r.mom != null ? Number(r.mom).toFixed(1) + '%' : '—') },
      { label: 'Volume Share %', getValue: r => (totalVolume > 0 && r.cur > 0 ? ((r.cur / totalVolume) * 100).toFixed(1) + '%' : (r.share != null ? Number(r.share).toFixed(1) + '%' : '0.0%')) },
      { label: 'Avg Period (Days)', getValue: r => (r.avgPeriod != null ? Number(r.avgPeriod).toFixed(1) : '—') },
      { label: 'Pace Status', getValue: r => r.lossFlag || '—' },
      { label: 'Pace vs Avg %', getValue: r => (r.lossDeltaPct != null ? (r.lossFlag === 'BEHIND' ? '-' : '+') + Number(r.lossDeltaPct).toFixed(1) + '%' : '—') },
      { label: 'Current Daily Rate (MT/d)', getValue: r => (r.currentDailyRate != null ? Number(r.currentDailyRate).toFixed(1) : '—') },
      { label: 'Historical Daily Avg (MT/d)', getValue: r => (r.dailyAvgQty != null ? Number(r.dailyAvgQty).toFixed(1) : '—') },
    ];

    const filename = getExportFilename(`districts_despatch_${selectedPendingMonth || 'current'}`, 'filtered');
    downloadCsv(filename, cols, filteredDistricts);
  };

  const handleExportRaw = () => {
    const rawDistricts = rawData?.districts || [];
    const totalVolume = rawDistricts.reduce((sum, r) => sum + (Number(r.cur) || 0), 0);
    const cols = [
      { label: 'State', key: 'state' },
      { label: 'District', key: 'district' },
      { label: 'Despatch Volume (MT)', getValue: r => (r.cur != null ? Number(r.cur).toFixed(1) : '0.0') },
      { label: 'Previous Volume (MT)', getValue: r => (r.prev != null ? Number(r.prev).toFixed(1) : '0.0') },
      { label: 'MoM Growth %', getValue: r => (r.mom != null ? Number(r.mom).toFixed(1) + '%' : '—') },
      { label: 'Volume Share %', getValue: r => (totalVolume > 0 && r.cur > 0 ? ((r.cur / totalVolume) * 100).toFixed(1) + '%' : (r.share != null ? Number(r.share).toFixed(1) + '%' : '0.0%')) },
      { label: 'Total Pending Backlog (MT)', getValue: r => (getPendingForPeriod(r, 'ALL') || 0).toFixed(1) },
      { label: 'Clearance (Days)', getValue: r => {
        const p = getPendingForPeriod(r, 'ALL');
        const d = r.dailyAvgQty ?? r.currentDailyRate ?? 0;
        const days = getBacklogClearance(p, d).days;
        return days != null && !isNaN(days) && isFinite(days) ? Number(days).toFixed(1) : '—';
      }},
      { label: 'Clearance Status', getValue: r => {
        const p = getPendingForPeriod(r, 'ALL');
        const d = r.dailyAvgQty ?? r.currentDailyRate ?? 0;
        return getBacklogClearance(p, d).status || 'NORMAL';
      }},
      { label: 'Avg Period (Days)', getValue: r => (r.avgPeriod != null ? Number(r.avgPeriod).toFixed(1) : '—') },
      { label: 'Daily Avg Despatch (MT/d)', getValue: r => (r.dailyAvgQty != null ? Number(r.dailyAvgQty).toFixed(1) : '—') },
      { label: 'Current Daily Rate (MT/d)', getValue: r => (r.currentDailyRate != null ? Number(r.currentDailyRate).toFixed(1) : '—') },
      { label: 'Pace Status', getValue: r => r.lossFlag || '—' },
      { label: 'Oldest Pending Date', getValue: r => r.oldestPendingDate || '—' },
      { label: 'Product Breakdown (MT)', getValue: r => (r.products || []).map(p => `${p.product}: ${p.cur || 0} MT`).join('; ') },
    ];

    const filename = getExportFilename('districts', 'raw_all');
    downloadCsv(filename, cols, rawDistricts);
  };

  // NOTE: Must be declared before any early returns to satisfy Rules of Hooks.
  const products = data?.products || [];

  // Compute district-specific inactive dealers dynamically from all dealers
  const districtInactiveDealers = useMemo(() => {
    if (!data?.dealers) return [];
    return (data.dealers || [])
      .filter(dl => {
        if (filters.selectedState) {
          const s = filters.selectedState.replace(/\s+/g, '').toUpperCase();
          if (!dl.state || dl.state.replace(/\s+/g, '').toUpperCase() !== s) return false;
        }
        if (filters.selectedDistrict) {
          if (dl.district !== filters.selectedDistrict) return false;
        }
        return ((dl.cur === 0 && (dl.prev > 0 || (dl.inactivityDays || 0) > 0)) || dl.isInactive);
      })
      .map(dl => ({
        client: dl.client,
        state: dl.state,
        district: dl.district,
        prevVolume: dl.prev || 0,
        products: (dl.products || []).map(p => p.product).join(', ')
      }))
      .sort((a, b) => (b.prevVolume || 0) - (a.prevVolume || 0));
  }, [data?.dealers, filters.selectedState, filters.selectedDistrict]);

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

  return (
    <div className="animate-fade-in space-y-6">
      {/* PAGE TITLE AT THE TOP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-3">
          <MapPin className="w-7 h-7 text-accent-blue" />
          <h2 className="text-3xl font-extrabold text-text-primary">
            District Overview
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
                value={filters.selectedState || ''}
                onChange={(e) => dispatch({ type: 'SET_STATE', payload: e.target.value || null })}
              >
                <option value="">All States</option>
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
                    <option key={d} value={d}>
                      {d === '0' ? '0 (Unassigned / Pending)' : (d === 'VERBAL' ? 'VERBAL (Verbal Orders)' : d)}
                    </option>
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
                      : 'bg-bg-tertiary/60 text-text-secondary border-border/40 hover:border-border'
                  }`}
                  title="Filter North Bengal Districts (Darjeeling, Jalpaiguri, Cooch Behar, etc.)"
                >
                  <span className={`w-2 h-2 rounded-full ${filters.isNorthBengal ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted/40'}`} />
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

              <select
                value={selectedPendingMonth}
                onChange={(e) => setSelectedPendingMonth(e.target.value)}
                className="filter-select text-xs py-1.5 px-3 w-[110px] sm:w-[125px] shrink-0"
              >
                <option value="" disabled className="bg-bg-input text-text-muted">Select month</option>
                {despatchAvailableMonths.map(opt => (
                  <option
                    key={opt.key || opt.periodKey}
                    value={opt.key || opt.periodKey}
                    className="bg-bg-input text-text-primary"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* District Search Input directly inline */}
              <div className="shrink-0 w-[150px] sm:w-[180px]">
                <SearchInput placeholder="Search district name..." />
              </div>

              <ExportDropdown
                label="Export CSV"
                entityName="Districts"
                filteredCount={filteredDistricts.length}
                rawCount={(rawData?.districts || []).length}
                onExportFiltered={handleExportFiltered}
                onExportRaw={handleExportRaw}
              />
            </div>

            <DataTable 
              key={selectedPendingMonth}
              data={filteredDistricts} 
              columns={columns} 
              pageSize={15}
              onRowClick={(row) => {
                dispatch({ type: 'SET_STATE', payload: row.state });
                dispatch({ type: 'SET_DISTRICT', payload: row.district });
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
                  badge={<span className="badge bg-severity-critical/20 text-severity-critical">{districtInactiveDealers.length}</span>}
                >
                  {districtInactiveDealers.length === 0 ? (
                    <div className="text-center text-text-muted py-6 text-sm">
                      No inactive dealers matching this selection.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {districtInactiveDealers.slice(0, 10).map((d, i) => (
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
                      {districtInactiveDealers.length > 10 && (
                        <div className="text-center text-xs text-text-muted pt-1 pb-0.5">
                          + {districtInactiveDealers.length - 10} more inactive dealers
                        </div>
                      )}
                      <button
                        onClick={() => navigate(`/dealers?state=${filters.selectedState || ''}&district=${filters.selectedDistrict}`)}
                        className="btn-action-pill w-fit mx-auto mt-2 py-1 px-3.5 text-[11px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        View All Dealers in {filters.selectedDistrict} →
                      </button>
                    </div>
                  )}
                </CollapsibleCard>
              </m.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Col: Scatter Plot & Insights */}
        <div className="lg:col-span-4 space-y-6">
          <CollapsibleCard title="District Impact Map" accentColor="#eab308">
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
                ? `Product Mix: ${filters.selectedDistrict}`
                : filters.selectedState
                  ? `Product Mix: ${filters.selectedState}`
                  : 'Product Mix'
            }
            accentColor="#f97316"
            badge={<span className="badge bg-bg-secondary text-text-muted">{products.length}</span>}
          >
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                <div className="text-center text-xs font-semibold text-text-muted bg-bg-secondary/40 border border-border/20 rounded-xl py-1.5 px-3 w-fit mx-auto select-none tracking-wide">
                  Scope: <span className="text-accent-blue font-bold">{filters.selectedDistrict || filters.selectedState || 'All Districts'}</span>
                </div>

                {products.reduce((sum, p) => sum + (p.cur || 0), 0) === 0 && products.reduce((sum, p) => sum + (p.prev || 0), 0) > 0 && (
                  <div className="p-3 bg-severity-medium/10 border border-severity-medium/20 text-severity-medium text-xs rounded-xl flex items-center justify-center gap-2 select-none animate-pulse">
                    <span>⚠️</span>
                    <span>No active sales in this period. Showing previous period product mix.</span>
                  </div>
                )}
              </div>

              <div>
                <ShareDonutChart data={products} dataKey="cur" height={240} />
              </div>

              <div>
                <h4 className="text-xs font-bold text-text-muted uppercase mb-3">
                  Product vs Last Month
                </h4>
                <div className="space-y-2">
                  {[...products]
                    .sort((a, b) => {
                      const momA = calculateMoM(a.cur, a.prev);
                      const momB = calculateMoM(b.cur, b.prev);
                      return momA - momB;
                    })
                    .map(p => {
                      const totalVolume = products.reduce((sum, item) => sum + (item.cur || 0), 0);
                      const share = totalVolume > 0 ? Math.round(((p.cur || 0) / totalVolume) * 100) : 0;
                      return (
                        <div key={p.product} className="flex justify-between items-center text-sm p-2.5 bg-bg-secondary/40 border border-border/20 rounded-xl hover:bg-bg-card-hover transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PRODUCT_COLORS[p.product] || '#6b7280' }} />
                            <span className="font-bold text-text-primary">{p.product}</span>
                            {getProductFullName(p.product) && (
                              <span className="text-xs text-text-muted hidden sm:inline ml-1">
                                ({getProductFullName(p.product)})
                              </span>
                            )}
                          </div>
                          <div className="flex gap-4 items-center">
                            <span className="text-text-muted text-right font-medium">
                              {formatMT(p.cur)}
                            </span>
                            <span className="text-xs text-text-muted w-12 text-right">
                              {share}%
                            </span>
                            <span className="w-16 text-right">
                              <MoMIndicator cur={p.cur} prev={p.prev} />
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
