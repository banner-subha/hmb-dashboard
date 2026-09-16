import { memo, useMemo } from 'react';
import DataTable from '../common/DataTable';

/**
 * Sales team view, on the shared DataTable.
 *
 * Six columns, down from ten, so the table fits the card at the larger type.
 * The pairs that belong together share a cell: the role under the name, the
 * same-period comparison under this month's count, the division that produced
 * the daily rate under it, and the two visit types in one column.
 *
 * Only the second column is about this month. Visits per day, the visit mix and
 * visit length are all career figures, and sitting in a row beside a monthly
 * count they read as monthly ones — a rep with 80 visits this month and "9.7
 * /day" beside it looks like a reader's arithmetic error rather than two
 * different windows. Those cells now show the figures they are built from, so
 * the window is legible from the numbers themselves, with the wording spelled
 * out in a tooltip rather than crowding the row.
 */
function RepPerformanceTable({ rows }) {
  const columns = useMemo(() => [
    {
      accessorKey: 'employee_name',
      header: 'Sales Executive',
      meta: { width: '20%', minWidth: '175px' },
      // The lifetime visit total used to sit here, one column away from "446
      // field days" under the daily rate. Two all-time numbers in different
      // units, side by side, with nothing saying that one is the other divided
      // by the days — it read as a contradiction. The total now sits inside the
      // division it belongs to, and this line carries the role instead, which
      // is the fact the filter above sorts on and the table never showed.
      cell: info => {
        const role = info.row.original.role;
        const tagRole = role === 'KRM' || role === 'KRO' ? role : 'REP';
        return (
          <div>
            <span className="block font-bold text-[15px] text-text-primary whitespace-normal break-words leading-tight">
              {String(info.getValue() ?? '')}
            </span>
            <span
              data-role={tagRole}
              className="role-tag inline-block mt-1.5 px-1.5 py-0.5 text-[10px]"
            >
              {tagRole === 'REP' ? 'Field rep' : tagRole}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'curVisits',
      header: 'Visits This Month',
      meta: { width: '16%', minWidth: '145px' },
      cell: info => {
        const r = info.row.original;
        const delta = (r.curVisits ?? 0) - (r.prevVisitsMtd ?? 0);
        return (
          <div
            title={`${(r.curVisits ?? 0).toLocaleString('en-IN')} visits so far this month against ${(r.prevVisitsMtd ?? 0).toLocaleString('en-IN')} over the same days of last month`}
          >
            <span className="block font-black text-[17px] text-accent-blue leading-none">
              {(info.getValue() ?? 0).toLocaleString('en-IN')}
            </span>
            {/* prevVisitsMtd truncates the previous month to the same day-of-month
                the current month has reached, so this compares like with like.
                Using prevVisits would put a partial month against a whole one.

                Stated as visits rather than a percentage: "+15.9%" left the
                reader to work out what it was 15.9% of, and on these counts a
                single extra call can read as double digits. */}
            <span className="block text-[11.5px] mt-1.5 leading-tight">
              {r.prevVisitsMtd == null ? (
                <span className="text-text-muted">No comparison available</span>
              ) : (
                <>
                  <span
                    className={`font-bold ${
                      delta > 0
                        ? 'text-emerald-400'
                        : delta < 0
                          ? 'text-severity-critical'
                          : 'text-text-muted'
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                  <span className="text-text-muted">
                    {' '}vs {(r.prevVisitsMtd ?? 0).toLocaleString('en-IN')} last month
                  </span>
                </>
              )}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'dailyVisitRate',
      header: 'Visits Per Day',
      meta: { width: '19%', minWidth: '175px' },
      cell: info => {
        const r = info.row.original;
        const total = r.totalVisits ?? 0;
        const days = r.activeDays ?? 0;
        // The server rounds the rate to one decimal, so the printed division
        // rarely reproduces the printed rate exactly. Naming the unrounded
        // quotient in the tooltip settles that before it reads as an error.
        const exact = days > 0 ? (total / days).toFixed(2) : '0';
        return (
          <div
            title={`Lifetime, not this month: ${total.toLocaleString('en-IN')} visits ÷ ${days.toLocaleString('en-IN')} days with at least one visit = ${exact}, shown rounded to ${info.getValue() ?? 0}. The ${total.toLocaleString('en-IN')} is the same total the Visit Mix column splits into dealers, fabricators and other.`}
          >
            <span className="block font-black text-[17px] text-text-primary leading-none whitespace-nowrap">
              {info.getValue() ?? 0}
              <span className="text-[11.5px] font-normal text-text-muted"> /day</span>
            </span>
            {/* The rate is lifetime, not this month: the parser divides every
                visit a person has ever logged by the number of distinct days
                they logged one. Printing the days alone left the reader to
                reconstruct the numerator from the Visit Mix column and then
                wonder why their arithmetic missed — both sides of the division
                are now on the row, in the order they divide. */}
            <span className="block text-[11.5px] text-text-muted mt-1.5 leading-tight">
              <span className="font-semibold text-text-secondary">
                {total.toLocaleString('en-IN')}
              </span>{' '}
              visits <span className="text-text-muted/80">÷</span>{' '}
              {days.toLocaleString('en-IN')} field days
            </span>
          </div>
        );
      },
    },
    {
      id: 'mix',
      header: 'Visit Mix',
      accessorFn: r => (r.dealerVisits ?? 0) + (r.fabricatorVisits ?? 0),
      meta: { width: '15%', minWidth: '130px' },
      cell: info => {
        const r = info.row.original;
        const dealerVisits = r.dealerVisits ?? 0;
        const fabricatorVisits = r.fabricatorVisits ?? 0;
        // The parser counts a visit into this split only when the customer is
        // typed DEALER or FABRICATOR; anything else is dropped. Across the team
        // that is 11,283 visits, so the two figures do not add up to the
        // lifetime total and the shortfall is named rather than left as a
        // discrepancy for the reader to find.
        const other = Math.max(0, (r.totalVisits ?? 0) - dealerVisits - fabricatorVisits);
        return (
          <div
            title={`Lifetime: ${dealerVisits.toLocaleString('en-IN')} dealer visits, ${fabricatorVisits.toLocaleString('en-IN')} fabricator visits${
              other > 0 ? `, ${other.toLocaleString('en-IN')} to customers of neither type` : ''
            } — ${(r.totalVisits ?? 0).toLocaleString('en-IN')} in total`}
          >
            <span className="whitespace-nowrap">
              <span className="font-bold text-[15px] text-blue-400">
                {dealerVisits.toLocaleString('en-IN')}
              </span>
              <span className="text-text-muted mx-1.5">/</span>
              <span className="font-bold text-[15px] text-amber-400">
                {fabricatorVisits.toLocaleString('en-IN')}
              </span>
            </span>
            <span className="block text-[11.5px] text-text-muted mt-1 leading-tight">
              dealers / fabricators
            </span>
            {other > 0 && (
              <span className="block text-[11px] text-text-muted/80 leading-tight">
                +{other.toLocaleString('en-IN')} other
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'avgDurationMins',
      header: 'Visit Length',
      meta: { width: '11%', minWidth: '100px' },
      cell: info => (
        <span className="text-text-secondary whitespace-nowrap">{info.getValue() ?? 0} min</span>
      ),
    },
    {
      id: 'timing',
      header: 'Morning / Afternoon',
      accessorFn: r => r.afternoonPct ?? 0,
      meta: { width: '16%', minWidth: '140px' },
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
