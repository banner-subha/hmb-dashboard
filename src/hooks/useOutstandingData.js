import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { fetchDealerBook } from '../services/outstandingService';
import { useAuth } from '../context/AuthContext';
import {
  buildGeoOptions,
  filterBook,
  prepareBook,
  scopeBookForUser,
  sortBook,
  summarizeBook,
} from '../utils/outstanding';

const EMPTY_FILTERS = { search: '', state: '', district: '', overdueOnly: false, bucket: '' };

/**
 * Outstanding Receivables page state.
 *
 * One request (the dealer book), then everything else is derived in memory:
 * filters, sort, KPI totals and aging all read the same filtered rows, so the
 * headline figures and the table can never disagree.
 */
export function useOutstandingData() {
  const { user } = useAuth();
  const [rawBook, setRawBook] = useState(null);
  const [error, setError] = useState(null);
  // Retry bumps this, so a retry takes the same path as the first load.
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ id: 'total', desc: true });

  useEffect(() => {
    let live = true;
    fetchDealerBook({ force: attempt > 0 })
      .then((rows) => {
        if (!live) return;
        setRawBook(prepareBook(rows));
        setError(null);
      })
      .catch((err) => {
        if (live) setError(err.message || 'Could not load outstanding.');
      });
    return () => { live = false; };
  }, [attempt]);

  const reload = useCallback(() => {
    setError(null);
    setRawBook(null);
    setAttempt((n) => n + 1);
  }, []);

  const book = useMemo(() => (rawBook ? scopeBookForUser(rawBook, user) : null), [rawBook, user]);

  const setFilter = useCallback((name, value) => {
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      // A district belongs to one state; changing state clears it.
      if (name === 'state') next.district = '';
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  // Typing stays responsive; the table catches up a frame later.
  const deferredSearch = useDeferredValue(filters.search);

  const geoOptions = useMemo(() => buildGeoOptions(book || []), [book]);
  const districtOptions = useMemo(
    () => geoOptions.find((s) => s.value === filters.state)?.districts || [],
    [geoOptions, filters.state]
  );

  // The aging panel ignores its own bucket filter: it has to keep showing
  // every bucket so the reader can switch between them.
  const scopeRows = useMemo(
    () => filterBook(book || [], { ...filters, search: deferredSearch, bucket: '' }),
    [book, filters, deferredSearch]
  );
  const rows = useMemo(
    () => (filters.bucket ? filterBook(scopeRows, { bucket: filters.bucket }) : scopeRows),
    [scopeRows, filters.bucket]
  );
  const sortedRows = useMemo(() => sortBook(rows, sort), [rows, sort]);

  // KPIs and aging share this summary. The age-band pick only narrows the
  // table, so the headline figures never jump when a band is toggled.
  const summary = useMemo(() => summarizeBook(scopeRows), [scopeRows]);

  const activeFilterCount =
    (filters.search ? 1 : 0) + (filters.state ? 1 : 0) + (filters.district ? 1 : 0) +
    (filters.overdueOnly ? 1 : 0) + (filters.bucket ? 1 : 0);

  return {
    loading: !book && !error,
    error,
    reload,
    book: book || [],
    rows: sortedRows,
    summary,
    filters,
    setFilter,
    resetFilters,
    activeFilterCount,
    sort,
    setSort,
    stateOptions: geoOptions,
    districtOptions,
  };
}
