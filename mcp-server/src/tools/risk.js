import { getData } from '../dataLoader.js';
import { sortByKey } from '../analysis.js';

const TIER_NORM = (t) => String(t || '').replace(/[\s_]/g, '').toUpperCase();

export function getRiskIntelligence({ entityType, minRiskScore, maxResults = 50, impactTier } = {}, data) {
  const d = data || getData();
  const intel = d.intel || {};

  const filterTier = (list) => {
    if (!impactTier) return list;
    const t = TIER_NORM(impactTier);
    return list.filter(x => TIER_NORM(x.impactTier) === t);
  };
  const filterScore = (list) => {
    if (minRiskScore === undefined) return list;
    return list.filter(x => (x.riskScore ?? 0) >= minRiskScore);
  };
  const cap = (list) => sortByKey(filterTier(filterScore(list)), 'riskScore', true).slice(0, maxResults);

  const entity = String(entityType || '').toLowerCase();
  const want = (e) => !entity || entity === e;

  const result = {
    concentrationRisk: intel.concentrationRisk ?? null,
    top3DealerShare: intel.top3DealerShare ?? 0,
    top3DealerNames: intel.top3DealerNames || [],
    inactiveDealerCount: intel.inactiveDealerCount ?? 0,
    hasDispatchBottleneck: intel.hasDispatchBottleneck ?? false,
    dispatchOrderGapPct: intel.dispatchOrderGapPct ?? 0,
    totalDrop: intel.totalDrop ?? 0
  };

  if (want('state')) {
    const states = cap(intel.scoredStates || []);
    result.states = {
      count: states.length,
      states: states.map(s => ({
        state: s.state,
        cur: s.cur ?? 0,
        prev: s.prev ?? 0,
        mom: s.mom ?? 0,
        share: s.share ?? 0,
        drop: s.drop ?? 0,
        riskScore: s.riskScore ?? 0,
        impactTier: s.impactTier ?? null,
        trendDirection: s.trendDirection ?? null,
        trendLabel: s.trendLabel ?? null,
        displayColor: s.displayColor ?? null
      }))
    };
  }

  if (want('district')) {
    const districts = cap(intel.scoredDistricts || []);
    result.districts = {
      count: districts.length,
      districts: districts.map(x => ({
        state: x.state,
        district: x.district,
        cur: x.cur ?? 0,
        prev: x.prev ?? 0,
        mom: x.mom ?? 0,
        drop: x.drop ?? 0,
        riskScore: x.riskScore ?? 0,
        impactTier: x.impactTier ?? null,
        trendDirection: x.trendDirection ?? null,
        trendLabel: x.trendLabel ?? null,
        displayColor: x.displayColor ?? null
      }))
    };
  }

  if (want('dealer')) {
    const dealers = cap(intel.scoredDealers || []);
    result.dealers = {
      count: dealers.length,
      dealers: dealers.map(x => ({
        client: x.client,
        state: x.state,
        district: x.district,
        cur: x.cur ?? 0,
        prev: x.prev ?? 0,
        mom: x.mom ?? 0,
        riskScore: x.riskScore ?? 0,
        impactTier: x.impactTier ?? null,
        trendDirection: x.trendDirection ?? null,
        trendLabel: x.trendLabel ?? null,
        isInactive: !!x.isInactive,
        displayColor: x.displayColor ?? null
      }))
    };
  }

  return result;
}
