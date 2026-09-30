// Checks for src/utils/pendingOrders.js against the live dashboard file.
// Run: node scripts/test-pending-orders.mjs [path/to/latest.json]
import { readFileSync } from 'node:fs';
import * as p from '../src/utils/pendingOrders.js';

let failed = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g === e) return console.log('ok  ', name);
  failed++;
  console.log('FAIL', name, '\n   got', g, '\n   exp', e);
};
const near = (name, got, exp, tol = 0.05) => eq(name, Math.abs(got - exp) <= tol, true) || (Math.abs(got - exp) > tol && console.log('   ', got, 'vs', exp));

eq('daysSince', p.daysSince('2026-07-03', '2026-09-28'), 87);
eq('daysSince, same day', p.daysSince('2026-09-28', '2026-09-28'), 0);
eq('daysSince, no date', p.daysSince(null, '2026-09-28'), null);

// Product filter: ageing scales to the product's quantity.
const dl = { pendingQty: 20, pendingAge: { d0_30: 30, d31_60: 10, d61_90: 0, d90plus: 0, unknown: 0 }, dailyAvgQty: 4, ytd: 100,
  products: [{ product: 'IG', ytd: 25, pendingQty: 20 }] };
eq('agingOf scales to product pending', p.agingOf(dl), { d0_30: 15, d31_60: 5, d61_90: 0, d90plus: 0, unknown: 0 });
eq('paceOf, whole dealer', p.paceOf(dl, null), 4);
eq('paceOf, one product by its YTD share', p.paceOf(dl, 'IG'), 1);

const file = process.argv[2];
if (file) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const asOf = d.meta?.dataAsOfDate;
  const s = p.summarisePending({ dealers: d.dealers, products: d.products, asOf });
  near('total matches pendingTotal', s.total, d.pendingTotal);
  for (const k of ['d0_30', 'd31_60', 'd61_90', 'd90plus']) near(`ageing ${k} matches pendingAgeTotal`, s.aging[k], d.pendingAgeTotal[k]);
  eq('oldest matches oldestPendingDate', s.oldest, d.oldestPendingDate);
  near('pace matches dailyAvgQty', s.pace, d.dailyAvgQty, 1);
  near('order months add up', s.byMonth.reduce((a, r) => a + r.qty, 0), d.pendingTotal);
  near('products add up', s.products.reduce((a, r) => a + r.pending, 0), d.pendingTotal, 0.1);
  const wb = d.dealers.filter(x => x.state === 'West Bengal');
  const sw = p.summarisePending({ dealers: wb, products: d.products, asOf });
  near('one state: products add up to its pending', sw.products.reduce((a, r) => a + r.pending, 0), sw.total, 0.1);
  eq('one state: no product it has nothing pending for', sw.products.every(r => r.pending > 0), true);
  for (const level of ['state', 'district', 'dealer']) {
    const rows = p.buildPendingRows({ level, states: d.states, districts: d.districts, dealers: d.dealers, asOf });
    near(`${level} rows add up`, rows.reduce((a, r) => a + r.pending, 0), d.pendingTotal);
    if (level !== 'dealer') eq(`${level} rows count every waiting dealer`, rows.reduce((a, r) => a + r.dealersWaiting, 0), s.dealerCount);
  }
  console.log(`   ${s.total} MT, ${s.dealerCount} dealers, ${s.daysToClear.toFixed(1)} days to clear, ${s.noDespatchCount} with no despatch this month`);
}

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
