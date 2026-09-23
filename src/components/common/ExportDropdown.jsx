import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, Filter, Database } from 'lucide-react';

/**
 * Reusable CSV Export Dropdown Component
 *
 * Allows users to choose between exporting:
 * 1. Filtered Data (exact rows currently visible matching active filters/search)
 * 2. Raw / All Data (complete unfiltered dataset for the entity)
 */
export default function ExportDropdown({
  onExportFiltered,
  onExportRaw,
  filteredCount = 0,
  rawCount = 0,
  label = 'Export CSV',
  entityName = 'Records',
  className = '',
  disabled = false,
  showChevron = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close when clicking outside the dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleSelectFiltered = () => {
    setIsOpen(false);
    onExportFiltered?.();
  };

  const handleSelectRaw = () => {
    setIsOpen(false);
    onExportRaw?.();
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-text-secondary hover:text-text-primary text-[13px] font-bold transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        title="Export dataset to CSV (Excel compatible)"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Download className="w-3.5 h-3.5 text-accent-blue shrink-0" />
        <span>{label}</span>
        {showChevron && (
          <ChevronDown className={`w-3 h-3 transition-transform duration-200 text-text-muted ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && (
        <div 
          role="menu" 
          className="absolute right-0 mt-1.5 w-64 rounded-xl border border-border/70 bg-bg-secondary/95 backdrop-blur-md shadow-2xl py-1.5 z-50 animate-fade-in divide-y divide-border/30 text-left"
        >
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Download Options
            </span>
          </div>

          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleSelectFiltered}
              className="w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-bg-card transition-colors group cursor-pointer"
            >
              <Filter className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text-primary group-hover:text-emerald-300 transition-colors">
                    Filtered {entityName}
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 tabular-nums">
                    {filteredCount.toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-[10.5px] text-text-muted mt-0.5 leading-snug">
                  Active search and table filters
                </p>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={handleSelectRaw}
              className="w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-bg-card transition-colors group cursor-pointer"
            >
              <Database className="w-4 h-4 text-accent-blue mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text-primary group-hover:text-accent-blue transition-colors">
                    Raw / All {entityName}
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-500/20 text-accent-blue tabular-nums">
                    {rawCount.toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-[10.5px] text-text-muted mt-0.5 leading-snug">
                  Complete dataset without filters
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
