import { Search, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useState, useEffect, useRef } from 'react';

export default function SearchInput({ placeholder = "Search dealers, districts...", className = "" }) {
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
    }, 200);
  };

  const handleClear = () => {
    setLocalValue('');
    if (timerRef.current) clearTimeout(timerRef.current);
    dispatch({ type: 'SET_SEARCH', payload: '' });
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative w-full ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="h-3.5 w-3.5 text-text-muted/80" />
      </div>
      <input
        type="text"
        className="w-full bg-bg-input border border-border/70 hover:border-accent-blue/50 focus:border-accent-blue focus:bg-bg-card-hover focus:ring-2 focus:ring-accent-blue/20 rounded-full pl-8 pr-7 py-1.5 text-xs text-text-primary placeholder-text-muted/70 focus:outline-none transition-all duration-200"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
