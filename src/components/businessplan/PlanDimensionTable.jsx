import { memo, useMemo, useCallback } from 'react';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import DataTable from '../common/DataTable';
import SkeletonLoader from '../common/SkeletonLoader';
import {
  BP_DIMENSIONS,
  formatMT1,
  formatPct1,
  formatCount,
  formatVariance,
  achievementTone,
} from '../../utils/businessPlan';
import { downloadCsv, getExportFilename } from '../../utils/csvExport';

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

/** Signed shortfall / surplus tonnage cell with explicit status coloring. */
function ShortfallGapCell({ val }) {
  if (val == null) return <span className="text-text-muted font-semibold">—</span>;
  const color = val < 0 ? '#ef4444' : val > 0 ? '#22c55e' : '#6b7280';
  return (
    <span className="font-bold tabular-nums whitespace-nowrap" style={{ color }}>
      {formatVariance(val)}
    </span>
  );
}

/** Compact billed vs planned dealers ratio cell with coverage percentage. */
function BilledDealersCell({ row }) {
  const active = row.activeDealers ?? 0;
  const planned = row.bpDealers ?? row.customers ?? 0;
  const pct = row.coveragePct ?? (planned > 0 ? (active / planned) * 100 : null);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="font-bold text-text-primary tabular-nums whitespace-nowrap">
        {formatCount(active)} / {formatCount(planned)}
      </span>
      <span className="text-[11px] text-text-muted font-semibold whitespace-nowrap">
        {formatPct1(pct)} billed
      </span>
    </div>
  );
}

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
 * Visual achievement progress bar showing attainment % against SP Target with tone styling.
 */
function AchievementBar({ pct }) {
  const tone = achievementTone(pct);
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct));

  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
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
  month,
  totals,
  totalsLoading,
  repFilterActive,
}) {
  const meta = useMemo(
    () => BP_DIMENSIONS.find((d) => d.key === dimension) || BP_DIMENSIONS[0],
    [dimension]
  );

  const hasDespatch = meta.key !== 'kro' && meta.key !== 'krm';

  const handleExportCsv = useCallback(() => {
    if (!rows || rows.length === 0) return;

    let cols = [];
    if (meta.key === 'customer') {
      cols = [
        { label: 'Customer Name', getValue: (r) => r.label || '—' },
        { label: 'State', getValue: (r) => r.grp?.state || '—' },
        { label: 'District', getValue: (r) => r.grp?.district || '—' },
        { label: 'Planned Target (MT)', getValue: (r) => (r.spTarget != null ? Number(r.spTarget).toFixed(1) : '0.0') },
        { label: 'Invoiced Despatch (MT)', getValue: (r) => (r.despatch != null ? Number(r.despatch).toFixed(1) : '0.0') },
        { label: 'Shortfall Gap (MT)', getValue: (r) => (r.shortfallGap != null ? Number(r.shortfallGap).toFixed(1) : '0.0') },
        {
          label: 'Achievement %',
          getValue: (r) => (r.achievementPct != null ? Number(r.achievementPct).toFixed(1) + '%' : '—'),
        },
        { label: 'Market Potential (MT)', getValue: (r) => (r.potential != null ? Number(r.potential).toFixed(1) : '0.0') },
        {
          label: 'Plan Status',
          getValue: (r) => (r.submitted > 0 ? 'Submitted' : r.missing > 0 ? 'Missing' : 'In Draft'),
        },
        {
          label: 'Review Status',
          getValue: (r) =>
            r.reviewed > 0 ? 'Reviewed' : r.pending > 0 ? 'Awaiting review' : 'Review not applicable',
        },
      ];
    } else if (hasDespatch) {
      cols = [
        { label: meta.entity, getValue: (r) => r.label || '—' },
        { label: 'Planned Target (MT)', getValue: (r) => (r.spTarget != null ? Number(r.spTarget).toFixed(1) : '0.0') },
        { label: 'Invoiced Despatch (MT)', getValue: (r) => (r.despatch != null ? Number(r.despatch).toFixed(1) : '0.0') },
        { label: 'Shortfall Gap (MT)', getValue: (r) => (r.shortfallGap != null ? Number(r.shortfallGap).toFixed(1) : '0.0') },
        {
          label: 'Achievement %',
          getValue: (r) => (r.achievementPct != null ? Number(r.achievementPct).toFixed(1) + '%' : '—'),
        },
        { label: 'Billed Dealers', getValue: (r) => r.activeDealers ?? 0 },
        { label: 'Planned Dealers', getValue: (r) => r.bpDealers ?? r.customers ?? 0 },
        {
          label: 'Coverage %',
          getValue: (r) =>
            r.coveragePct != null
              ? Number(r.coveragePct).toFixed(1) + '%'
              : (r.bpDealers ?? r.customers ?? 0) > 0
                ? (((r.activeDealers ?? 0) / (r.bpDealers ?? r.customers)) * 100).toFixed(1) + '%'
                : '0.0%',
        },
        { label: 'Market Potential (MT)', getValue: (r) => (r.potential != null ? Number(r.potential).toFixed(1) : '0.0') },
        { label: 'Accounts', getValue: (r) => r.customers ?? 0 },
        {
          label: 'Plans Filed %',
          getValue: (r) =>
            r.customers > 0 ? ((r.submitted / r.customers) * 100).toFixed(1) + '%' : '0.0%',
        },
        { label: 'Plans Submitted', getValue: (r) => r.submitted ?? 0 },
        { label: 'Plans Missing', getValue: (r) => r.missing ?? 0 },
      ];
    } else {
      cols = [
        { label: meta.entity, getValue: (r) => r.label || '—' },
        { label: 'Planned Target (MT)', getValue: (r) => (r.spTarget != null ? Number(r.spTarget).toFixed(1) : '0.0') },
        { label: 'Market Potential (MT)', getValue: (r) => (r.potential != null ? Number(r.potential).toFixed(1) : '0.0') },
        { label: 'Accounts', getValue: (r) => r.customers ?? 0 },
        {
          label: 'Plans Filed %',
          getValue: (r) =>
            r.customers > 0 ? ((r.submitted / r.customers) * 100).toFixed(1) + '%' : '0.0%',
        },
        { label: 'Plans Submitted', getValue: (r) => r.submitted ?? 0 },
        { label: 'Plans Missing', getValue: (r) => r.missing ?? 0 },
      ];
    }

    const filename = getExportFilename(`bp_${meta.key}_${month || 'current'}`, 'breakdown');
    downloadCsv(filename, cols, rows);
  }, [rows, meta.key, meta.entity, hasDespatch, month]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'label',
        header: meta.entity,
        meta: {
          width: meta.key === 'customer' ? '22%' : hasDespatch ? '18%' : '28%',
          minWidth: meta.key === 'customer' ? '180px' : hasDespatch ? '150px' : '180px',
        },
        cell: ({ getValue }) => (
          <span className="font-semibold text-text-primary break-words">{getValue()}</span>
        ),
      },
      {
        accessorKey: 'spTarget',
        header: 'Planned Target',
        meta: { width: hasDespatch ? (meta.key === 'customer' ? '13%' : '11%') : '16%' },
        cell: ({ getValue }) => (
          <span className="font-bold text-text-primary tabular-nums whitespace-nowrap">
            {formatMT1(getValue())}
          </span>
        ),
      },
      ...(hasDespatch
        ? [
            {
              accessorKey: 'despatch',
              header: 'Invoiced Despatch',
              meta: { width: meta.key === 'customer' ? '13%' : '11%' },
              cell: ({ getValue }) => {
                const v = getValue();
                return (
                  <span
                    className={`font-bold tabular-nums whitespace-nowrap ${
                      v > 0 ? 'text-text-primary' : 'text-text-muted'
                    }`}
                  >
                    {formatMT1(v)}
                  </span>
                );
              },
            },
            {
              accessorKey: 'shortfallGap',
              header: 'Shortfall Gap',
              meta: { width: meta.key === 'customer' ? '13%' : '12%' },
              cell: ({ getValue }) => <ShortfallGapCell val={getValue()} />,
            },
            {
              accessorKey: 'achievementPct',
              header: 'Achievement',
              meta: { width: meta.key === 'customer' ? '14%' : '12%' },
              sortUndefined: 'last',
              cell: ({ getValue }) => <AchievementBar pct={getValue()} />,
            },
            ...(meta.key !== 'customer'
              ? [
                  {
                    id: 'billedDealers',
                    accessorFn: (row) => row.coveragePct ?? -1,
                    header: 'Billed / Planned Dealers',
                    meta: { width: '13%' },
                    cell: ({ row }) => <BilledDealersCell row={row.original} />,
                  },
                ]
              : []),
          ]
        : []),
      {
        accessorKey: 'potential',
        header: 'Market Potential',
        meta: { width: hasDespatch ? (meta.key === 'customer' ? '12%' : '11%') : '18%' },
        cell: ({ getValue }) => (
          <span className="text-text-secondary tabular-nums whitespace-nowrap">
            {formatMT1(getValue())}
          </span>
        ),
      },
      ...(meta.key === 'customer'
        ? [
            {
              id: 'accountStatus',
              accessorFn: (row) => (row.submitted > 0 ? 2 : row.missing > 0 ? 0 : 1),
              header: 'Plan Status',
              meta: { width: '13%' },
              cell: ({ row }) => <AccountStatusCell row={row.original} />,
            },
          ]
        : [
            ...(hasDespatch
              ? []
              : [
                  {
                    accessorKey: 'customers',
                    header: 'Accounts',
                    meta: { width: '16%' },
                    cell: ({ getValue }) => (
                      <span className="font-semibold text-text-secondary tabular-nums">
                        {formatCount(getValue())}
                      </span>
                    ),
                  },
                ]),
            {
              id: 'submission',
              accessorFn: (row) => (row.customers > 0 ? row.submitted / row.customers : -1),
              header: 'Plans Filed',
              meta: { width: hasDespatch ? '12%' : '22%' },
              cell: ({ row }) => <SubmissionCell row={row.original} />,
            },
          ]),
    ],
    [meta.entity, meta.key, hasDespatch]
  );

  return (
    <div className="space-y-5">
      <TotalsStrip totals={totals} loading={totalsLoading} />

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

          <div className="flex items-center gap-3 self-end xl:self-auto">
            <div className="text-[13px] font-semibold text-text-muted">
              {loading ? 'Loading…' : `${formatCount(rows.length)} ${meta.entity.toLowerCase()} rows`}
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || rows.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-text-secondary hover:text-text-primary text-[13px] font-bold transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title={`Export ${meta.label} Quota Breakdown to CSV`}
            >
              <Download className="w-3.5 h-3.5 text-accent-blue shrink-0" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {repFilterActive && (
          <p className="text-[12.5px] font-semibold text-amber-500">
            Note: Invoiced despatch and achievement are tracked for territories and customer accounts. The sales rep and regional manager filters narrow quota targets and accounts.
          </p>
        )}

        {truncatedAt && !loading && (
          <p className="text-[12.5px] font-semibold text-amber-500">
            Showing the top {formatCount(truncatedAt)} rows by Planned Target. Narrow the filters above to
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
    </div>
  );
}

export default memo(PlanDimensionTable);
