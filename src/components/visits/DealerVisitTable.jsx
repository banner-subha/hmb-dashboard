import { memo, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import DataTable from '../common/DataTable';
import { formatMT } from '../../utils/formatters';
import { paceDisplay, quadrantConfig, comparableAvg, visitTrend } from '../../utils/visits';

/**
 * Dealer view, on the shared DataTable.
 *
 * Six columns, not ten. At the larger type the ten-column version ran past the
 * right edge of the card and put the sales executive behind a horizontal
 * scroll. Nothing was dropped to fix it — the columns that answer one question
 * were stacked into one cell instead:
 *
 *   dealer + location            → who and where
 *   visits + change + normal     → how much contact, against what is normal
 *   target status + daily rate   → how sales are doing
 *
 * That is also how the numbers are read: the change figure is meaningless
 * without the count beside it, and the daily rate is meaningless without the
 * target status.
 */
function DealerVisitTable({ rows, onRowClick }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'dealer',
      header: 'Dealer',
      meta: { width: '22%', minWidth: '185px' },
      cell: info => {
        const r = info.row.original;
        const geo = r.district ? `${r.district}, ${r.state}` : (r.state || '');
        return (
          <div>
            <span className="block font-bold text-[15px] text-text-primary whitespace-normal break-words leading-tight">
              {String(info.getValue() ?? '')}
            </span>
            {/* An empty cell reads as a rendering fault. These dealers carry no
                state, district or resolvable pincode on any row of the export. */}
            <span className={`block text-[12px] mt-1 leading-tight ${geo ? 'text-text-muted' : 'text-text-muted/60 italic'}`}>
              {geo || 'Location not recorded'}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'quadrant',
      header: 'Account Group',
      meta: { width: '18%', minWidth: '185px' },
      cell: info => {
        const cfg = quadrantConfig(info.getValue());
        return (
          <span
            className="inline-block px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap"
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
      meta: { width: '15%', minWidth: '140px' },
      cell: info => {
        const r = info.row.original;
        const { growth, isUp } = visitTrend(r);
        return (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-black text-[17px] text-text-primary leading-none">
                {info.getValue() ?? 0}
              </span>
              <span className={`inline-flex items-center gap-0.5 text-[12.5px] font-bold whitespace-nowrap ${isUp ? 'text-emerald-400' : 'text-text-muted'}`}>
                {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {growth > 0 ? `+${growth}` : growth}
              </span>
            </div>
            {/* The comparable window, because the change figure above is
                computed from that and not from the whole-month average. */}
            <span className="block text-[11.5px] text-text-muted mt-1 whitespace-nowrap">
              Benchmark (MTD): {comparableAvg(r)}
            </span>
          </div>
        );
      },
    },
    {
      id: 'paceStatus',
      header: 'Sales vs Target',
      accessorFn: r => paceDisplay(r).label,
      meta: { width: '17%', minWidth: '150px' },
      cell: info => {
        const r = info.row.original;
        const pace = paceDisplay(r);
        return (
          <div>
            <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap ${pace.chip}`}>
              {pace.label}
            </span>
            <span className="block text-[11.5px] text-text-muted mt-1 whitespace-nowrap">
              {r.salesMatched
                ? `${r.currentDailyRate ? formatMT(r.currentDailyRate) : formatMT(0)}/day`
                : 'No sales record'}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'avgDurationMins',
      header: 'Visit Length',
      meta: { width: '11%', minWidth: '110px' },
      cell: info => (
        <span className="text-text-secondary whitespace-nowrap">{info.getValue() ?? 0} min</span>
      ),
    },
    {
      accessorKey: 'primaryRep',
      header: 'Sales Executive',
      meta: { width: '17%', minWidth: '130px' },
      cell: info => (
        <span className="text-text-secondary text-[13.5px] whitespace-normal break-words leading-tight">
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
      fixedLayout
      defaultSort={[{ id: 'curVisits', desc: true }]}
    />
  );
}

export default memo(DealerVisitTable);
