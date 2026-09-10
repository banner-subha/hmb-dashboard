import { memo, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import DataTable from '../common/DataTable';
import { formatMT } from '../../utils/formatters';
import { paceDisplay, quadrantConfig, comparableAvg, visitTrend } from '../../utils/visits';

/**
 * Dealer view, on the shared DataTable.
 *
 * The old markup was a hand-rolled <table> over filteredDealers.slice(0, 50):
 * no sorting, no paging, and 2,380 of 2,430 dealers unreachable unless you
 * happened to search for them.
 */
function DealerVisitTable({ rows, onRowClick }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'dealer',
      header: 'Dealer Name',
      meta: { width: '20%', minWidth: '160px' },
      cell: info => (
        <span className="font-bold text-sm text-text-primary whitespace-normal break-words leading-tight">
          {String(info.getValue() ?? '')}
        </span>
      ),
    },
    {
      id: 'geo',
      header: 'District & State',
      accessorFn: r => r.district ? `${r.district}, ${r.state}` : (r.state || ''),
      meta: { minWidth: '150px' },
      cell: info => {
        const v = String(info.getValue() ?? '');
        // An empty cell reads as a rendering fault. These dealers carry no
        // state, district or resolvable pincode on any row of the export.
        return v
          ? <span className="text-text-secondary text-xs">{v}</span>
          : <span className="text-text-muted/60 italic text-xs">Location not recorded</span>;
      },
    },
    {
      accessorKey: 'quadrant',
      header: 'Sales & Visit Category',
      meta: { minWidth: '170px' },
      cell: info => {
        const cfg = quadrantConfig(info.getValue());
        return (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap"
            style={{ backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}
          >
            {cfg.label}
          </span>
        );
      },
    },
    {
      accessorKey: 'curVisits',
      header: 'Visits This Month',
      meta: { minWidth: '95px' },
      cell: info => <span className="font-black text-text-primary">{info.getValue() ?? 0}</span>,
    },
    {
      id: 'histAvgVisitsMtd',
      // Shows the comparable window, because the change column beside it is
      // computed from that and not from the whole-month average.
      header: 'Same Period, 6-Mo Avg',
      accessorFn: comparableAvg,
      meta: { minWidth: '110px' },
      cell: info => <span className="text-text-muted">{info.getValue()}</span>,
    },
    {
      accessorKey: 'visitGrowth',
      header: 'Change vs Avg',
      meta: { minWidth: '100px' },
      cell: info => {
        const { growth, isUp } = visitTrend(info.row.original);
        return (
          <span className={`inline-flex items-center gap-0.5 font-bold whitespace-nowrap ${isUp ? 'text-emerald-400' : 'text-text-muted'}`}>
            {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {growth > 0 ? `+${growth}` : growth}
          </span>
        );
      },
    },
    {
      id: 'paceStatus',
      header: 'Target Status',
      accessorFn: r => paceDisplay(r).label,
      meta: { minWidth: '125px' },
      cell: info => {
        const pace = paceDisplay(info.row.original);
        return (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black whitespace-nowrap ${pace.chip}`}>
            {pace.label}
          </span>
        );
      },
    },
    {
      accessorKey: 'currentDailyRate',
      header: 'Current Sales Rate',
      meta: { minWidth: '110px' },
      cell: info => {
        const r = info.row.original;
        if (!r.salesMatched) return <span className="text-text-muted/60 text-xs">—</span>;
        const v = info.getValue();
        return <span className="text-text-secondary whitespace-nowrap">{v ? `${formatMT(v)}/day` : formatMT(0)}</span>;
      },
    },
    {
      accessorKey: 'avgDurationMins',
      header: 'Avg Visit Length',
      meta: { minWidth: '95px' },
      cell: info => <span className="text-text-secondary whitespace-nowrap">{info.getValue() ?? 0} min</span>,
    },
    {
      accessorKey: 'primaryRep',
      header: 'Assigned Sales Executive',
      meta: { minWidth: '150px' },
      cell: info => (
        <span className="text-text-secondary text-xs whitespace-normal break-words leading-tight">
          {String(info.getValue() ?? 'Unassigned')}
        </span>
      ),
    },
  ], []);

  return (
    <DataTable
      data={rows}
      columns={columns}
      onRowClick={onRowClick}
      pageSize={25}
      defaultSort={[{ id: 'curVisits', desc: true }]}
    />
  );
}

export default memo(DealerVisitTable);
