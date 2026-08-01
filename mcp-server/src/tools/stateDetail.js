import { getData } from '../dataLoader.js';
import { filterByState, summarizeState } from '../analysis.js';

export function getStateDetail({ state } = {}, data) {
  const d = data || getData();
  if (!state) return { error: 'state parameter is required', state: null };

  const found = filterByState(d.states || [], state)[0];
  if (!found) return { error: `No data found for state "${state}"`, state: null };

  const scored = (d.intel?.scoredStates || []).find(s => s.state === found.state);

  return {
    state: summarizeState(found),
    risk: scored
      ? {
          riskScore: scored.riskScore ?? 0,
          impactTier: scored.impactTier ?? null,
          trendDirection: scored.trendDirection ?? null,
          trendLabel: scored.trendLabel ?? null,
          displayColor: scored.displayColor ?? null
        }
      : null,
    order: {
      orderCur: found.orderCur ?? 0,
      orderPrev: found.orderPrev ?? 0,
      orderMoM: found.orderMoM ?? 0,
      avgPeriod: found.avgPeriod ?? d.avgPeriod ?? null
    }
  };
}
