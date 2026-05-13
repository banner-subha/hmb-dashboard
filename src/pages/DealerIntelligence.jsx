import { useMemo, useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useSearchParams } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import SearchInput from '../components/common/SearchInput';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import RiskDot from '../components/common/RiskDot';
import MoMIndicator from '../components/common/MoMIndicator';
import SeverityBadge from '../components/common/SeverityBadge';
import { formatMT } from '../utils/formatters';

export default function DealerIntelligence() {
  const { data, loading, error, filters, dispatch } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDealer, setSelectedDealer] = useState(null);

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
      accessorKey: 'client',
      header: 'Dealer Name',
      cell: info => (
        <div className="flex items-center gap-2 max-w-[200px] truncate">
          <RiskDot score={info.row.original.riskScore} />
          <span className="font-medium truncate" title={info.getValue()}>{info.getValue()}</span>
        </div>
      ),
    },
    {
      accessorKey: 'district',
      header: 'Location',
      cell: info => <span className="text-text-muted text-xs truncate max-w-[150px] inline-block" title={`${info.getValue()}, ${info.row.original.state}`}>{info.getValue()}, {info.row.original.state}</span>,
    },
    {
      accessorKey: 'cur',
      header: 'Vol (MT)',
      cell: info => <span className="font-medium">{formatMT(info.getValue())}</span>,
    },
    {
      accessorKey: 'mom',
      header: 'Trend',
      cell: info => <MoMIndicator pct={info.getValue()} />,
    },
    {
      id: 'status',
      header: 'Status',
      cell: info => {
        const mom = info.row.original.mom;
        const cur = info.row.original.cur;

        // Inactive: no current volume
        if (cur === 0) return <span className="px-2 py-1 rounded text-xs font-bold bg-[#ef4444]/20 text-[#ef4444]">Inactive</span>;
        
        // Growing: positive percentage change
        if (mom > 0) return <span className="px-2 py-1 rounded text-xs font-bold bg-[#22c55e]/20 text-[#22c55e]">Growing</span>;
        
        // Critical Drop: significant negative change (e.g., > 20% drop)
        if (mom < -20) return <span className="px-2 py-1 rounded text-xs font-bold bg-[#f97316]/20 text-[#f97316]">Critical Drop</span>;
        
        // Declining: any negative change
        if (mom < 0) return <span className="px-2 py-1 rounded text-xs font-bold bg-[#eab308]/20 text-[#eab308]">Declining</span>;
        
        // Stable: 0% change
        return <span className="px-2 py-1 rounded text-xs font-bold bg-[#6b7280]/20 text-[#6b7280]">Stable</span>;
      },
    },
  ], []);

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const dealers = data.dealers || [];
  const dealerAlerts = data.alerts?.filter(a => a.category === 'DEALER' && a.data?.client === selectedDealer?.client) || [];
  const aiRisk = data.intelligence?.dealer_risks?.find(r => r.dealer === selectedDealer?.client);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <FilterBar />
        <div className="w-full sm:w-auto -mt-6 sm:mt-0">
          <SearchInput placeholder="Search dealer name..." />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Col: Dealer Directory */}
        <div className={`${selectedDealer ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-6 transition-all duration-300`}>
          <CollapsibleCard title="Dealer Directory" badge={<span className="badge bg-bg-secondary text-text-muted">{dealers.length}</span>}>
            <DataTable 
              data={dealers} 
              columns={columns} 
              onRowClick={setSelectedDealer}
            />
          </CollapsibleCard>
        </div>

        {/* Right Col: Detail Panel */}
        {selectedDealer && (
          <div className="xl:col-span-4 space-y-6 animate-slide-up">
            <CollapsibleCard 
              title="Dealer Intelligence" 
              accentColor={selectedDealer.isInactive ? '#6b7280' : selectedDealer.riskScore >= 70 ? '#ef4444' : '#3b82f6'}
              badge={<button 
                onClick={(e) => { e.stopPropagation(); setSelectedDealer(null); }}
                className="text-xs text-text-muted hover:text-text-primary underline"
              >Close</button>}
            >
              <div className="mb-6">
                <h3 className="text-lg font-bold text-text-primary break-words">{selectedDealer.client}</h3>
                <p className="text-sm text-text-muted">{selectedDealer.district}, {selectedDealer.state}</p>
                {selectedDealer.isInactive && (
                  <div className="mt-2 inline-block px-2 py-1 bg-bg-secondary border border-border rounded text-xs font-bold text-text-muted">
                    INACTIVE THIS CYCLE
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-1">Current Vol</div>
                  <div className="text-base font-bold text-text-primary">{formatMT(selectedDealer.cur)}</div>
                </div>
                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-1">Previous Vol</div>
                  <div className="text-base font-bold text-text-secondary">{formatMT(selectedDealer.prev)}</div>
                </div>
                <div className="p-3 bg-bg-secondary rounded-lg col-span-2 flex justify-between items-center">
                  <div className="text-xs text-text-muted">MoM Trend</div>
                  <MoMIndicator pct={selectedDealer.mom} className="text-base" />
                </div>
              </div>

              {/* AI Recommendations */}
              {aiRisk && (
                <div className="mb-6 p-4 bg-accent-blue/10 border border-accent-blue/20 rounded-lg">
                  <h4 className="text-xs font-bold text-accent-blue uppercase mb-2 flex items-center gap-2">
                    🤖 AI Recommended Action
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
                    {dealerAlerts.map((a, i) => (
                      <div key={i} className="p-3 bg-bg-secondary rounded-lg border-l-2 border-severity-high">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={a.severity} />
                          <span className="text-xs font-bold truncate max-w-[200px]">{a.title}</span>
                        </div>
                        <p className="text-xs text-text-muted whitespace-pre-line">{a.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Mix */}
              {selectedDealer.products?.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase mb-3">Product Contribution</h4>
                  <div className="space-y-2">
                    {selectedDealer.products.sort((a,b)=>b.cur-a.cur).map(p => (
                      <div key={p.product} className="flex justify-between items-center text-sm p-2 bg-bg-secondary rounded border border-border">
                        <span className="font-bold w-12">{p.product}</span>
                        <div className="flex-1 px-4">
                          <div className="w-full bg-bg-primary h-2 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-accent-blue" 
                              style={{ width: `${Math.min(100, Math.max(0, (p.cur / selectedDealer.cur) * 100))}%` }}
                            ></div>
                          </div>
                        </div>
                        <span className="text-text-muted w-16 text-right">{formatMT(p.cur)}</span>
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
