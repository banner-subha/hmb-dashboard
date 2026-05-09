import { useData } from '../../context/DataContext';

export default function FilterBar() {
  const { filters, dispatch, filterOptions } = useData();

  return (
    <div className="glass-card p-4 flex flex-wrap items-center gap-4 mb-6">
      <div className="text-xs font-bold text-text-muted uppercase tracking-wider mr-2 hidden md:block">
        Global Filters
      </div>
      
      <select
        className="filter-select min-w-[140px]"
        value={filters.selectedState || ''}
        onChange={(e) => dispatch({ type: 'SET_STATE', payload: e.target.value || null })}
      >
        <option value="">All States</option>
        {filterOptions.states.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        className="filter-select min-w-[140px]"
        value={filters.selectedDistrict || ''}
        onChange={(e) => dispatch({ type: 'SET_DISTRICT', payload: e.target.value || null })}
        disabled={!filters.selectedState}
      >
        <option value="">All Districts</option>
        {filterOptions.districts.map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <select
        className="filter-select min-w-[140px]"
        value={filters.selectedProduct || ''}
        onChange={(e) => dispatch({ type: 'SET_PRODUCT', payload: e.target.value || null })}
      >
        <option value="">All Products</option>
        {filterOptions.products.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <div className="flex-1 min-w-[200px] flex justify-end">
        {(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery) && (
          <button
            onClick={() => dispatch({ type: 'RESET' })}
            className="text-xs text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
