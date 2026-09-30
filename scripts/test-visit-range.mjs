// Checks for src/utils/visitRange.js. Run: node scripts/test-visit-range.mjs
import * as r from '../src/utils/visitRange.js';

let failed = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g === e) return console.log('ok  ', name);
  failed++;
  console.log('FAIL', name, '\n   got', g, '\n   exp', e);
};

eq('daysBetween, one week', r.daysBetween('2026-09-21', '2026-09-27'), 7);
eq('daysBetween, same day', r.daysBetween('2026-09-27', '2026-09-27'), 1);
eq('addDays across a month', r.addDays('2026-09-01', -1), '2026-08-31');
eq('addDays across a year', r.addDays('2026-01-01', -1), '2025-12-31');

eq('last 7 days', r.presetRange('last7', '2026-09-27'), { from: '2026-09-21', to: '2026-09-27' });
eq('last 30 days', r.presetRange('last30', '2026-09-27'), { from: '2026-08-29', to: '2026-09-27' });
eq('last month', r.presetRange('prevMonth', '2026-09-27'), { from: '2026-08-01', to: '2026-08-31' });
eq('last month from January', r.presetRange('prevMonth', '2026-01-05'), { from: '2025-12-01', to: '2025-12-31' });
eq('this month is the page default, not a range', r.presetRange('month', '2026-09-27'), null);

eq('custom: fine', r.rangeProblem('2026-09-01', '2026-09-15', '2026-09-27'), null);
eq('custom: reversed', r.rangeProblem('2026-09-15', '2026-09-01', '2026-09-27'), 'The end date is before the start date.');
eq('custom: after latest upload', r.rangeProblem('2026-09-01', '2026-09-30', '2026-09-27'), 'Visits are only recorded up to the latest upload.');
eq('custom: 94 days is allowed now', r.rangeProblem('2026-06-26', '2026-09-27', '2026-09-27'), null);
eq('custom: all of 2026 is allowed', r.rangeProblem('2026-01-01', '2026-09-27', '2026-09-27', '2026-01-01'), null);
eq('custom: 401 days is not', r.rangeProblem('2025-08-23', '2026-09-27', '2026-09-27'), 'Pick 400 days or fewer.');
eq('custom: before records begin', r.rangeProblem('2025-12-31', '2026-01-10', '2026-09-27', '2026-01-01'), 'Visits are only recorded from 1 Jan 2026.');
eq('custom: earliest unknown yet', r.rangeProblem('2025-12-31', '2026-01-10', '2026-09-27', null), null);
eq('earliest day from the calendar', r.earliestVisitDay({ years: ['2026'], by_year: { '2026': [{ month: '2026-09' }, { month: '2026-01' }, { month: '2026-04' }] } }), '2026-01-01');
eq('earliest day, empty calendar', r.earliestVisitDay({ years: [], by_year: {} }), null);

const monthDistricts = [
  { state: 'West Bengal', district: 'Purba Bardhaman', curFabricatorVisits: 746, curUniqueFabricators: 376, salesActual: 812 },
  { state: 'Bihar', district: 'Patna', curFabricatorVisits: 40, curUniqueFabricators: 20 },
];
const rangeDistricts = [
  { state: 'WEST BENGAL', district: 'PURBA BARDHAMAN', fab_visits: 180, prev_fab_visits: 150, unique_fabricators: 120 },
  { state: 'ASSAM', district: 'KAMRUP METROPOLITAN', fab_visits: 5, prev_fab_visits: 0, unique_fabricators: 4 },
];
const d = r.mergeRangeDistricts(monthDistricts, rangeDistricts);
eq('district: range counts replace the month', [d[0].curFabricatorVisits, d[0].curUniqueFabricators, d[0].fabricatorGrowth], [180, 120, 30]);
eq('district: sales figures kept', d[0].salesActual, 812);
eq('district: monthly row kept for the status tag', d[0].monthly.curFabricatorVisits, 746);
eq('district: no range visits reads zero', [d[1].district, d[1].curFabricatorVisits], ['Patna', 0]);
eq('district: range-only district added, title-cased', [d[2].state, d[2].district, d[2].curFabricatorVisits], ['Assam', 'Kamrup Metropolitan', 5]);

const monthReps = [
  { employee_name: 'RATAN BHASHKAR', role: 'KRO', curVisits: 252, middayPct: 50 },
  { employee_name: 'IDLE REP', role: 'OTHER', curVisits: 3 },
];
const rangeReps = [
  { rep: 'RATAN BHASHKAR', visits: 70, prev_visits: 60, active_days: 7, customers: 40, dealer_visits: 5, fabricator_visits: 65, avg_duration: 19, midday_pct: 60, afternoon_pct: 40 },
  { rep: 'NEW REP', visits: 9, prev_visits: 0, active_days: 3, customers: 9, dealer_visits: 1, fabricator_visits: 8, avg_duration: 30, midday_pct: 0, afternoon_pct: 100 },
];
const reps = r.mergeRangeReps(monthReps, rangeReps, name => (name === 'NEW REP' ? 'KRM' : 'OTHER'));
eq('rep: range activity replaces the month', [reps[0].curVisits, reps[0].prevVisitsMtd, reps[0].dailyVisitRate, reps[0].middayPct], [70, 60, 10, 60]);
eq('rep: role kept', reps[0].role, 'KRO');
eq('rep: nothing in either period dropped', reps.map(x => x.employee_name), ['RATAN BHASHKAR', 'NEW REP']);
eq('rep: range-only rep gets a role', reps[1].role, 'KRM');

const s = r.rangeSummary(
  { visits: 2180, prev_visits: 2075, dealer_visits: 300, fabricator_visits: 1800, dealers_visited: 250, active_reps: 72, avg_dealer_duration: 49.84 },
  { totalDealersTracked: 1000, growthDriversCount: 9 }
);
eq('summary: range KPIs', [s.curTotalVisits, s.prevTotalVisits, s.activeFieldReps, s.avgVisitDurationMins], [2180, 2075, 72, 49.8]);
eq('summary: coverage against the tracked dealers', s.dealerCoveragePct, 25);
eq('summary: group counts carried through', s.growthDriversCount, 9);
eq('summary: no visits before the range means no trend', r.rangeSummary({ visits: 146000, prev_visits: 0 }, {}).prevTotalVisits, null);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
