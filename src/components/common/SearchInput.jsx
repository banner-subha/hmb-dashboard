import { Search } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useState, useEffect, useRef } from 'react';

export default function SearchInput({ placeholder = "Search dealers, districts..." }) {
  const { filters, dispatch } = useData();
  const [localValue, setLocalValue] = useState(filters.searchQuery || '');
  const timerRef = useRef(null);

  // Keep local value in sync if filters are reset or updated externally
  useEffect(() => {
    setLocalValue(filters.searchQuery || '');
  }, [filters.searchQuery]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      dispatch({ type: 'SET_SEARCH', payload: val });
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="relative flex-1 max-w-md">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-text-muted" />
      </div>
      <input
        type="text"
        className="search-input bg-bg-card"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
      />
    </div>
  );
}
