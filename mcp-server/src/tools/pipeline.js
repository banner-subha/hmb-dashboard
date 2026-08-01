import { getData } from '../dataLoader.js';
import { filterByState } from '../analysis.js';

export function getOrderPipeline({ state } = {}, data) {
  const d = data || getData();
  const intel = d.intel || {};

  let states = d.states || [];
  if (state) states = filterByState(states, state);

  const tot = (key) => states.reduce((sum, s) => sum + (s[key] ?? 0), 0);

  const stateBreakdown = states
    .filter(s => (s.orderCur ?? 0) > 0 || (s.orderPrev ?? 0) > 0 || (s.pendingQty ?? 0) > 0)
    .map(s => ({
      state: s.state,
      cur: s.cur ?? 0,
      prev: s.prev ?? 0,
      mom: s.mom ?? 0,
      orderCur: s.orderCur ?? 0,
      orderPrev: s.orderPrev ?? 0,
      orderMoM: s.orderMoM ?? 0,
      pendingQty: s.pendingQty ?? 0,
      avgPeriod: s.avgPeriod ?? null
    }))
    .sort((a, b) => b.orderCur - a.orderCur);

  const orderCur = tot('orderCur');
  const orderPrev = tot('orderPrev');
  const orderMoM = orderPrev > 0 ? Math.round(((orderCur - orderPrev) / orderPrev) * 100) : 0;

  return {
    orderCurTotal: orderCur,
    orderPrevTotal: orderPrev,
    orderMoMTotal: orderMoM,
    pendingTotal: d.pendingTotal ?? tot('pendingQty'),
    pendingPrevTotal: d.pendingPrevTotal ?? orderPrev,
    avgPeriod: d.avgPeriod ?? d.meta?.avgPeriod ?? null,
    dispatchOrderGapPct: intel.dispatchOrderGapPct ?? 0,
    hasDispatchBottleneck: intel.hasDispatchBottleneck ?? false,
    stateCount: stateBreakdown.length,
    states: stateBreakdown
  };
}
