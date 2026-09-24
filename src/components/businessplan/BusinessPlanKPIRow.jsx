import { memo } from 'react';
import { m } from 'framer-motion';
import KPICard from '../common/KPICard';
import { staggerContainer, kpiCard } from '../../utils/motionVariants';
import { formatMT1, formatPct1, formatCount } from '../../utils/businessPlan';

/**
 * Plan submission, as a proportion rather than a number.
 *
 * Built here rather than on KPICard because the fact worth reading is the
 * split — how much of the network has filed a plan at all — and a single
 * headline figure cannot show that. Everything else (surface, accent rule,
 * label scale) is copied from KPICard so the tile sits in the same row
 * without looking like a different component.
 */
function SubmissionCard({ submitted, missing, reviewed, pending, total }) {
  const denom = total > 0 ? total : 1;
  const pct = (n) => Math.max(0, Math.min(100, (n / denom) * 100));
  const draft = Math.max(0, total - submitted - missing);

  const segments = [
    { key: 'submitted', label: 'Submitted', value: submitted, color: '#22c55e' },
    { key: 'draft', label: 'In Draft', value: draft, color: '#f59e0b' },
    { key: 'missing', label: 'Missing', value: missing, color: '#ef4444' },
  ].filter((s) => s.value > 0);

  return (
    <div className="glass-card-hover kpi-tile relative p-4 flex flex-col overflow-hidden h-full">
      <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: '#22c55e' }} />

      <div className="stat-label mb-1.5 text-[12px] font-bold text-text-muted uppercase tracking-wide leading-snug truncate">
        Plan Submission
      </div>

      {/* Sized like the fitted KPICard figures beside it (same --kpi-fit). */}
      <div className="flex items-baseline gap-1.5 whitespace-nowrap mb-1 [container-type:inline-size]">
        <span
          className="font-black text-text-primary leading-none tracking-tight"
          style={{ fontSize: 'clamp(1.5rem, calc(100cqi / var(--kpi-fit, 4)), 3.05rem)' }}
        >
          {formatPct1(total > 0 ? (submitted / denom) * 100 : null)}
        </span>
      </div>

      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-bg-secondary mt-1.5 mb-2"
        role="img"
        aria-label={`${formatCount(submitted)} submitted, ${formatCount(draft)} in draft, ${formatCount(missing)} missing, of ${formatCount(total)} accounts`}
      >
        {segments.map((s) => (
          <span key={s.key} style={{ width: `${pct(s.value)}%`, backgroundColor: s.color }} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] font-semibold">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-text-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label} {formatCount(s.value)}
          </span>
        ))}
      </div>

      <div className="text-[12px] text-text-muted mt-auto pt-1 font-semibold">
        {formatCount(reviewed)} reviewed · {formatCount(pending)} awaiting review
      </div>
    </div>
  );
}

/**
 * The five headline figures, read straight off the ungrouped
 * `query_business_plan` row. No figure here is recomputed in the browser.
 */
function BusinessPlanKPIRow({ summary }) {
  if (!summary) return null;

  return (
    <m.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      // One row from xl. --kpi-fit is the widest figure's width in ems
      // ("1,36,930.0 MT"), so every figure in the row lands at one size.
      className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 [--kpi-fit:7.3]"
    >
      <m.div variants={kpiCard}>
        <KPICard
          fitValue
          label="Total SP Target"
          value={formatMT1(summary.spTarget)}
          subtitle="Sales rep quota for the plan month"
          accentColor="#3b82f6"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <KPICard
          fitValue
          label="Market Potential"
          value={formatMT1(summary.potential)}
          subtitle="Buying capacity of the planned accounts"
          accentColor="#94a3b8"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <KPICard
          fitValue
          label="Target Conversion"
          value={formatPct1(summary.targetPct)}
          subtitle="SP target as a share of potential"
          accentColor="#06b6d4"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <KPICard
          fitValue
          label="Active Accounts"
          value={formatCount(summary.customers)}
          subtitle="Dealers and customers in the plan"
          accentColor="#f59e0b"
        />
      </m.div>

      <m.div variants={kpiCard}>
        <SubmissionCard
          submitted={summary.submitted}
          missing={summary.missing}
          reviewed={summary.reviewed}
          pending={summary.pending}
          total={summary.customers}
        />
      </m.div>
    </m.div>
  );
}

export default memo(BusinessPlanKPIRow);
