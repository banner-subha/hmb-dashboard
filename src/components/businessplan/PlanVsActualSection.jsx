import { memo, useMemo } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import DataTable from '../common/DataTable';
import SkeletonLoader from '../common/SkeletonLoader';
import {
  BP_ACTUAL_DIMENSIONS,
  achievementTone,
  formatMT1,
  formatPct1,
  formatVariance,
  formatCount,
} from '../../utils/businessPlan';

/** A bar that stops at 100% but keeps reporting the real figure beside it. */
function AchievementBar({ pct }) {
  const tone = achievementTone(pct);
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct));

  return (
    <div className="flex flex-col gap-1 min-w-[92px]">
      <span className="font-bold tabular-nums" style={{ color: tone.color }}>
        {formatPct1(pct)}
      </span>
      <span className="h-1.5 w-full rounded-full bg-bg-secondary overflow-hidden">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{ width: `${width}%`, backgroundColor: tone.color }}
        />
      </span>
    </div>
  );
}

/** Section totals — planned, invoiced, and the gap between them. */
function TotalsStrip({ totals, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SkeletonLoader variant="kpi" count={4} />
      </div>
    );
  }
  if (!totals) return null;

  const variance = totals.actual - totals.spTarget;
  const achievement = totals.spTarget > 0 ? (totals.actual / totals.spTarget) * 100 : null;
  const tone = achievementTone(achievement);
  const short = variance < 0;

  const coverage = totals.bpDealers > 0 ? (totals.activeDealers / totals.bpDealers) * 100 : null;

  const tiles = [
    {
      label: 'Planned Target',
      value: formatMT1(totals.spTarget),
      color: '#3b82f6',
      note: `Across ${formatCount(totals.bpDealers)} planned dealers`,
    },
    {
      label: 'Invoiced Despatch',
      value: formatMT1(totals.actual),
      color: '#8b5cf6',
      note: `${formatCount(totals.activeDealers)} dealers billed · ${formatPct1(coverage)} of the plan`,
    },
    {
      label: short ? 'Shortfall Gap' : 'Surplus',
      value: formatVariance(variance),
      color: short ? '#ef4444' : '#22c55e',
      icon: short ? TrendingDown : TrendingUp,
      note: short ? 'Still to despatch against plan' : 'Despatched beyond plan',
    },
    {
      label: 'Achievement',
      value: formatPct1(achievement),
      color: tone.color,
      note: tone.label,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {tiles.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.label} className="glass-card-hover relative p-4 sm:p-5 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: t.color }} />
            <div className="stat-label mb-2 text-xs font-bold text-text-muted uppercase tracking-wide">
              {t.label}
            </div>
            <div className="flex items-center gap-2">
              {Icon && <Icon className="w-5 h-5 shrink-0" style={{ color: t.color }} />}
              <span
                className="text-2xl sm:text-[1.85rem] font-black leading-none tracking-tight"
                style={{ color: t.color }}
              >
                {t.value}
              </span>
            </div>
            <div className="text-[12px] text-text-muted font-semibold mt-2">{t.note}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Plan vs. Actual Despatch.
 *
 * Every figure here — target, despatch, variance, achievement and both dealer
 * counts — is produced by `query_business_plan_vs_actual`, which joins the
 * plan to invoiced despatches inside Postgres. The only arithmetic on this
 * page is the section totals, and those add up the state grouping of the same
 * response.
 *
 * Two things the section says out loud rather than papering over:
 * the RPC applies only territory and dealer filters, so a sales-rep filter
 * chosen above does not narrow this section; and a row can exist on the
 * despatch side with no plan behind it, which is billing, not achievement.
 */
function PlanVsActualSection({
  dimension,
  onDimensionChange,
  rows,
  loading,
  error,
  totals,
  totalsLoading,
  truncatedAt,
  repFilterActive,
}) {
  const meta = useMemo(
    () => BP_ACTUAL_DIMENSIONS.find((d) => d.key === dimension) || BP_ACTUAL_DIMENSIONS[0],
    [dimension]
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: 'label',
        header: meta.entity,
        meta: { width: '24%', minWidth: '180px' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-text-primary break-words">{row.original.label}</span>
            {row.original.unplanned && (
              <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wide">
                Not in plan
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'spTarget',
        header: 'Planned Target',
        meta: { width: '15%' },
        cell: ({ getValue }) => (
          <span className="font-bold text-text-primary tabular-nums whitespace-nowrap">
            {formatMT1(getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'actual',
        header: 'Invoiced Despatch',
        meta: { width: '16%' },
        cell: ({ getValue }) => (
          <span className="font-bold text-text-secondary tabular-nums whitespace-nowrap">
            {formatMT1(getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'variance',
        header: 'Shortfall Gap',
        meta: { width: '15%' },
        cell: ({ getValue }) => {
          const v = getValue();
          const color = v < 0 ? '#ef4444' : v > 0 ? '#22c55e' : '#6b7280';
          return (
            <span className="font-bold tabular-nums whitespace-nowrap" style={{ color }}>
              {formatVariance(v)}
            </span>
          );
        },
      },
      {
        accessorKey: 'achievementPct',
        header: 'Achievement',
        meta: { width: '15%' },
        sortUndefined: 'last',
        cell: ({ getValue }) => <AchievementBar pct={getValue()} />,
      },
      // A dealer row is one dealer, so "1 / 1 planned dealers" says nothing.
      // At dealer level the useful fact is simply whether they billed at all.
      meta.key === 'dealer'
        ? {
            id: 'billed',
            accessorFn: (row) => (row.unplanned ? 2 : row.actual > 0 ? 1 : 0),
            header: 'Billing',
            meta: { width: '15%' },
            cell: ({ row }) => {
              const r = row.original;
              const status = r.unplanned
                ? { label: 'Unplanned sale', color: '#f59e0b' }
                : r.actual > 0
                  ? { label: 'Billed', color: '#22c55e' }
                  : { label: 'No invoice', color: '#ef4444' };
              return (
                <span
                  className="inline-flex items-center gap-1.5 font-bold text-[12.5px] whitespace-nowrap"
                  style={{ color: status.color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                  {status.label}
                </span>
              );
            },
          }
        : {
            id: 'coverage',
            accessorFn: (row) => row.coveragePct ?? -1,
            header: 'Billed / Planned Dealers',
            meta: { width: '15%' },
            cell: ({ row }) => {
              const r = row.original;
              return (
                <div className="flex flex-col items-start gap-0.5">
                  <span className="font-bold text-text-primary tabular-nums whitespace-nowrap">
                    {formatCount(r.activeDealers)} / {formatCount(r.bpDealers)}
                  </span>
                  <span className="text-[11px] text-text-muted font-semibold">
                    {formatPct1(r.coveragePct)} billed
                  </span>
                </div>
              );
            },
          },
    ],
    [meta.entity, meta.key]
  );

  return (
    <div className="space-y-5">
      <TotalsStrip totals={totals} loading={totalsLoading} />

      <div className="glass-card p-4 sm:p-5 lg:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 justify-between pb-5 border-b border-border/40">
          <div
            role="tablist"
            aria-label="Plan versus actual breakdown"
            className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-bg-secondary/70 border border-border/50 flex-wrap"
          >
            {BP_ACTUAL_DIMENSIONS.map((d) => {
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

        {repFilterActive && (
          <p className="text-[12.5px] font-semibold text-amber-500">
            Plan vs. Actual compares territories and dealers only. The sales rep and regional
            manager filters above do not narrow this section.
          </p>
        )}

        {truncatedAt && !loading && (
          <p className="text-[12.5px] font-semibold text-amber-500">
            Showing the first {formatCount(truncatedAt)} rows. Narrow the filters above to see the
            rest.
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
            No planned or invoiced volume matches the current filters.
          </div>
        ) : (
          <DataTable
            data={rows}
            columns={columns}
            pageSize={50}
            fixedLayout
            defaultSort={[{ id: 'variance', desc: false }]}
          />
        )}
      </div>
    </div>
  );
}

export default memo(PlanVsActualSection);
