import { Search } from 'lucide-react';
import { useData } from '../../context/DataContext';

export default function SearchInput({ placeholder = "Search dealers, districts..." }) {
  const { filters, dispatch } = useData();

  return (
    <div className="relative flex-1 max-w-md">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-text-muted" />
      </div>
      <input
        type="text"
        className="search-input bg-bg-card"
        placeholder={placeholder}
        value={filters.searchQuery || ''}
        onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
      />
    </div>
  );
}
