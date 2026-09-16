import { memo, useMemo } from 'react';
import DataTable from '../common/DataTable';
import { formatMT } from '../../utils/formatters';
import {
  comparableFabricatorAvg,
  districtSignal,
  isUnlinked,
  getDynamicProgressColor,
} from '../../utils/visits';

/**
 * District fabricator coverage, on the shared DataTable.
 *
 * Five columns. District and state are one fact; visit count, change and the
 * normal figure are one fact. Stacking them keeps the table inside the card at
 * the larger type instead of pushing the last column behind a scrollbar.
 *
 * The two right-hand columns carry the numbers and the verdict respectively,
 * which is the opposite of how they started. Reading "Falling Behind" told a
 * sales head nothing they could act on or sort by, while the sentence beside it
 * spent a third of the table restating a judgement they had already read. So
 * the sales column now shows the tonnes and the usual daily rate, and the
 * verdict is a tag narrow enough to scan down a page of districts. The sentence
 * survives as that tag's tooltip.
 */
function DistrictDemandTable({ rows, elapsedDays, salesDays }) {
  const columns = useMemo(() => {
    // Not "Prev Month": the parser averages the same day-of-month window over
    // the last six months (main.py, hist_months). The old label named the wrong
    // period, and named it in more words than the number beside it.
    const usualLabel = 'usual';

    return [
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
        header: 'Visits This Month',
        meta: { width: '18%', minWidth: '150px' },
        cell: info => {
          const r = info.row.original;
          const usual = comparableFabricatorAvg(r);
          const g = Math.round(r.fabricatorGrowth ?? 0) || 0;
          return (
            <div
              title={`${info.getValue() ?? 0} fabricator visits so far this month, against a ${usual} ${usualLabel} — the same days of the month averaged over the last six months`}
            >
              <span className="block font-black text-[17px] text-text-primary leading-none">
                {(info.getValue() ?? 0).toLocaleString('en-IN')}
              </span>
              <span className="block text-[11.5px] mt-1.5 leading-tight whitespace-nowrap">
                <span
                  className={`font-bold ${
                    g > 0
                      ? 'text-emerald-400'
                      : g < 0
                        ? 'text-severity-critical'
                        : 'text-text-muted'
                  }`}
                >
                  {g > 0 ? `+${g}` : g}
                </span>
                <span className="text-text-muted"> vs {usual} {usualLabel}</span>
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'curUniqueFabricators',
        header: 'Unique Fabricators',
        meta: { width: '16%', minWidth: '150px' },
        // No second line. It carried the visits-per-fabricator average, which is
        // a real figure but a fractional one — "1.2 visits each" invites the
        // reader to ask which fifth of a call was made. The visit count it
        // divides sits in the very next column, so anyone who wants the ratio
        // can see both numbers already; the tooltip states it in whole visits.
        cell: info => {
          const r = info.row.original;
          const count = Math.round(Number(info.getValue() ?? 0));
          const totalVisits = Number(r.curFabricatorVisits ?? 0);
          return (
            <div title={`${count} fabricators reached across ${totalVisits} visits this month`}>
              <span className="font-bold text-[15px] text-text-secondary">{count.toLocaleString('en-IN')}</span>
            </div>
          );
        },
      },
      {
        id: 'salesVsTarget',
        header: 'Sales vs BP Target',
        accessorFn: r => (isUnlinked(r) ? -1 : (r.salesAchievedPct ?? (r.salesActual ? 0 : -0.5))),
        meta: { width: '24%', minWidth: '185px' },
        cell: info => {
          const r = info.row.original;
          if (isUnlinked(r)) {
            return (
              <span
                className="text-[13px] text-text-muted"
                title="This district has no entry in the dispatch feed, so there is nothing to measure its sales against"
              >
                No sales on record
              </span>
            );
          }
          const actual = r.salesActual ?? r.districtCurQty ?? 0;
          const target = r.salesTarget ?? r.bpTarget;
          const pct = r.salesAchievedPct;
          const hasTarget = target != null && target > 0;
          const dynamic = getDynamicProgressColor(pct);
          const barWidth = hasTarget && pct != null ? Math.max(0, Math.min(100, pct)) : 0;

          return (
            <div
              className="flex flex-col gap-1.5 py-0.5"
              title={
                hasTarget
                  ? `Invoiced: ${formatMT(actual, 1)} | BP Target: ${formatMT(target, 1)}${pct != null ? ` (${Number(pct).toFixed(1)}% achieved)` : ''}`
                  : `Invoiced: ${formatMT(actual, 1)} | No Business Plan target assigned`
              }
            >
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-black text-[15px] tabular-nums text-text-primary whitespace-nowrap">
                  {formatMT(actual, 1)}
                </span>
                {hasTarget ? (
                  <span className="inline-flex items-baseline gap-1 text-[13px] font-bold text-text-secondary whitespace-nowrap">
                    <span className="text-text-muted font-normal">/</span>
                    <span className="text-text-primary font-bold">{formatMT(target, 1)}</span>
                  </span>
                ) : (
                  <span className="text-[11.5px] font-medium text-text-muted italic whitespace-nowrap">
                    (No plan target)
                  </span>
                )}
              </div>

              {hasTarget ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="h-2.5 w-28 rounded-full bg-bg-secondary/90 overflow-hidden border border-border/40 p-[1px] shrink-0">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: dynamic.color,
                        boxShadow: dynamic.glow,
                      }}
                    />
                  </div>
                  <span
                    className="text-[12px] font-black tabular-nums whitespace-nowrap leading-none"
                    style={{ color: dynamic.color }}
                  >
                    {pct != null ? `${Number(pct).toFixed(1)}%` : '0.0%'}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-text-muted italic">Unbudgeted</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'signal',
        header: 'Signal',
        accessorFn: r => (districtSignal(r).score ?? -1),
        meta: { width: '24%', minWidth: '160px' },
        cell: info => {
          const sig = districtSignal(info.row.original);
          return (
            <div className="flex items-center" title={sig.detail}>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap ${sig.chip}`}
              >
                <span>{sig.tag}</span>
                {sig.score != null && (
                  <span className="opacity-75 text-[11px] font-semibold tabular-nums">
                    ({sig.score})
                  </span>
                )}
              </span>
            </div>
          );
        },
      },
    ];
  }, [elapsedDays, salesDays]);

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
