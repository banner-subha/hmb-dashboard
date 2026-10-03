import { useEffect, useMemo, useState } from 'react';
import { useRawData, useDataState } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { fetchDealerBook } from '../services/outstandingService';
import { getBusinessPlanDataset, getBusinessPlanDatasetSync } from '../services/businessPlanService';
import { getVisitData } from '../services/dataService';
import { prepareBook } from '../utils/outstanding';
import { scopeVisitDataForUser } from '../utils/visits';
import { getCurMonthKey } from '../utils/despatch';
import { buildAccount360, districtKey } from '../utils/account360';

const loadLedger = () => fetchDealerBook().then(prepareBook);

/**
 * One source: undefined while loading or after a failure (so the model treats
 * it as unknown, never as zero), with the status alongside for the panel.
 */
function useSource(load, initial) {
  const [state, setState] = useState(() =>
    initial ? { data: initial, status: 'ready' } : { data: undefined, status: 'loading' });
  useEffect(() => {
    if (initial) return undefined;
    let live = true;
    load()
      .then(data => { if (live) setState(data ? { data, status: 'ready' } : { data: undefined, status: 'error' }); })
      .catch(() => { if (live) setState({ data: undefined, status: 'error' }); });
    return () => { live = false; };
  }, [load, initial]);
  return state;
}

/**
 * Account 360 for the State, District and Dealer tabs: despatch and pending
 * from DataContext, outstanding, the business plan and visits from their own
 * cached loaders. Each source arrives on its own; nothing waits for the
 * slowest one.
 *
 * Built from the login-scoped, unfiltered rows (overallData) so the Signal for
 * a dealer does not change when a filter is touched. A client login also has
 * the ledger and plan cut to its own districts, which the Outstanding tab
 * itself does not do.
 */
export function useAccount360() {
  const { rawData } = useRawData();
  const { overallData } = useDataState();
  const { user } = useAuth();

  const ledger = useSource(loadLedger);
  const plan = useSource(getBusinessPlanDataset, getBusinessPlanDatasetSync());
  const visitsRaw = useSource(getVisitData);

  const visits = useMemo(
    () => (visitsRaw.data ? scopeVisitDataForUser(visitsRaw.data, user) : undefined),
    [visitsRaw.data, user],
  );

  const allow = useMemo(() => {
    if (user?.role !== 'client' || !overallData) return null;
    const keys = new Set(
      [...(overallData.districts || []), ...(overallData.dealers || [])].map(r => districtKey(r.state, r.district)),
    );
    return (state, district) => keys.has(districtKey(state, district));
  }, [user, overallData]);

  const model = useMemo(() => {
    if (!overallData || !rawData) return null;
    return buildAccount360({
      latest: { ...overallData, meta: rawData.meta },
      ledger: ledger.data,
      plan: plan.data,
      visits,
      despatchMonth: getCurMonthKey(rawData),
      allow,
    });
  }, [overallData, rawData, ledger.data, plan.data, visits, allow]);

  const status = { outstanding: ledger.status, plan: plan.status, visits: visitsRaw.status };
  const ready = Object.values(status).every(s => s !== 'loading');

  return { model, status, ready };
}
