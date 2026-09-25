import { memo } from 'react';
import SearchInput from '../common/SearchInput';
import ExportDropdown from '../common/ExportDropdown';

/**
 * Search, geography, the overdue switch and CSV export for the dealer table.
 * District choices come from the selected state's own rows, so the list never
 * offers a district with nothing in it.
 */
function OutstandingFilterBar({
  filters,
  setFilter,
  onReset,
  activeFilterCount,
  stateOptions,
  districtOptions,
  onExportFiltered,
  onExportAll,
  filteredCount,
  totalCount,
}) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-center gap-3">
      <SearchInput
        size="lg"
        className="xl:max-w-sm"
        placeholder="Dealer name or party code"
        value={filters.search}
        onChange={(v) => setFilter('search', v)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex xl:items-center gap-3 flex-1">
        <label className="sr-only" htmlFor="ob-state">State</label>
        <select
          id="ob-state"
          className="filter-select xl:w-48"
          value={filters.state}
          onChange={(e) => setFilter('state', e.target.value)}
        >
          <option value="">All states</option>
          {stateOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.value}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="ob-district">District</label>
        <select
          id="ob-district"
          className="filter-select xl:w-48 disabled:opacity-50 disabled:cursor-not-allowed"
          value={filters.district}
          onChange={(e) => setFilter('district', e.target.value)}
          disabled={!filters.state || districtOptions.length === 0}
          title={!filters.state ? 'Pick a state first' : districtOptions.length === 0 ? 'No districts recorded for this state' : undefined}
        >
          <option value="">
            {!filters.state ? 'All districts' : districtOptions.length ? 'All districts' : 'No districts recorded'}
          </option>
          {districtOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-bg-input text-[13px] font-semibold text-text-secondary cursor-pointer select-none whitespace-nowrap hover:border-border-accent">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[var(--color-accent-blue)] cursor-pointer"
            checked={filters.overdueOnly}
            onChange={(e) => setFilter('overdueOnly', e.target.checked)}
          />
          Only overdue dealers
        </label>

        <div className="flex items-center gap-3 sm:justify-end xl:ml-auto">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-[13px] font-bold text-accent-blue hover:underline underline-offset-4 cursor-pointer px-1 py-2"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
          <ExportDropdown
            label="Export CSV"
            entityName="Dealers"
            filteredCount={filteredCount}
            rawCount={totalCount}
            onExportFiltered={onExportFiltered}
            onExportRaw={onExportAll}
            disabled={totalCount === 0}
            showChevron
          />
        </div>
      </div>
    </div>
  );
}

export default memo(OutstandingFilterBar);
