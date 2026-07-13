import { useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import RiskScatterPlot from '../components/charts/RiskScatterPlot';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT } from '../utils/formatters';
import { calculateMoM } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { MapPin } from 'lucide-react';


export default function DistrictIntelligence() {
  const { data, loading, error, filters, dispatch, filterOptions } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Sync URL params to Context filters
  useEffect(() => {
    const stateParam = searchParams.get('state');
    const districtParam = searchParams.get('district');
    
    dispatch({ type: 'SET_STATE', payload: stateParam || null });
    dispatch({ type: 'SET_DISTRICT', payload: districtParam || null });
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
      accessorKey: 'district',
      header: 'District',
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
      cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
    },
    {
      header: 'Trend',
      accessorKey: 'mom',
      cell: info => {
        const row = info.row.original;
        return <MoMIndicator cur={row.cur} prev={row.prev} />;
      },
    },
    {
      id: 'pace',
      header: 'Pace vs Avg',
      meta: { width: '150px', minWidth: '130px' },
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
            <div className="flex flex-col select-none cursor-help" title={fullTooltip} style={{ minWidth: '120px', maxWidth: '160px' }}>
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
      header: <div className="text-left">Severity</div>,
      meta: { width: '130px', minWidth: '120px' },
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex pr-4 shrink-0">
            <ImpactBadge tier={row.impactTier} score={row.impactScore} />
          </div>
        );
      }
    }
  ], []);

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

  const districts = data.districts || [];
  const hasFilters = !!(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery);

  return (
    <div className="space-y-6">
      {/* PAGE TITLE AT THE TOP */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-4">
        <h2 className="text-3xl font-extrabold text-text-primary flex items-center gap-3">
          <MapPin className="w-7 h-7 text-accent-blue" />
          District Performance
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: District List/Table */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-card p-6 space-y-6">
            
            {/* Integrated Filters Row */}
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between pb-4 border-b border-border/40 w-full">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider mr-1">Filters:</span>
                
                {/* State Select */}
                <select
                  className="filter-select text-xs min-w-[120px]"
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
                  className="filter-select text-xs min-w-[120px]"
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
                  className="filter-select text-xs min-w-[120px]"
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
            </div>

            <DataTable 
              data={districts} 
              columns={columns} 
              pageSize={10}
              onRowClick={(row) => {
                dispatch({ type: 'SET_STATE', payload: row.state });
                dispatch({ type: 'SET_DISTRICT', payload: row.district });
                navigate(`/dealers?state=${row.state}&district=${row.district}`);
              }}
            />
          </div>

          {filters.selectedDistrict && (
            <CollapsibleCard 
              title={`Inactive Dealers in ${filters.selectedDistrict}`} 
              badge={<span className="badge bg-severity-critical/20 text-severity-critical">{data.intel?.inactiveDealers?.length || 0}</span>}
            >
              {(!data.intel?.inactiveDealers || data.intel.inactiveDealers.length === 0) ? (
                <div className="text-center text-text-muted py-6 text-sm">
                  No inactive dealers matching this selection.
                </div>
              ) : (
                <div className="space-y-3 animate-slide-up">
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
                          {d.district}, {d.state} • Products: {d.products || 'None'}
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

        {/* Right Col: Scatter Plot & Insights */}
        <div className="lg:col-span-5 space-y-6">
          <CollapsibleCard title="District Impact Matrix" accentColor="#8b5cf6">
            <div className="text-xs text-text-muted mb-4">
              Visualizing volume vs impact score. High volume, critical impact districts (top right) require immediate intervention.
            </div>
            <RiskScatterPlot data={districts} height={350} />
          </CollapsibleCard>

          {filters.selectedState && data.intel?.concentrationRisk === 'HIGH' && (
            <div className="p-4 bg-severity-high/10 border border-severity-high/20 rounded-lg">
              <h3 className="text-sm font-bold text-severity-high mb-2">Concentration Risk Detected</h3>
              <p className="text-xs text-text-primary leading-relaxed">
                Top 3 dealers account for <strong>{data.intel.top3DealerShare}%</strong> of volume in this region. 
                Consider diversifying dealer base to reduce dependency.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
