import { memo } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import {
  BP_PRODUCTS,
  PLAN_STATUS_OPTIONS,
  KRM_STATUS_OPTIONS,
  formatMonthLabel,
} from '../../utils/businessPlan';

function Select({ label, value, onChange, options = [], placeholder, disabled }) {
  const cleanOptions = (options || []).filter((o) => {
    const val = typeof o === 'string' ? o : o?.value;
    const text = typeof o === 'string' ? o : o?.label;
    if (!val && !text) return false;
    const s = String(val || text).trim().toUpperCase();
    return s !== 'UNASSIGNED' && !s.startsWith('UNASSIGNED');
  });

  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider truncate">{label}</span>
      <select
        className="filter-select text-[13px] py-1.5 px-2.5 w-full disabled:opacity-50 disabled:cursor-not-allowed"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {cleanOptions.map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const text = typeof o === 'string' ? o : o.label;
          return (
            <option key={val || text} value={val}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}

/**
 * The header control bar: which month's plan, and which slice of it.
 *
 * The territory lists are not hard-coded — they come from `query_business_plan`
 * grouped by that dimension for the selected month, so every option in a
 * dropdown is a value the table can actually return rows for. District and rep
 * cascade from the state above them for the same reason.
 *
 * The customer box is a server-side contains-match. The input itself stays
 * fully controlled and instant; the debounce that keeps it from firing an RPC
 * per keystroke lives in useBusinessPlan, next to the query it delays.
 */
function BusinessPlanFilterBar({
  months,
  month,
  onMonthChange,
  filters,
  setFilter,
  onReset,
  activeFilterCount,
  options,
  optionsLoading,
}) {
  return (
    <div className="glass-card p-3">
      {/* One flush grid: a single row of ten from 1680px, 5 x 2 at xl, 2 x 5
          at sm. The nine controls plus the reset button divide evenly, so the
          card never carries a half-empty row. Reset is always rendered
          (disabled when nothing is filtered) rather than mounting on demand,
          which would reopen a gap. */}
      <div className="grid grid-cols-1 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-5 min-[1680px]:grid-cols-10 gap-2">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider truncate">
            Plan Month
          </span>
          <select
            className="filter-select text-[13px] py-1.5 px-2.5 w-full font-bold"
            value={month || ''}
            onChange={(e) => onMonthChange(e.target.value)}
            disabled={months.length === 0}
          >
            {months.length === 0 && <option value="">No plan months</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </label>

        <Select
          label="State"
          value={filters.state}
          onChange={(v) => setFilter('state', v)}
          options={options.states}
          placeholder={optionsLoading ? 'Loading…' : 'All States'}
        />

        <Select
          label="District"
          value={filters.district}
          onChange={(v) => setFilter('district', v)}
          options={options.districts}
          placeholder={optionsLoading ? 'Loading…' : 'All Districts'}
        />

        <Select
          label="Sales Rep (KRO)"
          value={filters.kro}
          onChange={(v) => setFilter('kro', v)}
          options={options.kros}
          placeholder={optionsLoading ? 'Loading…' : 'All KROs'}
        />

        <Select
          label="Manager (KRM)"
          value={filters.krm}
          onChange={(v) => setFilter('krm', v)}
          options={options.krms}
          placeholder={optionsLoading ? 'Loading…' : 'All KRMs'}
        />

        <Select
          label="Product"
          value={filters.product}
          onChange={(v) => setFilter('product', v)}
          options={BP_PRODUCTS.map((p) => ({ value: p.code, label: p.label }))}
          placeholder="All Products"
        />

        <Select
          label="Plan Status"
          value={filters.planStatus}
          onChange={(v) => setFilter('planStatus', v)}
          options={PLAN_STATUS_OPTIONS.filter((o) => o.value)}
          placeholder={PLAN_STATUS_OPTIONS[0].label}
        />

        <Select
          label="Review Status"
          value={filters.krmStatus}
          onChange={(v) => setFilter('krmStatus', v)}
          options={KRM_STATUS_OPTIONS.filter((o) => o.value)}
          placeholder={KRM_STATUS_OPTIONS[0].label}
        />

        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10.5px] font-bold text-text-muted uppercase tracking-wider truncate">
            Customer
          </span>
          <span className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={filters.customer}
              onChange={(e) => setFilter('customer', e.target.value)}
              placeholder="Search dealer"
              className="w-full rounded-xl border border-border bg-bg-input py-1.5 pl-8 pr-2.5 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
            />
          </span>
        </label>

        <div className="flex flex-col justify-end items-start min-w-0">
          <button
            type="button"
            onClick={onReset}
            disabled={activeFilterCount === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bg-card disabled:hover:text-text-secondary"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {activeFilterCount > 0
              ? `Clear ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}`
              : 'Clear filters'}
          </button>
        </div>
      </div>

      {filters.product && (
        <p className="mt-2 text-[12.5px] font-semibold text-text-muted">
          The product filter narrows the tab to accounts that carry{' '}
          {BP_PRODUCTS.find((p) => p.code === filters.product)?.label}. Those accounts&apos; targets
          for every other line are still counted in the totals.
        </p>
      )}
    </div>
  );
}

export default memo(BusinessPlanFilterBar);
