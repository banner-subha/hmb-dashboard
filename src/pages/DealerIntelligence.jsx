import { useMemo, useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useSearchParams } from 'react-router-dom';
import FilterBar from '../components/common/FilterBar';
import SearchInput from '../components/common/SearchInput';
import DataTable from '../components/common/DataTable';
import CollapsibleCard from '../components/common/CollapsibleCard';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import SeverityBadge from '../components/common/SeverityBadge';
import { formatMT } from '../utils/formatters';
import { calculateMoM, getBusinessImpact } from '../utils/trendEngine';

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
      meta: { width: '35%' },
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-4">
            <div className="w-[100px] flex-shrink-0">
              <ImpactBadge 
                cur={row.cur} 
                prev={row.prev}
              />
            </div>
            <span className="font-medium text-sm truncate" title={info.getValue()}>{info.getValue()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'district',
      header: 'Location',
      meta: { width: '25%' },
      cell: info => <span className="text-text-muted text-xs truncate inline-block w-full" title={`${info.getValue()}, ${info.row.original.state}`}>{info.getValue()}, {info.row.original.state}</span>,
    },
    {
      accessorKey: 'cur',
      header: 'Vol (MT)',
      meta: { width: '12%' },
      cell: info => <span className="font-medium whitespace-nowrap">{formatMT(info.getValue())}</span>,
    },
    {
      header: 'Trend',
      accessorKey: 'mom',
      meta: { width: '13%' },
      cell: info => {
        const row = info.row.original;
        return <MoMIndicator cur={row.cur} prev={row.prev} className="whitespace-nowrap" />;
      },
    },
    {
      header: 'Status',
      accessorKey: 'operationalStatus',
      meta: { width: '15%' },
      cell: info => {
        const row = info.row.original;
        // Derive status and theme from trendEngine
        const { severity, theme } = getBusinessImpact(row.cur, row.prev);
        const statusLabel = (row.isInactive || row.cur === 0) ? 'Inactive' : (severity === 'LOW' || severity === 'NONE') ? 'Growing' : 'Declining';

        return (
          <span 
            className="badge whitespace-nowrap" 
            style={{ backgroundColor: theme.bg, color: theme.color, borderColor: theme.border }}
          >
            {statusLabel}
          </span>
        );
      },
    },
  ], []);

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const dealers = data.dealers || [];
  const dealerAlerts = data.alerts?.filter(a => a.category === 'DEALER' && a.data?.client === selectedDealer?.client) || [];
  const aiRisk = data.intelligence?.dealer_risks?.find(r => r.dealer === selectedDealer?.client);

  // Compute accent color from frontend engine for selected dealer
  const selectedAccentColor = selectedDealer 
    ? getBusinessImpact(selectedDealer.cur, selectedDealer.prev, selectedDealer.inactivityDays, selectedDealer.volatility).theme.color 
    : '#6b7280';

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
        <div className={`${selectedDealer ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-6 transition-all duration-300 min-w-0`}>
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
          <div className="xl:col-span-4 space-y-6 animate-slide-up min-w-0">
            <CollapsibleCard 
              title="Dealer Intelligence" 
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
                  <div className="text-xs text-text-muted mb-1">Current Vol</div>
                  <div className="text-base font-bold text-text-primary">{formatMT(selectedDealer.cur)}</div>
                </div>

                <div className="p-3 bg-bg-secondary rounded-lg">
                  <div className="text-xs text-text-muted mb-2">Business Impact</div>
                  <div className="mt-1">
                    <ImpactBadge 
                      cur={selectedDealer.cur}
                      prev={selectedDealer.prev}
                    />
                  </div>
                </div>
                <div className="p-3 bg-bg-secondary rounded-lg col-span-2 flex justify-between items-center">
                  <div className="text-xs text-text-muted">MoM Trend</div>
                  <MoMIndicator 
                    cur={selectedDealer.cur}
                    prev={selectedDealer.prev}
                    className="text-base" 
                  />
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
                    {dealerAlerts.map((a, i) => {
                      const aCur = a.data?.cur ?? a.cur ?? 0;
                      const aPrev = a.data?.prev ?? a.prev ?? 0;
                      const { severity: derivedSev } = getBusinessImpact(aCur, aPrev);
                      return (
                      <div key={i} className="p-3 bg-bg-secondary rounded-lg border-l-2 border-severity-high">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={derivedSev} />
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
