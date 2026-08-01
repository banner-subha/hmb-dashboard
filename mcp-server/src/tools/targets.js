import { getData } from '../dataLoader.js';
import { filterByState } from '../analysis.js';

export function getTargetAttainment({ state } = {}, data) {
  const d = data || getData();

  let states = d.states || [];
  if (state) states = filterByState(states, state);

  const targetTotal = d.targetTotal ?? 0;
  const totalCur = d.totalCur ?? 0;
  const expectedMtd = d.expectedMtd ?? 0;
  const attainmentPct = targetTotal > 0 ? Math.round((totalCur / targetTotal) * 100) : 0;
  const onTrack = expectedMtd > 0 ? totalCur >= expectedMtd : attainmentPct >= 100;

  const statesAttainment = states
    .map(s => {
      const target = s.targetTotal ?? null;
      const expected = s.expectedMtd ?? 0;
      const cur = s.cur ?? 0;
      const pct = target != null && target > 0 ? Math.round((cur / target) * 100) : null;
      return {
        state: s.state,
        cur,
        expectedMtd: expected,
        targetTotal: target,
        attainmentPct: pct,
        onTrack: expected > 0 ? cur >= expected : (pct != null && pct >= 100),
        currentDailyRate: s.currentDailyRate ?? 0,
        dailyAvgQty: s.dailyAvgQty ?? 0,
        lossFlag: s.lossFlag ?? 'NO_DATA'
      };
    })
    .sort((a, b) => (b.attainmentPct ?? -1) - (a.attainmentPct ?? -1));

  return {
    targetTotal,
    totalCur,
    totalMoM: d.totalMoM ?? 0,
    expectedMtd,
    attainmentPct,
    onTrack,
    currentDailyRate: d.currentDailyRate ?? 0,
    dailyAvgQty: d.dailyAvgQty ?? 0,
    stateCount: statesAttainment.length,
    states: statesAttainment
  };
}
