import { useEffect, useMemo, useState } from 'react';
import { fetchVisitsRange } from '../services/visitService';
import { matchesFilters, classifyRep } from '../utils/visits';
import { mergeRangeDistricts, mergeRangeReps, rangeSummary } from '../utils/visitRange';
import { getExpandedStatesSet } from '../utils/constants';
import { getNormalizedDistrictSet, matchesAssignedDistrict } from '../utils/districtNormalizer';

/**
 * The visit views for a picked date range, folded into the rows the page
 * already renders from the month payload.
 *
 * `range` null means the page's own month view: nothing is fetched and
 * `active` stays false. The same filters as useVisitData apply, so the tabs
 * behave alike in both modes. The state filter also goes to the server, which
 * is what lets the KPIs and the sales team follow it in a range.
 */
export function useVisitRange({ range, state = 'ALL', district = 'ALL', query = '', role = 'ALL', data, summary, repRoleIndex, user = null }) {
  const key = range ? `${range.from}|${range.to}|${state}` : null;
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    fetchVisitsRange({ from: range.from, to: range.to, state })
      .then(res => { if (live) setResult({ key, data: res, error: null }); })
      .catch(err => { if (live) setResult({ key, data: null, error: err.message || 'Could not load visits for these dates' }); });
    return () => { live = false; };
  }, [key, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = result.key === key ? result.data : null;
  const error = result.key === key ? result.error : null;

  const allDistricts = useMemo(() => {
    if (!res) return null;
    const merged = mergeRangeDistricts(data?.districts || [], res.districts || [])
      .filter(d => d.district && d.district.trim() !== '' && d.district.toUpperCase() !== 'UNKNOWN');
    if (!user || user.role !== 'client') return merged;

    const rawUserStates = Array.isArray(user.states) ? user.states : (typeof user.states === 'string' ? user.states.split(',') : []);
    const allowedStatesSet = getExpandedStatesSet(rawUserStates);
    const assignedSet = getNormalizedDistrictSet(user.districts || []);

    const statesWithDistrictLocks = new Set();
    if (assignedSet.size > 0) {
      merged.forEach(d => {
        if (d.state && d.district && matchesAssignedDistrict(d.district, assignedSet)) {
          statesWithDistrictLocks.add((d.state || '').replace(/\s+/g, '').toUpperCase());
        }
      });
    }

    return merged.filter(d => {
      const normState = (d.state || '').replace(/\s+/g, '').toUpperCase();
      if (allowedStatesSet.size > 0 && !allowedStatesSet.has(normState)) return false;
      if (statesWithDistrictLocks.has(normState)) {
        return matchesAssignedDistrict(d.district, assignedSet);
      }
      return true;
    });
  }, [res, data, user]);
  const districts = useMemo(
    () => (allDistricts ? allDistricts.filter(d => matchesFilters(d, { state, district, query }, ['district', 'state'])) : null),
    [allDistricts, state, district, query]
  );

  const allReps = useMemo(
    () => (res ? mergeRangeReps(data?.employees || [], res.reps || [], name => classifyRep(name, repRoleIndex)) : null),
    [res, data, repRoleIndex]
  );
  const reps = useMemo(
    () => (allReps
      ? allReps.filter(r => (role === 'ALL' || r.role === role) && matchesFilters(r, { query }, ['employee_name']))
      : null),
    [allReps, role, query]
  );

  const rangeKpis = useMemo(() => (res ? rangeSummary(res.kpi, summary) : null), [res, summary]);

  return {
    active: Boolean(range),
    ready: Boolean(res),
    loading: Boolean(range) && !res && !error,
    error,
    retry: () => setRetry(n => n + 1),
    period: res ? { from: res.from, to: res.to, days: res.days } : null,
    summary: rangeKpis,
    districts,
    reps,
    counts: res ? { districts: allDistricts.length, employees: allReps.length } : null,
  };
}
