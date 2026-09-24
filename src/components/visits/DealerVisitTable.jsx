import { memo, useMemo } from 'react';
import DataTable from '../common/DataTable';
import { formatMT } from '../../utils/formatters';
import {
  quadrantConfig,
  comparableAvg,
  visitTrend,
  accentBucket,
  isUnlinked,
  getDynamicProgressColor,
} from '../../utils/visits';

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
 *   invoiced + BP target + %     → how sales are doing
 *
 * That last column is deliberately identical to the one on the Districts &
 * Fabricators tab, down to the bar and its colour scale. It used to be a
 * pace chip judged against the dealer's own run rate, which meant the two tabs
 * answered the same question — "is this account keeping up?" — against two
 * different yardsticks, and a dealer could read BEHIND here while its district
 * read 90% of plan next door. Both now measure invoiced tonnes against the
 * Business Plan commitment, and fall back to the historical run rate only where
 * no plan target exists.
 *
 * That is also how the numbers are read: the change figure is meaningless
 * without the count beside it, and the daily rate is meaningless without the
 * target status.
 */
function DealerVisitTable({ rows, onRowClick, elapsedDays }) {
  const columns = useMemo(() => {
    // Not "Prev Month": the parser averages the same day-of-month window over
    // the last six months (main.py, hist_months). The old label named the wrong
    // period, and named it in more words than the number beside it.
    const usualLabel = 'usual';

    return [
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
        meta: { width: '16%', minWidth: '160px' },
        cell: info => {
          const cfg = quadrantConfig(info.getValue());
          return (
            <span
              className="inline-block px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap"
              data-accent={accentBucket(cfg.color)}
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
        meta: { width: '14%', minWidth: '135px' },
        cell: info => {
          const r = info.row.original;
          const { growth } = visitTrend(r);
          const usual = comparableAvg(r);
          return (
            <div
              title={`${info.getValue() ?? 0} visits so far this month, against a ${usual} ${usualLabel} — the same days of the month averaged over the last six months`}
            >
              <span className="block font-black text-[17px] text-text-primary leading-none">
                {(info.getValue() ?? 0).toLocaleString('en-IN')}
              </span>
              {/* The comparable window, because the change figure is computed
                  from that and not from the whole-month average. */}
              <span className="block text-[11.5px] mt-1.5 leading-tight whitespace-nowrap">
                <span
                  className={`font-bold ${
                    growth > 0
                      ? 'text-emerald-400'
                      : growth < 0
                        ? 'text-severity-critical'
                        : 'text-text-muted'
                  }`}
                >
                  {growth > 0 ? `+${growth}` : growth}
                </span>
                <span className="text-text-muted"> vs {usual} {usualLabel}</span>
              </span>
            </div>
          );
        },
      },
      {
        id: 'salesVsTarget',
        header: 'Sales vs Plan Target',
        accessorFn: r => (isUnlinked(r) ? -1 : (r.salesAchievedPct ?? (r.salesActual ? 0 : -0.5))),
        meta: { width: '24%', minWidth: '185px' },
        cell: info => {
          const r = info.row.original;
          if (isUnlinked(r)) {
            const pot = r.bpPotential;
            const hasPot = pot != null && pot > 0;
            const histQty = r.historicalQty;
            const hasHist = histQty != null && histQty > 0;

            let tooltip = 'This dealer has no entry in the dispatch feed, so there is nothing to measure its sales against';
            let subLabel = 'Prospect account';
            let subClass = 'text-text-secondary font-medium';
            if (hasPot) {
              tooltip = `Unbilled prospect account | ${formatMT(pot, 1)} monthly market potential (0 MT target assigned) | 0 invoices on record`;
              subLabel = `${formatMT(pot, 1)} potential`;
              subClass = 'text-amber-400 font-semibold';
            } else if (hasHist) {
              tooltip = `Past customer with ${formatMT(histQty, 1)} historical billing across ${r.historicalInvoices || ''} invoices | Last billed ${r.lastOrderDate || ''}`;
              subLabel = `Hist: ${formatMT(histQty, 1)}`;
              subClass = 'text-sky-400 font-semibold';
            } else {
              tooltip = 'Unbilled prospect account | Field visit account (0 invoices on record)';
              subLabel = 'Prospect account';
              subClass = 'text-text-secondary font-medium';
            }

            return (
              <div className="flex flex-col gap-0.5 py-0.5 cursor-help" title={tooltip}>
                <span className="text-[14px] text-text-primary/90 font-bold leading-tight">
                  No sales on record
                </span>
                <span className={`text-[12.5px] leading-tight ${subClass}`}>
                  ({subLabel})
                </span>
              </div>
            );
          }
          const actual = r.salesActual ?? r.salesCur ?? 0;
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
                  ? `Billed: ${formatMT(actual, 1)} | Plan target: ${formatMT(target, 1)}${pct != null ? ` (${Number(pct).toFixed(1)}% achieved)` : ''}`
                  : `Billed: ${formatMT(actual, 1)} | No plan target set`
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
                ) : null}
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
                <span className="block mt-0.5 text-[12px] font-semibold text-text-secondary">No plan target</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'avgDurationMins',
        header: 'Visit Length',
        meta: { width: '10%', minWidth: '95px' },
        cell: info => (
          <span className="text-text-secondary whitespace-nowrap">{info.getValue() ?? 0} min</span>
        ),
      },
      {
        id: 'salesExecutives',
        header: 'Sales Executives (KRM / KRO)',
        meta: { width: '25%', minWidth: '190px' },
        cell: info => {
          const r = info.row.original;
          const krmVisits = r.krmVisits || [];
          const kroVisits = r.kroVisits || [];
          const otherVisits = r.otherVisits || [];
          const hasVisitReps = krmVisits.length > 0 || kroVisits.length > 0 || otherVisits.length > 0;

          if (hasVisitReps) {
            return (
              <div className="flex flex-col gap-1 py-0.5">
                {krmVisits.map((k, idx) => (
                  <div key={`krm-${idx}`} className="flex items-center gap-1.5 leading-tight">
                    <span data-role="KRM" className="role-tag px-1.5 py-0.5 text-[10px] shrink-0">
                      KRM
                    </span>
                    <span className="text-[13px] font-semibold text-text-primary truncate" title={k.name}>
                      {k.name}
                    </span>
                    <span className="text-[11px] font-bold text-amber-400 shrink-0">
                      ({k.visits})
                    </span>
                  </div>
                ))}
                {kroVisits.map((k, idx) => (
                  <div key={`kro-${idx}`} className="flex items-center gap-1.5 leading-tight">
                    <span data-role="KRO" className="role-tag px-1.5 py-0.5 text-[10px] shrink-0">
                      KRO
                    </span>
                    <span className="text-[13px] font-medium text-text-secondary truncate" title={k.name}>
                      {k.name}
                    </span>
                    <span className="text-[11px] font-bold text-sky-400 shrink-0">
                      ({k.visits})
                    </span>
                  </div>
                ))}
                {otherVisits.map((k, idx) => (
                  <div key={`oth-${idx}`} className="flex items-center gap-1.5 leading-tight">
                    <span data-role="REP" className="role-tag px-1.5 py-0.5 text-[10px] shrink-0">
                      REP
                    </span>
                    <span className="text-[13px] text-text-muted truncate" title={k.name}>
                      {k.name}
                    </span>
                    <span className="text-[11px] font-semibold text-text-muted shrink-0">
                      ({k.visits})
                    </span>
                  </div>
                ))}
              </div>
            );
          }

          // If no visits this month, show assigned BP team if available
          if (r.assignedKrm || r.assignedKro) {
            return (
              <div className="flex flex-col gap-1 py-0.5">
                {r.assignedKrm && (
                  <div className="flex items-center gap-1.5 leading-tight">
                    <span data-role="KRM" className="role-tag px-1.5 py-0.5 text-[10px] shrink-0">
                      KRM
                    </span>
                    <span className="text-[13px] text-text-muted truncate" title={r.assignedKrm}>
                      {r.assignedKrm}
                    </span>
                  </div>
                )}
                {r.assignedKro && (
                  <div className="flex items-center gap-1.5 leading-tight">
                    <span data-role="KRO" className="role-tag px-1.5 py-0.5 text-[10px] shrink-0">
                      KRO
                    </span>
                    <span className="text-[13px] text-text-muted truncate" title={r.assignedKro}>
                      {r.assignedKro}
                    </span>
                  </div>
                )}
              </div>
            );
          }

          return (
            <span className="text-text-secondary text-[13px] whitespace-normal break-words leading-tight">
              {String(r.primaryRep || 'Unassigned')}
            </span>
          );
        },
      },
    ];
  }, [elapsedDays]);

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
