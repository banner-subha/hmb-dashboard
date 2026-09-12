import { memo, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import DataTable from '../common/DataTable';
import { paceDisplay, comparableFabricatorAvg, districtInsight } from '../../utils/visits';

/**
 * District fabricator coverage, on the shared DataTable.
 *
 * Five columns. District and state are one fact; visit count, change and the
 * normal figure are one fact. Stacking them keeps the table inside the card at
 * the larger type instead of pushing the last column behind a scrollbar.
 */
function DistrictDemandTable({ rows }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'district',
      header: 'District',
      meta: { width: '20%', minWidth: '160px' },
      cell: info => (
        <div>
          <span className="block font-bold text-[15px] text-text-primary whitespace-normal break-words leading-tight">
            {String(info.getValue() || 'Not recorded')}
          </span>
          <span className="block text-[12px] text-text-muted mt-1 leading-tight">
            {String(info.row.original.state || 'State not recorded')}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'curFabricatorVisits',
      header: 'Fabricator Visits',
      meta: { width: '17%', minWidth: '150px' },
      cell: info => {
        const r = info.row.original;
        const accel = r.fabricatorTrend === 'ACCELERATING';
        const g = Math.round(r.fabricatorGrowth ?? 0) || 0;
        return (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-black text-[17px] text-text-primary leading-none">
                {info.getValue() ?? 0}
              </span>
              <span className={`inline-flex items-center gap-0.5 text-[12.5px] font-bold whitespace-nowrap ${accel ? 'text-emerald-400' : 'text-text-muted'}`}>
                {accel ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {g > 0 ? `+${g}` : g}
              </span>
            </div>
            <span className="block text-[11.5px] text-text-muted mt-1 whitespace-nowrap">
              Benchmark (MTD): {comparableFabricatorAvg(r)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'curUniqueFabricators',
      header: 'Fabricators Met',
      meta: { width: '13%', minWidth: '135px' },
      cell: info => <span className="font-bold text-text-secondary">{info.getValue() ?? 0}</span>,
    },
    {
      id: 'districtPaceStatus',
      header: 'Sales vs Target',
      accessorFn: r => paceDisplay(r).label,
      meta: { width: '16%', minWidth: '145px' },
      cell: info => {
        const pace = paceDisplay(info.row.original);
        // 92 of 187 districts have no entry in the sales feed at all.
        const label = pace.key === 'UNKNOWN' ? 'No Sales Data' : pace.label;
        return (
          <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap ${pace.chip}`}>
            {label}
          </span>
        );
      },
    },
    {
      id: 'insight',
      header: 'Demand Status',
      accessorFn: r => districtInsight(r).text,
      meta: { width: '34%', minWidth: '210px' },
      cell: info => {
        const ins = districtInsight(info.row.original);
        return <span className={`text-[13px] whitespace-normal leading-snug ${ins.color}`}>{ins.text}</span>;
      },
    },
  ], []);

  return (
    <DataTable
      data={rows}
      columns={columns}
      pageSize={25}
      fixedLayout
      defaultSort={[{ id: 'curFabricatorVisits', desc: true }]}
    />
  );
}

export default memo(DistrictDemandTable);
