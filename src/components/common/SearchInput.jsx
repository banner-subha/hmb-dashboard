import { Search, X } from 'lucide-react';
import { useFilterState } from '../../context/DataContext';
import { useState, useEffect, useRef } from 'react';

/**
 * Search box, in either of two modes.
 *
 * Uncontrolled (default): debounces into the shared FilterContext, which is
 * what the pages wired into DataContext expect.
 *
 * Controlled: pass `onChange` (and `value`) to drive a caller's own state
 * instead. VisitIntelligence was already passing both, but they were not in
 * the signature, so they were silently dropped: typing there updated the
 * global filter for other pages while the page's own searchQuery never moved,
 * and the box did nothing visible.
 */
export default function SearchInput({
  placeholder = "Search dealers, districts...",
  className = "",
  value,
  onChange,
}) {
  const { filters, dispatch } = useFilterState();
  const controlled = typeof onChange === 'function';
  const externalValue = controlled ? (value || '') : (filters.searchQuery || '');
  const [localValue, setLocalValue] = useState(externalValue);
  const timerRef = useRef(null);

  // Keep local value in sync if filters are reset or updated externally
  useEffect(() => {
    setLocalValue(externalValue);
  }, [externalValue]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);

    if (controlled) {
      // The caller owns the state; debouncing here would only add lag to a
      // filter that runs over an in-memory array.
      onChange(val);
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      dispatch({ type: 'SET_SEARCH', payload: val });
    }, 300);
  };

  const handleClear = () => {
    setLocalValue('');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (controlled) {
      onChange('');
      return;
    }
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
