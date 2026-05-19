import { useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ShareDonutChart from '../components/charts/ShareDonutChart';
import MoMTrendChart from '../components/charts/MoMTrendChart';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { formatMT, formatMoM } from '../utils/formatters';
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
      meta: { width: '45%', minWidth: '240px' },
      cell: info => {
        const row = info.row.original;
        const mom = calculateMoM(row.cur, row.prev);
        const { theme: sev } = getBusinessImpact(row.cur, row.prev, row.inactivityDays, row.volatility);
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[85px] flex-shrink-0">
              <ImpactBadge 
                cur={row.cur}
                prev={row.prev}
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
      meta: { width: '15%' },
      cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
    },
    {
      accessorKey: 'prev',
      header: 'Prev Vol',
      meta: { width: '15%' },
      cell: info => <span className="text-text-muted">{formatMT(info.getValue())}</span>,
    },
    {
      header: 'Trend',
      accessorKey: 'mom',
      meta: { width: '15%' },
      cell: info => {
        const row = info.row.original;
        return <MoMIndicator cur={row.cur} prev={row.prev} />;
      },
    },
    {
      accessorKey: 'share',
      header: 'Share %',
      meta: { width: '10%' },
      cell: info => <span className="text-text-muted">{info.getValue()}%</span>,
    },
  ], []);

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
    ? getBusinessImpact(selectedStateData.cur, selectedStateData.prev, selectedStateData.inactivityDays, selectedStateData.volatility).theme.color 
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
                      cur={selectedStateData.cur}
                      prev={selectedStateData.prev}
                    />
                  </div>
                </div>
              </div>

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
