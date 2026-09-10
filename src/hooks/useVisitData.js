import { useState, useEffect, useMemo } from 'react';
import { getVisitData } from '../services/dataService';
import { matchesFilters, summariseState } from '../utils/visits';

/**
 * Loads the field visit payload and derives everything the views need.
 *
 * The page used to do all of this inline: one useEffect and five useMemos in a
 * 955-line component, which is why nothing here could be tested or reused. The
 * loading and the deriving are separate concerns from the rendering, so they
 * live here.
 */
export function useVisitData({ state = 'ALL', quadrant = 'ALL', query = '' } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await getVisitData();
        if (!mounted) return;
        if (res) setData(res);
        else setError('Unable to load field visit dataset.');
      } catch (err) {
        if (mounted) setError(err.message || 'Error loading field visit data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const stateOptions = useMemo(() => {
    if (!data?.dealers) return ['ALL'];
    const set = new Set(
      data.dealers.map(d => d.state).filter(s => s && s !== 'Unknown')
    );
    return ['ALL', ...Array.from(set).sort()];
  }, [data]);

  const dealers = useMemo(() => {
    if (!data?.dealers) return [];
    return data.dealers.filter(d =>
      matchesFilters(d, { state, quadrant, query },
                     ['dealer', 'district', 'primaryRep'])
    );
  }, [data, state, quadrant, query]);

  const districts = useMemo(() => {
    if (!data?.districts) return [];
    // Quadrant is a dealer-level classification; applying it here would empty
    // the table whenever a quadrant card is selected.
    return data.districts.filter(d =>
      matchesFilters(d, { state, query }, ['district', 'state'])
    );
  }, [data, state, query]);

  const reps = useMemo(() => {
    if (!data?.employees) return [];
    return data.employees.filter(r =>
      matchesFilters(r, { query }, ['employee_name'])
    );
  }, [data, query]);

  const summary = useMemo(() => summariseState(data, state), [data, state]);

  /**
   * How much of the page's own output rests on a sales link. Quoted in the UI
   * because paceStatus and every quadrant except NO_SALES_LINK are meaningless
   * without one, and on the current data only about a third of dealers have it.
   */
  const salesLink = useMemo(() => data?.meta?.salesLink ?? null, [data]);

  return {
    data, loading, error,
    dealers, districts, reps,
    summary, stateOptions, salesLink,
    counts: {
      dealers: data?.dealers?.length ?? 0,
      districts: data?.districts?.length ?? 0,
      employees: data?.employees?.length ?? 0,
    },
  };
}
