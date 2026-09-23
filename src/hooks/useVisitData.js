import { useState, useEffect, useMemo } from 'react';
import { getVisitData } from '../services/dataService';
import {
  matchesFilters,
  summariseState,
  attachDealerSales,
  classifyRep,
} from '../utils/visits';

/**
 * Loads the field visit payload and derives everything the views need.
 *
 * The page used to do all of this inline: one useEffect and five useMemos in a
 * 955-line component, which is why nothing here could be tested or reused. The
 * loading and the deriving are separate concerns from the rendering, so they
 * live here.
 */
export function useVisitData({
  state = 'ALL',
  quadrant = 'ALL',
  query = '',
  role = 'ALL',
  bpDealerIndex = null,
  repRoleIndex = null,
  elapsedDays = 0,
} = {}) {
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

  /**
   * Business Plan enrichment, applied before anything here filters or counts.
   *
   * It has to sit upstream of the filters, not beside them in the page. The
   * quadrant card filters on `quadrant`, and re-deriving that field after the
   * filtering had already run meant picking "Needs Attention" selected dealers
   * by the parser's historical classification while the table rendered the
   * Business Plan one — the card count and the rows beneath it describing two
   * different populations.
   */
  const enriched = useMemo(() => {
    if (!data) return data;
    return {
      ...data,
      dealers: attachDealerSales(data.dealers || [], bpDealerIndex, elapsedDays),
      // The role is not in the payload, so it is stamped on here — once, rather
      // than per render inside the table's filter.
      employees: (data.employees || []).map(r => ({
        ...r,
        role: classifyRep(r.employee_name, repRoleIndex),
      })),
    };
  }, [data, bpDealerIndex, repRoleIndex, elapsedDays]);

  const stateOptions = useMemo(() => {
    if (!enriched?.dealers) return ['ALL'];
    const set = new Set(
      enriched.dealers.map(d => d.state).filter(s => s && s.trim() !== '' && s.toUpperCase() !== 'UNKNOWN')
    );
    return ['ALL', ...Array.from(set).sort()];
  }, [enriched]);

  const dealers = useMemo(() => {
    if (!enriched?.dealers) return [];
    return enriched.dealers.filter(d =>
      matchesFilters(d, { state, quadrant, query },
                     ['dealer', 'district', 'primaryRep', 'assignedKrm', 'assignedKro', 'krmVisits', 'kroVisits'])
    );
  }, [enriched, state, quadrant, query]);

  const districts = useMemo(() => {
    if (!enriched?.districts) return [];
    // Quadrant is a dealer-level classification; applying it here would empty
    // the table whenever a quadrant card is selected.
    return enriched.districts.filter(d =>
      d.district &&
      d.district.trim() !== '' &&
      d.district.toUpperCase() !== 'UNKNOWN' &&
      matchesFilters(d, { state, query }, ['district', 'state'])
    );
  }, [enriched, state, query]);

  const reps = useMemo(() => {
    if (!enriched?.employees) return [];
    return enriched.employees.filter(r =>
      (role === 'ALL' || r.role === role) &&
      matchesFilters(r, { query }, ['employee_name'])
    );
  }, [enriched, query, role]);

  const summary = useMemo(() => summariseState(enriched, state), [enriched, state]);

  /**
   * How much of the page's own output rests on a sales link. Quoted in the UI
   * because paceStatus and every quadrant except NO_SALES_LINK are meaningless
   * without one, and on the current data only about a third of dealers have it.
   */
  const salesLink = useMemo(() => enriched?.meta?.salesLink ?? null, [enriched]);

  return {
    data: enriched, loading, error,
    dealers, districts, reps,
    summary, stateOptions, salesLink,
    counts: {
      dealers: enriched?.dealers?.length ?? 0,
      districts: enriched?.districts?.length ?? 0,
      employees: enriched?.employees?.length ?? 0,
    },
  };
}
