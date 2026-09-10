import { memo, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import DataTable from '../common/DataTable';
import { paceDisplay, comparableFabricatorAvg, districtInsight } from '../../utils/visits';

/** District fabricator coverage, on the shared DataTable. */
function DistrictDemandTable({ rows }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'district',
      header: 'District',
      meta: { width: '16%', minWidth: '140px' },
      cell: info => (
        <span className="font-bold text-sm text-text-primary whitespace-normal break-words leading-tight">
          {String(info.getValue() || 'Not recorded')}
        </span>
      ),
    },
    {
      accessorKey: 'state',
      header: 'State',
      meta: { minWidth: '110px' },
      cell: info => <span className="text-text-secondary text-xs">{String(info.getValue() || '—')}</span>,
    },
    {
      accessorKey: 'curFabricatorVisits',
      header: 'Fabricator Visits This Month',
      meta: { minWidth: '110px' },
      cell: info => <span className="font-black text-text-primary">{info.getValue() ?? 0}</span>,
    },
    {
      accessorKey: 'curUniqueFabricators',
      header: 'Distinct Fabricators Visited',
      meta: { minWidth: '110px' },
      cell: info => <span className="text-text-secondary">{info.getValue() ?? 0}</span>,
    },
    {
      id: 'histAvgFabricatorVisitsMtd',
      header: 'Same Period, 6-Mo Avg',
      accessorFn: comparableFabricatorAvg,
      meta: { minWidth: '110px' },
      cell: info => <span className="text-text-muted">{info.getValue()}</span>,
    },
    {
      accessorKey: 'fabricatorGrowth',
      header: 'Visit Intensity',
      meta: { minWidth: '100px' },
      cell: info => {
        const accel = info.row.original.fabricatorTrend === 'ACCELERATING';
        const g = info.getValue() ?? 0;
        return (
          <span className={`inline-flex items-center gap-0.5 font-bold whitespace-nowrap ${accel ? 'text-emerald-400' : 'text-text-muted'}`}>
            {accel ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {g > 0 ? `+${g}` : g}
          </span>
        );
      },
    },
    {
      id: 'districtPaceStatus',
      header: 'District Sales Target Status',
      accessorFn: r => paceDisplay(r).label,
      meta: { minWidth: '125px' },
      cell: info => {
        const pace = paceDisplay(info.row.original);
        // 92 of 187 districts have no entry in the sales feed at all.
        const label = pace.key === 'UNKNOWN' ? 'No Sales Data' : pace.label;
        return (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${pace.chip}`}>
            {label}
          </span>
        );
      },
    },
    {
      id: 'insight',
      header: 'Market Demand Status',
      accessorFn: r => districtInsight(r).text,
      meta: { minWidth: '230px' },
      cell: info => {
        const ins = districtInsight(info.row.original);
        return <span className={`text-xs whitespace-normal leading-snug ${ins.color}`}>{ins.text}</span>;
      },
    },
  ], []);

  return (
    <DataTable
      data={rows}
      columns={columns}
      pageSize={25}
      defaultSort={[{ id: 'curFabricatorVisits', desc: true }]}
    />
  );
}

export default memo(DistrictDemandTable);
