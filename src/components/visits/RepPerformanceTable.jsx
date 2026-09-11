import { memo, useMemo } from 'react';
import DataTable from '../common/DataTable';
import MoMIndicator from '../common/MoMIndicator';

/**
 * Sales team view, on the shared DataTable.
 *
 * Six columns, down from ten, so the table fits the card at the larger type.
 * The pairs that belong together share a cell: lifetime total under the name,
 * the same-period comparison under this month's count, days in the field under
 * the daily rate, and the two visit types in one column.
 */
function RepPerformanceTable({ rows }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'employee_name',
      header: 'Sales Executive',
      meta: { width: '21%', minWidth: '175px' },
      cell: info => (
        <div>
          <span className="block font-bold text-[15px] text-text-primary whitespace-normal break-words leading-tight">
            {String(info.getValue() ?? '')}
          </span>
          <span className="block text-[12px] text-text-muted mt-1 leading-tight">
            {(info.row.original.totalVisits ?? 0).toLocaleString('en-IN')} visits all time
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'curVisits',
      header: 'Visits This Month',
      meta: { width: '17%', minWidth: '145px' },
      cell: info => {
        const r = info.row.original;
        return (
          <div>
            <span className="block font-black text-[17px] text-accent-blue leading-none">
              {info.getValue() ?? 0}
            </span>
            {/* prevVisitsMtd truncates the previous month to the same day-of-month
                the current month has reached, so this compares like with like.
                Using prevVisits would put a partial month against a whole one. */}
            <span className="block text-[11.5px] text-text-muted mt-1.5 leading-tight">
              {r.prevVisitsMtd == null ? (
                'No comparison available'
              ) : (
                <span className="inline-flex items-center gap-1">
                  <MoMIndicator cur={r.curVisits} prev={r.prevVisitsMtd} />
                  <span>vs last month</span>
                </span>
              )}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'dailyVisitRate',
      header: 'Visits Per Day',
      meta: { width: '14%', minWidth: '130px' },
      cell: info => (
        <div>
          <span className="block font-black text-[17px] text-text-primary leading-none whitespace-nowrap">
            {info.getValue() ?? 0}
            <span className="text-[11.5px] font-normal text-text-muted"> /day</span>
          </span>
          <span className="block text-[11.5px] text-text-muted mt-1.5 whitespace-nowrap">
            {info.row.original.activeDays ?? 0} days in field
          </span>
        </div>
      ),
    },
    {
      id: 'mix',
      header: 'Visit Mix',
      accessorFn: r => (r.dealerVisits ?? 0) + (r.fabricatorVisits ?? 0),
      meta: { width: '15%', minWidth: '130px' },
      cell: info => {
        const r = info.row.original;
        return (
          <div>
            <span className="whitespace-nowrap">
              <span className="font-bold text-[15px] text-blue-400">{r.dealerVisits ?? 0}</span>
              <span className="text-text-muted mx-1.5">/</span>
              <span className="font-bold text-[15px] text-purple-400">{r.fabricatorVisits ?? 0}</span>
            </span>
            <span className="block text-[11.5px] text-text-muted mt-1 leading-tight">dealers / fabricators</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'avgDurationMins',
      header: 'Visit Length',
      meta: { width: '12%', minWidth: '110px' },
      cell: info => (
        <span className="text-text-secondary whitespace-nowrap">{info.getValue() ?? 0} min</span>
      ),
    },
    {
      id: 'timing',
      header: 'Morning / Afternoon',
      accessorFn: r => r.afternoonPct ?? 0,
      meta: { width: '18%', minWidth: '150px' },
      cell: info => {
        const r = info.row.original;
        return (
          <div>
            <div className="w-full max-w-[100px] h-2.5 bg-bg-secondary rounded-full overflow-hidden flex">
              <div className="bg-amber-500 h-full" style={{ width: `${r.middayPct ?? 0}%` }} title={`Morning: ${r.middayPct ?? 0}%`} />
              <div className="bg-blue-500 h-full" style={{ width: `${r.afternoonPct ?? 0}%` }} title={`Afternoon: ${r.afternoonPct ?? 0}%`} />
            </div>
            <span className="block text-[12px] font-semibold text-text-muted mt-1.5 whitespace-nowrap">
              {r.middayPct ?? 0}% / {r.afternoonPct ?? 0}%
            </span>
          </div>
        );
      },
    },
  ], []);

  return (
    <DataTable
      data={rows}
      columns={columns}
      pageSize={25}
      fixedLayout
      defaultSort={[{ id: 'curVisits', desc: true }]}
    />
  );
}

export default memo(RepPerformanceTable);
