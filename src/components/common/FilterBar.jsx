import { memo, useCallback } from 'react';
import { useFilterState, useDataState } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { isWestBengalUser } from '../../utils/constants';

const FilterBar = memo(function FilterBar({ children }) {
  const { filters, dispatch } = useFilterState();
  const { filterOptions } = useDataState();
  const { user } = useAuth();
  const showNorthBengal = isWestBengalUser(user, filterOptions);

  const handleStateChange = useCallback((e) => {
    dispatch({ type: 'SET_STATE', payload: e.target.value || null });
  }, [dispatch]);

  const handleDistrictChange = useCallback((e) => {
    dispatch({ type: 'SET_DISTRICT', payload: e.target.value || null });
  }, [dispatch]);

  const handleProductChange = useCallback((e) => {
    dispatch({ type: 'SET_PRODUCT', payload: e.target.value || null });
  }, [dispatch]);

  const handleToggleNorthBengal = useCallback(() => {
    dispatch({ type: 'TOGGLE_NORTH_BENGAL' });
  }, [dispatch]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  return (
    <div className="glass-card p-5 flex flex-wrap items-center gap-2 mb-5">
      <select
        className="filter-select w-full sm:w-[140px]"
        value={filters.selectedState || ''}
        onChange={handleStateChange}
      >
        <option value="">All States</option>
        {filterOptions.states.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {(filters.selectedState || filterOptions.districts.length > 0) && (
        <select
          className="filter-select w-full sm:w-[140px]"
          value={filters.selectedDistrict || ''}
          onChange={handleDistrictChange}
        >
          <option value="">All Districts</option>
          {filterOptions.districts.map(d => (
            <option key={d} value={d}>
              {d === '0' ? '0 (Unassigned / Pending)' : (d === 'VERBAL' ? 'VERBAL (Verbal Orders)' : d)}
            </option>
          ))}
        </select>
      )}

      <select
        className="filter-select w-full sm:w-[140px]"
        value={filters.selectedProduct || ''}
        onChange={handleProductChange}
      >
        <option value="">All Products</option>
        {filterOptions.products.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {/* North Bengal Filter Toggle */}
      {showNorthBengal && (
        <button
          type="button"
          onClick={handleToggleNorthBengal}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
            filters.isNorthBengal
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
              : 'bg-bg-tertiary/60 text-text-secondary border-border/40 hover:border-border'
          }`}
          title="Filter North Bengal Districts (Darjeeling, Jalpaiguri, Coochbehar, etc.)"
        >
          <span className={`w-2 h-2 rounded-full ${filters.isNorthBengal ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted/40'}`} />
          North Bengal
        </button>
      )}

      {children}

      {(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery || (user?.role === 'client' && filters.isNorthBengal)) && (
        <button
          onClick={handleReset}
          className="text-[11px] text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors px-1 cursor-pointer whitespace-nowrap"
        >
          Clear
        </button>
      )}
    </div>
  );
});

export default FilterBar;
