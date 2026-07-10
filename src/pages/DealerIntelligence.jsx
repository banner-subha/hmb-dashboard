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
import { calculateMoM, getBusinessImpact, getSeverityTheme } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';

export default function DealerIntelligence() {
  const { data, loading, error, filters, dispatch } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'

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

  const dealers = useMemo(() => data?.dealers || [], [data]);

  const filteredDealers = useMemo(() => {
    if (statusFilter === 'ACTIVE') {
      return dealers.filter(d => d.cur > 0);
    }
    if (statusFilter === 'INACTIVE') {
      return dealers.filter(d => d.cur === 0);
    }
    return dealers;
  }, [dealers, statusFilter]);

  const columns = useMemo(() => [
    {
      accessorKey: 'client',
      header: 'Dealer Name',
      meta: { width: '35%' },
      cell: info => (
        <span className="font-medium text-sm text-text-primary whitespace-normal break-words" title={info.getValue()}>
          {info.getValue()}
        </span>
      ),
    },
    {
      accessorKey: 'district',
      header: 'Location',
      meta: { width: '20%' },
      cell: info => <span className="text-text-muted text-xs truncate inline-block w-full" title={`${info.getValue()}, ${info.row.original.state}`}>{info.getValue()}, {info.row.original.state}</span>,
    },
    {
      accessorKey: 'cur',
      header: 'Vol (MT)',
      meta: { width: '10%' },
      cell: info => <span className="font-medium whitespace-nowrap">{formatMT(info.getValue())}</span>,
    },
    {
      header: 'Trend',
      accessorKey: 'mom',
      meta: { width: '10%' },
      cell: info => {
        const row = info.row.original;
        return <MoMIndicator cur={row.cur} prev={row.prev} className="whitespace-nowrap" />;
      },
    },
    {
      id: 'pace',
      header: 'Pace vs Avg',
      meta: { width: '170px' },
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
            <div className="flex flex-col select-none cursor-help" title={fullTooltip} style={{ minWidth: '160px', maxWidth: '180px' }}>
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
      header: 'Status',
      accessorKey: 'operationalStatus',
      meta: { width: '15%' },
      cell: info => {
        const row = info.row.original;
        // Derive status and theme from precalculated severity
        const statusLabel = (row.isInactive || row.cur === 0) ? 'Inactive' : (row.impactTier === 'LOW' || row.impactTier === 'NONE') ? 'Growing' : 'Declining';
        const theme = getSeverityTheme(row.impactTier);

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

  if (loading) return (
    <div className="space-y-6">
      <div className="glass-card shadow-lg">
        <SkeletonLoader variant="table-row" count={8} />
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const dealerAlerts = data.alerts?.filter(a => a.category === 'DEALER' && a.data?.client === selectedDealer?.client) || [];
  const aiRisk = data.intelligence?.dealer_risks?.find(r => r.dealer === selectedDealer?.client);

  // Compute accent color from frontend engine for selected dealer
  const selectedAccentColor = selectedDealer?.healthColor || '#6b7280';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <FilterBar />
        <div className="w-full sm:w-auto -mt-6 sm:mt-0">
          <SearchInput placeholder="Search dealer name..." />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Col: Dealer Directory */}
        <div className={`${selectedDealer ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-6 transition-all duration-300 min-w-0`}>
          <CollapsibleCard title="Dealer Directory" badge={<span className="badge bg-bg-secondary text-text-muted">{filteredDealers.length}</span>}>
            <DataTable 
              data={filteredDealers} 
              columns={columns} 
              onRowClick={setSelectedDealer}
              renderHeader={(paginationControls) => (
                <div className="flex justify-between items-center border-b border-border mb-4">
                  {/* Status Filter Tabs */}
                  <div className="flex">
                    <button 
                      onClick={() => setStatusFilter('ALL')}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${statusFilter === 'ALL' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-muted hover:text-text-primary'}`}
                    >
                      All ({dealers.length})
                    </button>
                    <button 
                      onClick={() => setStatusFilter('ACTIVE')}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${statusFilter === 'ACTIVE' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-muted hover:text-text-primary'}`}
                    >
                      Active ({dealers.filter(d => d.cur > 0).length})
                    </button>
                    <button 
                      onClick={() => setStatusFilter('INACTIVE')}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer ${statusFilter === 'INACTIVE' ? 'border-accent-blue text-accent-blue' : 'border-transparent text-text-muted hover:text-text-primary'}`}
                    >
                      Inactive ({dealers.filter(d => d.cur === 0).length})
                    </button>
                  </div>
                  {/* Pagination Controls */}
                  {paginationControls}
                </div>
              )}
            />
          </CollapsibleCard>
        </div>

        {/* Right Col: Detail Panel */}
        {selectedDealer && (
          <div className="xl:col-span-4 space-y-6 min-w-0">
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
                      tier={selectedDealer.impactTier}
                      score={selectedDealer.impactScore}
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

              {/* Daily Pace Benchmark vs Current Daily Rate */}
              {selectedDealer.dailyAvgQty !== undefined && (
                <div className="mb-6 p-4 bg-bg-secondary/60 border border-border/40 rounded-xl space-y-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Daily Pace Benchmark</h4>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${selectedDealer.lossFlag === 'BEHIND' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                      <span className={`w-2 h-2 rounded-full ${selectedDealer.lossFlag === 'BEHIND' ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                      {selectedDealer.lossFlag === 'BEHIND' ? 'BEHIND BENCHMARK' : 'ON TRACK'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Daily Avg Benchmark</span>
                      <div className="text-base font-extrabold text-text-primary">{formatMT(selectedDealer.dailyAvgQty)}/day</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Current Daily Rate</span>
                      <div className="text-base font-extrabold text-text-primary">{formatMT(selectedDealer.currentDailyRate)}/day</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Expected MTD Pace</span>
                      <div className="text-sm font-semibold text-text-primary">{formatMT(selectedDealer.expectedMtd)}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-text-muted uppercase block">Actual MTD Dispatch</span>
                      <div className="text-sm font-semibold text-text-primary">{formatMT(selectedDealer.actualMtd)}</div>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-border/40 flex justify-between items-center text-xs">
                    <span className="text-text-muted">Pace Variance (Delta)</span>
                    <span className={`font-bold ${selectedDealer.lossDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {selectedDealer.lossDelta >= 0 ? '+' : ''}{formatMT(selectedDealer.lossDelta)}/day
                    </span>
                  </div>
                </div>
              )}

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
