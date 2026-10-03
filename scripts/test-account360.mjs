// Checks for src/utils/account360.js: dealer matching across the five sources,
// each Signal rule, client scoping, and "not found is not zero".
// Run: node scripts/test-account360.mjs [dir with latest.json, book.json, bp.json, visits.json]
import { readFileSync } from 'node:fs';
import { buildAccount360, computeSignal, rollupSignal, signalRank, dealerRowKey, districtKey, stateKey } from '../src/utils/account360.js';
import { prepareBook } from '../src/utils/outstanding.js';

let failed = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g === e) return console.log('ok  ', name);
  failed++;
  console.log('FAIL', name, '\n   got', g, '\n   exp', e);
};

// ── Fixture: two West Bengal dealers, one Odisha dealer ─────────────────────
const latest = {
  meta: { dataAsOfDate: '2026-09-30', elapsedFraction: 0.5 },
  states: [{ state: 'West Bengal', cur: 60, prev: 50, pendingQty: 50 }, { state: 'Odisha', cur: 0, prev: 0, pendingQty: 0 }],
  districts: [
    { state: 'West Bengal', district: 'Purba Medinipur', cur: 40, prev: 30, pendingQty: 40 },
    { state: 'West Bengal', district: 'Nadia', cur: 20, prev: 20, pendingQty: 10 },
    { state: 'Odisha', district: 'Ganjam', cur: 0, prev: 0, pendingQty: 0 },
  ],
  dealers: [
    // Pending 40 MT, 30 of it over 30 days; plan and ledger spell the district differently.
    { state: 'West Bengal', district: 'Purba Medinipur', client: 'MAA TARA STEELS', cur: 40, prev: 30, pendingQty: 40,
      pendingAge: { d0_30: 10, d31_60: 30, d61_90: 0, d90plus: 0, unknown: 0 }, oldestPendingDate: '2026-08-01' },
    { state: 'West Bengal', district: 'Nadia', client: 'Kundu Traders', cur: 20, prev: 20, pendingQty: 10,
      pendingAge: { d0_30: 10, d31_60: 0, d61_90: 0, d90plus: 0, unknown: 0 } },
    { state: 'Odisha', district: 'Ganjam', client: 'Behara steel', cur: 0, prev: 0, pendingQty: 0 },
  ],
};
const ledger = prepareBook([
  // Kundu: 95 days late with orders waiting -> Collect first.
  { dealer_name: 'KUNDU TRADERS', state: 'WB', district: 'NADIA', total_outstanding: 500000, overdue_amount: 300000,
    current_amount: 200000, bucket_90_plus: 300000, credit_total: 0,
    max_bill_overdue_days: 95, as_on_date: '2026-09-23' },
  // No district on the ledger row: matched on state and name.
  { dealer_name: 'Maa Tara Steel', state: 'West Bengal', district: null, total_outstanding: 1000, overdue_amount: 0,
    max_bill_overdue_days: 0, as_on_date: '2026-09-23' },
]);
const plan = {
  meta: { latestMonth: '2026-08' },
  records: [
    { customer_name: 'MAA TARA STEEL', state: 'West Bengal', district: 'MEDINIPUR EAST', total_sp_target: 100, total_potential: 150, despatch: 80, plan_status: 'submitted' },
    { customer_name: 'KUNDU TRADERS', state: 'West Bengal', district: 'NADIA', total_sp_target: 40, total_potential: 60, despatch: 20, plan_status: 'pending' },
    { customer_name: 'BEHARA STEEL', state: 'Orissa', district: 'GANJAM', total_sp_target: 0, total_potential: 67, despatch: 0, plan_status: 'submitted' },
  ],
};
const visits = {
  meta: { curPeriod: 'MTD 2026-10', prevPeriod: 'MTD 2026-09' },
  dealers: [
    { dealer: 'Maa Tara Steels', state: 'West Bengal', district: 'Purba Medinipur', curVisits: 1, histAvgVisitsMtd: 1, prevVisits: 2, histAvgVisits: 6 },
    { dealer: 'Kundu Traders', state: 'West Bengal', district: 'Nadia', curVisits: 0, histAvgVisitsMtd: 0, prevVisits: 9, histAvgVisits: 4 },
  ],
  districts: [{ state: 'West Bengal', district: 'Nadia', curFabricatorVisits: 3, histAvgFabricatorVisitsMtd: 2, prevFabricatorVisits: 30, histAvgFabricatorVisits: 25 }],
};

const m = buildAccount360({ latest, ledger, plan, visits, despatchMonth: '2026-09' });
const maa = m.dealers.get(dealerRowKey(latest.dealers[0]));
const kundu = m.dealers.get(dealerRowKey(latest.dealers[1]));
const behara = m.dealers.get(dealerRowKey(latest.dealers[2]));

eq('plan matched across MEDINIPUR EAST / Purba Medinipur and STEEL / STEELS', maa.plan.target, 100);
eq('ledger row with no district matched on state and name', maa.outstanding.total, 1000);
eq('ledger state "WB" matched to West Bengal', kundu.outstanding.overdue, 300000);
eq('plan state "Orissa" matched to Odisha', behara.plan.potential, 67);
eq('visits roll back to the despatch month when the feed is a month ahead', [kundu.visits.cur, kundu.visits.usual], [9, 4]);
eq('meta says visits are the full previous month', [m.meta.visitsPeriod, m.meta.visitsFullMonth], ['2026-09', true]);
eq('pace is despatch over target for the days gone', kundu.pace, 20 / (40 * 0.5));
eq('no ledger row stays null, not zero', behara.outstanding, null);
eq('no visit row stays null, not zero', behara.visits, null);

eq('Collect first: overdue past 60 days with orders waiting', kundu.signal.key, 'COLLECT_FIRST');
eq('Orders stuck: 30 of 40 MT over 30 days, no late bills', maa.signal.key, 'ORDERS_STUCK');
eq('Untapped: potential with no target', behara.signal.key, 'UNTAPPED');

const base = { despatch: { cur: 10, prev: 10 }, pending: { qty: 0, over30: 0 } };
eq('Behind plan, few visits',
  computeSignal({ ...base, plan: { target: 100, potential: 100 }, visits: { cur: 1, usual: 5 }, pace: 0.4 })?.key, 'VISIT_GAP');
eq('Visits not converting',
  computeSignal({ ...base, plan: { target: 100, potential: 100 }, visits: { cur: 6, usual: 5 }, pace: 0.4 })?.key, 'NOT_CONVERTING');
eq('On track',
  computeSignal({ ...base, plan: { target: 100, potential: 150 }, visits: { cur: 6, usual: 5 }, pace: 1.1 })?.key, 'ON_TRACK');
eq('Untapped beats on track when potential is 3x target',
  computeSignal({ ...base, plan: { target: 10, potential: 40 }, visits: null, pace: 1.0 })?.key, 'UNTAPPED');
eq('Despatch alone gives no signal', computeSignal({ ...base, outstanding: null, plan: null, visits: null, pace: null }), null);
eq('Late bills without waiting orders are not Collect first',
  computeSignal({ ...base, outstanding: { overdue: 5, maxOverdueDays: 90 }, plan: null, visits: null, pace: null }), null);

// Rollups
const nadia = m.districts.get(districtKey('West Bengal', 'Nadia'));
const wb = m.states.get(stateKey('West Bengal'));
eq('district rollup sums the ledger by place', nadia.outstanding.overdue, 300000);
eq('rollup overdue nets unadjusted credits, as the Outstanding tab does',
  buildAccount360({ latest, despatchMonth: '2026-09', plan, visits, ledger: prepareBook([{ ...ledger[0], credit_total: -50000 }]) })
    .districts.get(districtKey('West Bengal', 'Nadia')).outstanding.overdue, 250000);
eq('district rollup adds fabricator visits', nadia.visits.fabricatorCur, 30);
eq('state rollup counts dealers by signal', wb.signalCounts, { ORDERS_STUCK: 1, COLLECT_FIRST: 1 });
eq('state rollup shows its most urgent signal with a count', [wb.signal.key, wb.signal.count], ['COLLECT_FIRST', 1]);
eq('state rollup lists dealers to act on, most urgent first', wb.topDealers.map(d => d.name), ['Kundu Traders', 'MAA TARA STEELS']);
eq('rollupSignal shows the filtered signal', rollupSignal(wb, 'ORDERS_STUCK').key, 'ORDERS_STUCK');
eq('rollupSignal is null when the filtered signal is absent', rollupSignal(wb, 'UNTAPPED'), null);
eq('signalRank puts Collect first above On track',
  signalRank({ key: 'COLLECT_FIRST', count: 1 }) > signalRank({ key: 'ON_TRACK', count: 50 }), true);

// Still loading: undefined, never null or zero.
const loading = buildAccount360({ latest, ledger: undefined, plan, visits, despatchMonth: '2026-09' });
eq('a source still loading is undefined on the dealer', loading.dealers.get(dealerRowKey(latest.dealers[1])).outstanding, undefined);
eq('and on the rollup', loading.states.get(stateKey('West Bengal')).outstanding, undefined);
eq('match rate waits for the source', loading.meta.matchRate.outstanding, null);

// Client scope: Nadia only.
const scoped = buildAccount360({
  latest, ledger, plan, visits, despatchMonth: '2026-09',
  allow: (s, d) => districtKey(s, d) === districtKey('West Bengal', 'Nadia'),
});
eq('client scope drops other districts from the state ledger total', scoped.states.get(stateKey('West Bengal')).outstanding.total, 500000);
eq('client scope drops other districts from the state plan total', scoped.states.get(stateKey('West Bengal')).plan.target, 40);

// ── Live files ──────────────────────────────────────────────────────────────
const dir = process.argv[2];
if (dir) {
  const read = f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const L = read('latest.json');
  const live = buildAccount360({
    latest: L, ledger: prepareBook(read('book.json')), plan: read('bp.json'), visits: read('visits.json'),
    despatchMonth: L.availableMonths?.[0]?.key,
  });
  const rates = live.meta.matchRate;
  eq('live: plan matched for 90%+ of active dealers', rates.plan >= 90, true);
  eq('live: visits matched for 90%+ of active dealers', rates.visits >= 90, true);
  eq('live: ledger matched for 70%+ of active dealers', rates.outstanding >= 70, true);
  const sum = (rows, f) => rows.reduce((a, r) => a + (f(r) || 0), 0);
  const ledgerStates = sum([...live.states.values()], r => r.outstanding?.total);
  console.log(`   ${live.meta.activeDealers} active dealers, match ${JSON.stringify(rates)}, ledger in despatch states Rs ${ledgerStates.toFixed(0)}`);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
