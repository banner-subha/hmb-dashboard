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
          <div className="flex items-center gap-4">
            <div className="w-[100px] flex-shrink-0">
              <ImpactBadge 
                cur={row.cur} 
                prev={row.prev}
              />
            </div>
            <span className="font-medium">{info.getValue()}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'state',
      header: 'State',
      cell: info => <span className="text-text-muted text-xs">{info.getValue()}</span>,
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

  ], []);

  if (loading) return <div className="text-center py-12">Loading...</div>;
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;
  if (!data) return null;

  const districts = data.districts || [];

  return (
    <div className="animate-fade-in space-y-6">
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
