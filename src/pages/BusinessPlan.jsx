import { AlertTriangle, ClipboardList } from 'lucide-react';

import ErrorBoundary from '../components/common/ErrorBoundary';
import SkeletonLoader from '../components/common/SkeletonLoader';

import BusinessPlanFilterBar from '../components/businessplan/BusinessPlanFilterBar';
import BusinessPlanKPIRow from '../components/businessplan/BusinessPlanKPIRow';
import ProductQuotaGrid from '../components/businessplan/ProductQuotaGrid';
import PlanDimensionTable from '../components/businessplan/PlanDimensionTable';

import { useBusinessPlan } from '../hooks/useBusinessPlan';
import { useDashboardTelemetry } from '../context/DashboardTelemetryContext';
import { formatMonthLabel } from '../utils/businessPlan';

/**
 * Business Plan.
 *
 * Monthly SP Targets and market potential, and how the month's invoiced
 * despatches are tracking against them.
 *
 * Like the other tabs this one does not set its own padding, max width or page
 * animation — DashboardLayout supplies all three. Every number on the page
 * comes back already aggregated from `query_business_plan` or
 * `query_business_plan_vs_actual`; nothing is re-totalled here except the
 * plan-vs-actual header strip, which adds up that RPC's own state rows.
 */
export default function BusinessPlan() {
  const bp = useBusinessPlan();

  useDashboardTelemetry({
    tabName: 'Business Plan',
    filters: {
      month: bp.month,
      state: bp.filters.state,
      district: bp.filters.district,
      kro: bp.filters.kro,
      krm: bp.filters.krm,
      product: bp.filters.product,
      customer: bp.filters.customer,
    },
    visibleKpis: bp.summary ? {
      total_sp_target: `${bp.summary.totalSpTarget?.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MT`,
      market_potential: `${bp.summary.marketPotential?.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MT`,
      target_conversion: `${bp.summary.targetConversion?.toFixed(1)}%`,
      active_accounts: bp.summary.activeAccounts,
    } : null,
  });

  const repFilterActive = Boolean(bp.filters.kro || bp.filters.krm);
  const fatal = bp.monthsError || (bp.summaryError && !bp.summary);

  if (fatal) {
    return (
      <div className="animate-fade-in">
        <div className="glass-card p-10 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Business Plan Unavailable</h2>
          <p className="text-sm text-text-muted mb-6 max-w-lg mx-auto">{fatal}</p>
          <button
            type="button"
            onClick={bp.reload}
            className="px-4 py-2 bg-accent-blue text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      {/* Page title — same block every other tab uses */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          <ClipboardList className="w-7 h-7 text-accent-blue mt-1 shrink-0" />
          <div>
            <h2 className="text-3xl font-extrabold text-text-primary leading-tight">
              Business Plan
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Monthly sales targets and market potential, measured against billed
              despatch.
            </p>
          </div>
        </div>

        {bp.month && (
          <span className="px-3.5 py-2 rounded-xl bg-bg-card/60 border border-border/40 text-[13px] font-bold text-text-secondary whitespace-nowrap self-start md:self-auto">
            {formatMonthLabel(bp.month)} Plan
          </span>
        )}
      </div>

      {/* ── Headline quotas, above the filters that change them ──────────── */}
      <ErrorBoundary>
        {bp.summaryLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <SkeletonLoader variant="kpi" count={5} />
          </div>
        ) : bp.summary ? (
          <BusinessPlanKPIRow summary={bp.summary} />
        ) : (
          <div className="glass-card p-8 text-center text-text-muted text-sm">
            No planned accounts match the current filters.
          </div>
        )}
      </ErrorBoundary>

      {/* ── Product mix ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="section-header">Targets by Product</h3>
        <ErrorBoundary>
          {bp.productsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <SkeletonLoader variant="kpi" count={5} />
            </div>
          ) : bp.productsError ? (
            <div className="rounded-xl border border-severity-critical/40 bg-severity-critical/10 p-4 text-sm text-severity-critical font-semibold">
              {bp.productsError}
            </div>
          ) : (
            <ProductQuotaGrid products={bp.products} activeProduct={bp.filters.product} />
          )}
        </ErrorBoundary>
      </section>

      {/* ── Dimensional analysis ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="section-header">Target vs Billed Despatch</h3>
        <ErrorBoundary>
          <PlanDimensionTable
            dimension={bp.dimension}
            onDimensionChange={bp.setDimension}
            rows={bp.dimensionRows}
            loading={bp.dimensionLoading}
            error={bp.dimensionError}
            month={bp.month}
            totals={bp.actualTotals}
            totalsLoading={bp.actualTotalsLoading}
            repFilterActive={repFilterActive}
            filterBar={
              <BusinessPlanFilterBar
                months={bp.months}
                month={bp.month}
                onMonthChange={bp.setMonth}
                filters={bp.filters}
                setFilter={bp.setFilter}
                onReset={bp.resetFilters}
                activeFilterCount={bp.activeFilterCount}
                options={bp.options}
                optionsLoading={bp.optionsLoading}
              />
            }
            truncatedAt={
              bp.dimensionRows.length >= bp.dimensionRowLimit ? bp.dimensionRowLimit : null
            }
          />
        </ErrorBoundary>
      </section>
    </div>
  );
}
