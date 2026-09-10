import { memo, useMemo } from 'react';
import DataTable from '../common/DataTable';
import MoMIndicator from '../common/MoMIndicator';

/** Sales team view, on the shared DataTable. */
function RepPerformanceTable({ rows }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'employee_name',
      header: 'Sales Executive',
      meta: { width: '20%', minWidth: '160px' },
      cell: info => (
        <span className="font-bold text-sm text-text-primary whitespace-normal break-words leading-tight">
          {String(info.getValue() ?? '')}
        </span>
      ),
    },
    {
      accessorKey: 'curVisits',
      header: 'Visits This Month',
      meta: { minWidth: '95px' },
      cell: info => <span className="font-black text-accent">{info.getValue() ?? 0}</span>,
    },
    {
      id: 'vsPrev',
      // prevVisitsMtd truncates the previous month to the same day-of-month
      // the current month has reached, so this compares like with like. Using
      // prevVisits would put a partial month against a whole one.
      header: 'vs Same Period Last Month',
      accessorFn: r => (r.prevVisitsMtd ?? 0),
      meta: { minWidth: '110px' },
      cell: info => {
        const r = info.row.original;
        if (r.prevVisitsMtd == null) return <span className="text-text-muted/60">—</span>;
        return <MoMIndicator cur={r.curVisits} prev={r.prevVisitsMtd} />;
      },
    },
    {
      accessorKey: 'totalVisits',
      header: 'Total Historical Visits',
      meta: { minWidth: '100px' },
      cell: info => <span className="text-text-secondary">{(info.getValue() ?? 0).toLocaleString('en-IN')}</span>,
    },
    {
      accessorKey: 'activeDays',
      header: 'Working Days on Field',
      meta: { minWidth: '95px' },
      cell: info => <span className="text-text-muted whitespace-nowrap">{info.getValue() ?? 0} days</span>,
    },
    {
      accessorKey: 'dailyVisitRate',
      header: 'Visits per Day',
      meta: { minWidth: '95px' },
      cell: info => (
        <span className="font-black text-text-primary whitespace-nowrap">
          {info.getValue() ?? 0}
          <span className="text-[10px] font-normal text-text-muted"> /day</span>
        </span>
      ),
    },
    {
      accessorKey: 'dealerVisits',
      header: 'Dealers Visited',
      meta: { minWidth: '90px' },
      cell: info => <span className="font-semibold text-blue-400">{info.getValue() ?? 0}</span>,
    },
    {
      accessorKey: 'fabricatorVisits',
      header: 'Fabricators Visited',
      meta: { minWidth: '90px' },
      cell: info => <span className="font-semibold text-purple-400">{info.getValue() ?? 0}</span>,
    },
    {
      accessorKey: 'avgDurationMins',
      header: 'Avg Visit Length',
      meta: { minWidth: '90px' },
      cell: info => <span className="text-text-muted whitespace-nowrap">{info.getValue() ?? 0} min</span>,
    },
    {
      id: 'timing',
      header: 'Visit Timing (Midday / Afternoon)',
      accessorFn: r => r.afternoonPct ?? 0,
      meta: { minWidth: '170px' },
      cell: info => {
        const r = info.row.original;
        return (
          <div className="flex items-center gap-1.5">
            <div className="w-20 h-2 bg-bg-secondary rounded-full overflow-hidden flex shrink-0">
              <div className="bg-amber-500 h-full" style={{ width: `${r.middayPct ?? 0}%` }} title={`Morning/Midday: ${r.middayPct ?? 0}%`} />
              <div className="bg-blue-500 h-full" style={{ width: `${r.afternoonPct ?? 0}%` }} title={`Afternoon: ${r.afternoonPct ?? 0}%`} />
            </div>
            <span className="text-[10px] text-text-muted whitespace-nowrap">
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
      defaultSort={[{ id: 'curVisits', desc: true }]}
    />
  );
}

export default memo(RepPerformanceTable);
