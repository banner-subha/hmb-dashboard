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
import { formatMT, formatMoM, getImpactTier } from '../utils/formatters';

export default function StateIntelligence() {
  const { data, loading, error, filters, dispatch } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Sync URL params to Context filters
  useEffect(() => {
    const stateParam = searchParams.get('state');
    dispatch({ type: 'SET_STATE', payload: stateParam || null });
  }, [searchParams, dispatch]);

  // Sync Context filters to URL params
  useEffect(() => {
    if (filters.selectedState) {
      setSearchParams({ state: filters.selectedState });
    } else {
      setSearchParams({});
    }
  }, [filters.selectedState, setSearchParams]);

  const columns = useMemo(() => [
    {
      accessorKey: 'state',
      header: 'State',
      cell: info => {
        const impact = info.row.original.impactScore ?? info.row.original.riskScore ?? 0;
        return (
          <div className="flex items-center gap-2">
            <ImpactBadge score={impact} mom={info.row.original.mom} />
            <span className="font-medium">{info.getValue()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'cur',
      header: 'Current Vol',
      cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
    },
    {
      accessorKey: 'prev',
      header: 'Prev Vol',
      cell: info => <span className="text-text-muted">{formatMT(info.getValue())}</span>,
    },
    {
      accessorKey: 'mom',
      header: 'MoM Trend',
      cell: info => <MoMIndicator pct={info.getValue()} />,
    },
    {
      accessorKey: 'share',
      header: 'Share %',
      cell: info => <span className="text-text-muted">{info.getValue()}%</span>,
    },
  ], []);

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const states = data.states || [];
  const selectedStateData = states.find(s => s.state && filters.selectedState && s.state.replace(/\s+/g, '').toUpperCase() === filters.selectedState.replace(/\s+/g, '').toUpperCase());

  return (
    <div className="animate-fade-in space-y-6">
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
          <div className="lg:col-span-5 space-y-6 animate-slide-up">
            <CollapsibleCard 
              title={`${selectedStateData.state} Intelligence`} 
              accentColor={selectedStateData.mom > 10 ? '#22c55e' : getImpactTier(selectedStateData.impactScore ?? selectedStateData.riskScore ?? 0, selectedStateData.mom).color}
              badge={<button 
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_STATE', payload: null }); }}
                className="text-xs text-text-muted hover:text-text-primary underline"
              >Clear</button>}
            >
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-1">Volume Drop</div>
                  <div className="text-lg font-bold text-severity-critical">
                    {formatMT(selectedStateData.drop)}
                  </div>
                </div>
                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-1">Operational Impact</div>
                  <div className="mt-1">
                    <ImpactBadge score={selectedStateData.impactScore ?? selectedStateData.riskScore ?? 0} mom={selectedStateData.mom} />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">Product Mix</h4>
                  <ShareDonutChart data={selectedStateData.products} height={200} />
                </div>
                
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">Product MoM Breakdown</h4>
                  <div className="space-y-2">
                    {selectedStateData.products?.sort((a,b)=>a.mom-b.mom).map(p => (
                      <div key={p.product} className="flex justify-between items-center text-sm p-2 bg-bg-secondary rounded">
                        <span className="font-medium">{p.product}</span>
                        <div className="flex gap-4">
                          <span className="text-text-muted w-16 text-right">{formatMT(p.cur)}</span>
                          <span className="w-16 text-right"><MoMIndicator pct={p.mom} /></span>
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
