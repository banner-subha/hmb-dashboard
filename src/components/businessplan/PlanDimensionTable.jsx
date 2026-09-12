import { memo, useMemo } from 'react';
import DataTable from '../common/DataTable';
import SkeletonLoader from '../common/SkeletonLoader';
import { BP_DIMENSIONS, formatMT1, formatPct1, formatCount } from '../../utils/businessPlan';

/**
 * One account's own plan and review state.
 *
 * At customer grain the group is a single account, so the counts the RPC
 * returns are 0 or 1 and the percentage version of them ("100.0% · 1 filed")
 * says nothing. These read them back as the states they encode.
 */
function AccountStatusCell({ row }) {
  const plan =
    row.submitted > 0
      ? { label: 'Submitted', color: '#22c55e' }
      : row.missing > 0
        ? { label: 'Missing', color: '#ef4444' }
        : { label: 'In Draft', color: '#f59e0b' };

  const review =
    row.reviewed > 0 ? 'Reviewed' : row.pending > 0 ? 'Awaiting review' : 'Review not applicable';

  return (
    // Left-aligned to sit under its header: DataTable renders every header
    // left-aligned, so an items-end stack reads as a column of orphaned values.
    <div className="flex flex-col items-start gap-1">
      <span
        className="inline-flex items-center gap-1.5 font-bold text-[12.5px] whitespace-nowrap"
        style={{ color: plan.color }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: plan.color }} />
        {plan.label}
      </span>
      <span className="text-[11px] text-text-muted font-semibold whitespace-nowrap">{review}</span>
    </div>
  );
}

/**
 * Submission state as a compact split, so a row shows how much of its own
 * account base has actually filed rather than just a count out of context.
 */
function SubmissionCell({ row }) {
  const total = row.customers || 0;
  const pct = total > 0 ? (row.submitted / total) * 100 : null;
  const tone = pct === null ? '#6b7280' : pct >= 95 ? '#22c55e' : pct >= 80 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="font-bold tabular-nums" style={{ color: tone }}>
        {formatPct1(pct)}
      </span>
      <span className="text-[11px] text-text-muted font-semibold whitespace-nowrap">
        {formatCount(row.submitted)} filed
        {row.missing > 0 ? ` · ${formatCount(row.missing)} missing` : ''}
      </span>
    </div>
  );
}

/**
 * The dimensional analysis table.
 *
 * The RPC returns the whole slice for every dimension the tab offers (14
 * states, 167 districts, 34 reps, 8 managers, ~2,000 customers), so column
 * sorting and paging happen over a complete set in the browser. When a slice
 * ever does come back at the row ceiling the table says so rather than letting
 * a truncated set read as the whole picture.
 */
function PlanDimensionTable({
  dimension,
  onDimensionChange,
  rows,
  loading,
  error,
  truncatedAt,
}) {
  const meta = useMemo(
    () => BP_DIMENSIONS.find((d) => d.key === dimension) || BP_DIMENSIONS[0],
    [dimension]
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: 'label',
        header: meta.entity,
        meta: { width: meta.key === 'customer' ? '36%' : '26%', minWidth: '180px' },
        cell: ({ getValue }) => (
          <span className="font-semibold text-text-primary break-words">{getValue()}</span>
        ),
      },
      {
        accessorKey: 'spTarget',
        header: 'SP Target',
        meta: { width: '15%' },
        cell: ({ getValue }) => (
          <span className="font-bold text-text-primary tabular-nums whitespace-nowrap">
            {formatMT1(getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'potential',
        header: 'Market Potential',
        meta: { width: '16%' },
        cell: ({ getValue }) => (
          <span className="text-text-secondary tabular-nums whitespace-nowrap">
            {formatMT1(getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'targetPct',
        header: 'Conversion',
        meta: { width: '13%' },
        sortUndefined: 'last',
        cell: ({ getValue }) => {
          const v = getValue();
          const width = v === null ? 0 : Math.max(0, Math.min(100, v));
          return (
            <div className="flex flex-col gap-1 min-w-[80px]">
              <span className="font-bold text-text-primary tabular-nums">{formatPct1(v)}</span>
              <span className="h-1.5 w-full rounded-full bg-bg-secondary overflow-hidden">
                <span
                  className="block h-full rounded-full bg-accent-blue"
                  style={{ width: `${width}%` }}
                />
              </span>
            </div>
          );
        },
      },
      // A customer row is one account, so a count of accounts and a percentage
      // of plans filed both collapse to "1" and "100%". The states behind them
      // are what the row actually has to say.
      ...(meta.key === 'customer'
        ? [
            {
              id: 'accountStatus',
              accessorFn: (row) => (row.submitted > 0 ? 2 : row.missing > 0 ? 0 : 1),
              header: 'Plan Status',
              meta: { width: '20%' },
              cell: ({ row }) => <AccountStatusCell row={row.original} />,
            },
          ]
        : [
            {
              accessorKey: 'customers',
              header: 'Accounts',
              meta: { width: '12%' },
              cell: ({ getValue }) => (
                <span className="font-semibold text-text-secondary tabular-nums">
                  {formatCount(getValue())}
                </span>
              ),
            },
            {
              id: 'submission',
              accessorFn: (row) => (row.customers > 0 ? row.submitted / row.customers : -1),
              header: 'Plans Filed',
              meta: { width: '18%' },
              cell: ({ row }) => <SubmissionCell row={row.original} />,
            },
          ]),
    ],
    [meta.entity, meta.key]
  );

  return (
    <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between pb-5 border-b border-border/40">
        <div
          role="tablist"
          aria-label="Business plan breakdown"
          className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-bg-secondary/70 border border-border/50 flex-wrap"
        >
          {BP_DIMENSIONS.map((d) => {
            const isActive = d.key === meta.key;
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onDimensionChange(d.key)}
                className={`px-4 sm:px-5 py-2.5 rounded-xl text-[14px] font-bold transition-all duration-150 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-accent-blue text-white shadow-md'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>

        <div className="text-[13px] font-semibold text-text-muted">
          {loading ? 'Loading…' : `${formatCount(rows.length)} ${meta.entity.toLowerCase()} rows`}
        </div>
      </div>

      {truncatedAt && !loading && (
        <p className="text-[12.5px] font-semibold text-amber-500">
          Showing the top {formatCount(truncatedAt)} rows by SP Target. Narrow the filters above to
          see the rest.
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-severity-critical/40 bg-severity-critical/10 p-4 text-sm text-severity-critical font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-1">
          <SkeletonLoader variant="table-row" count={8} />
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="py-12 text-center text-text-muted text-sm">
          No planned accounts match the current filters.
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          pageSize={50}
          fixedLayout
          defaultSort={[{ id: 'spTarget', desc: true }]}
        />
      )}
    </div>
  );
}

export default memo(PlanDimensionTable);
