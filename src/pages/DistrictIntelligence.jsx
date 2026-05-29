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
import { calculateMoM, getBusinessImpact } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';


export default function DistrictIntelligence() {
  const { data, loading, error, filters, dispatch } = useData();
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
      id: 'severity',
      header: <div className="text-right">Severity</div>,
      cell: info => {
        const row = info.row.original;
        return (
          <div className="flex justify-end w-full">
            <div className="w-[100px] flex-shrink-0">
              <ImpactBadge cur={row.cur} prev={row.prev} />
            </div>
          </div>
        );
      }
    }
  ], []);

  const topDealers = useMemo(() => {
    if (!data || !data.dealers) return [];
    
    return data.dealers
      .map(d => {
        const cur = d.cur || 0;
        const prev = d.prev || 0;
        const { impactScore, severity, theme } = getBusinessImpact(cur, prev, d.inactivityDays || 0, d.volatility || 0);
        const drop = Math.max(0, prev - cur);
        return {
          ...d,
          cur,
          prev,
          impactScore,
          severity,
          theme,
          drop
        };
      })
      .sort((a, b) => b.impactScore - a.impactScore || b.drop - a.drop || b.cur - a.cur)
      .slice(0, 5);
  }, [data]);

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

  return (
    <div className="space-y-6">
      <FilterBar />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: District List/Table */}
        <div className="lg:col-span-7 space-y-6">
          <CollapsibleCard title="District Monitoring">
            <DataTable 
              data={districts} 
              columns={columns} 
              onRowClick={(row) => {
                dispatch({ type: 'SET_STATE', payload: row.state });
                dispatch({ type: 'SET_DISTRICT', payload: row.district });
                navigate(`/dealers?state=${row.state}&district=${row.district}`);
              }}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Top Impacted Dealers">
            {topDealers.length === 0 ? (
              <div className="text-center text-text-muted py-6 text-sm">
                No dealer data available for this selection.
              </div>
            ) : (
              <div className="space-y-3 animate-slide-up">
                {topDealers.map(d => (
                  <div 
                    key={d.client}
                    onClick={() => {
                      dispatch({ type: 'SET_STATE', payload: d.state });
                      dispatch({ type: 'SET_DISTRICT', payload: d.district });
                      navigate(`/dealers?state=${d.state}&district=${d.district}`);
                    }}
                    className="p-3 bg-bg-secondary/40 hover:bg-bg-card-hover border border-border/20 hover:border-border/60 rounded-xl transition-all duration-200 cursor-pointer flex flex-col gap-2 relative overflow-hidden group shadow-sm"
                  >
                    {/* Top Row: Name, Badge, Volume, Trend */}
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-text-primary text-sm sm:text-base truncate group-hover:text-accent-blue transition-colors">
                            {d.client}
                          </span>
                          <span className="text-[10px] text-text-muted tracking-wide uppercase">
                            {d.district}, {d.state}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <div className="flex items-center gap-2">
                          <ImpactBadge cur={d.cur} prev={d.prev} />
                        </div>
                        <div>
                          <span className="font-semibold text-text-primary text-sm block">
                            {formatMT(d.cur)}
                          </span>
                          <span className="text-[10px] text-text-muted">Current Vol</span>
                        </div>
                        <div className="w-[70px] flex justify-end">
                          <MoMIndicator cur={d.cur} prev={d.prev} className="text-xs font-bold" />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Progress bar and description */}
                    <div className="space-y-1.5 mt-1">
                      <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden relative border border-border/10">
                        <div 
                          className="h-full rounded-full transition-all duration-500 ease-out" 
                          style={{ 
                            width: `${d.impactScore}%`, 
                            backgroundColor: d.theme.color,
                            boxShadow: `0 0 8px ${d.theme.color}40`
                          }} 
                        />
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-text-muted">
                          {d.drop > 0 ? (
                            <>
                              Loss of <strong style={{ color: d.theme.color }} className="font-bold">{formatMT(d.drop)}</strong>
                            </>
                          ) : (
                            <span className="text-severity-low font-medium">No volume loss</span>
                          )}
                        </span>
                        <span className="text-[10px] text-text-muted bg-bg-primary/50 px-2 py-0.5 rounded font-mono border border-border/10">
                          Impact: {d.impactScore}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleCard>
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
