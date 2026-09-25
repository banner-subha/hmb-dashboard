// Checks for src/utils/outstanding.js. Run: node scripts/test-outstanding.mjs
import * as o from '../src/utils/outstanding.js';
import { escapeCsvValue } from '../src/utils/csvExport.js';

let failed = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g === e) return console.log('ok  ', name);
  failed++;
  console.log('FAIL', name, '\n   got', g, '\n   exp', e);
};

eq('formatINR crore', o.formatINR(534882356.23), '₹53.49 Cr');
eq('formatINR lakh', o.formatINR(1618473), '₹16.18 L');
eq('formatINR negative crore', o.formatINR(-296472786.95), '-₹29.65 Cr');
eq('formatINR thousands', o.formatINR(4520), '₹4.5 K');
eq('formatINR small', o.formatINR(812), '₹812.00');
eq('formatINR missing', o.formatINR(null), 'n/a');
eq('formatINRFull grouping', o.formatINRFull(-1234567.5), '-₹12,34,567.50');
eq('formatDate', o.formatDate('2025-03-31'), '31 Mar 2025');
eq('formatDate empty', o.formatDate(null), null);

eq('state WB', o.normalizeState('WB'), 'West Bengal');
eq('state UTTARPRADESH', o.normalizeState('UTTARPRADESH'), 'Uttar Pradesh');
eq('state upper', o.normalizeState('JHARKHAND'), 'Jharkhand');
eq('state upper with and', o.normalizeState('ANDAMAN AND NICOBAR ISLAND'), 'Andaman and Nicobar Island');
eq('state already cased', o.normalizeState('West Bengal'), 'West Bengal');
eq('state unknown', o.normalizeState('UNKNOWN'), 'State not recorded');

eq('severity not due', o.getOverdueSeverity(0).key, 'current');
eq('severity 30', o.getOverdueSeverity(30).key, 'b0_30');
eq('severity 31', o.getOverdueSeverity(31).key, 'b31_60');
eq('severity 91', o.getOverdueSeverity(91).key, 'b90_plus');

const row = (over) => ({
  dealer_name: 'A', state: 'WB', district: null, party_codes: 'CUST1', party_names: 'A LTD',
  total_outstanding: 0, overdue_amount: 0, current_amount: 0,
  bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0,
  credit_total: 0, credit_current: 0, credit_0_30: 0, credit_31_60: 0, credit_61_90: 0, credit_90_plus: 0,
  voucher_count: 1, bill_count: 1, credit_count: 0, max_bill_overdue_days: null, oldest_bill_due_date: null,
  as_on_date: '2026-09-23', ...over,
});

// Paisa-exact totals: 0.1 + 0.2 must not drift.
const book = o.prepareBook([
  row({ dealer_name: 'Alpha', total_outstanding: 0.1, overdue_amount: 0.1, bucket_90_plus: 0.1, max_bill_overdue_days: 120, oldest_bill_due_date: '2025-01-01' }),
  row({ dealer_name: 'Beta', state: 'West Bengal', district: 'Nadia', total_outstanding: 0.2, current_amount: 0.2 }),
  row({ dealer_name: 'Gamma', state: 'BIHAR', total_outstanding: -500, overdue_amount: -500, bucket_90_plus: -500, credit_total: -900, credit_90_plus: -900, bill_count: 1, credit_count: 2, voucher_count: 3, max_bill_overdue_days: 400, oldest_bill_due_date: '2024-06-01' }),
]);
const s = o.summarizeBook(book);
eq('summary total exact', s.total, -499.7);
eq('summary credit', s.credit, -900);
eq('summary bills = net - credit', s.bills, 400.3);
eq('summary bills over 90', s.bills90, 400.1);
eq('summary bills over 90 accounts', s.bills90Accounts, 2);
eq('summary 90+ bucket split', [s.buckets[4].net, s.buckets[4].credit, s.buckets[4].bills], [-499.9, -900, 400.1]);
eq('summary bucket accounts', s.buckets.map((b) => b.accounts), [1, 0, 0, 0, 2]);
eq('summary counts', [s.dealerCount, s.voucherCount, s.creditCount], [3, 5, 2]);

eq('WB and West Bengal share a label', book.filter((r) => r.stateLabel === 'West Bengal').length, 2);
eq('geo options by balance', o.buildGeoOptions(book).map((x) => x.value), ['West Bengal', 'Bihar']);
eq('geo districts', o.buildGeoOptions(book)[0].districts, ['Nadia']);

const names = (rows) => rows.map((r) => r.dealer_name);
eq('filter state', names(o.filterBook(book, { state: 'Bihar' })), ['Gamma']);
eq('filter district', names(o.filterBook(book, { state: 'West Bengal', district: 'Nadia' })), ['Beta']);
eq('district spellings fold', o.prepareBook([row({ district: 'BALESWAR' }), row({ district: 'BALASORE' })]).map((r) => r.districtLabel), ['Baleshwar', 'Baleshwar']);
eq('filter overdue only', names(o.filterBook(book, { overdueOnly: true })), ['Alpha']);
eq('filter bucket counts bills, not net', names(o.filterBook(book, { bucket: 'b90_plus' })), ['Alpha', 'Gamma']);
eq('filter search party code', names(o.filterBook(book, { search: 'cust1' })).length, 3);
eq('filter search name', names(o.filterBook(book, { search: 'gam' })), ['Gamma']);
const ak = o.prepareBook([
  row({ dealer_name: 'A.K. HARDWARE', party_names: 'A.K. Hardware', party_codes: 'CUST00009' }),
  row({ dealer_name: 'AMBIKA HARDWARE' }),
  row({ dealer_name: 'ADDA SHAKTI HARDWARES' }),
  row({ dealer_name: 'MA KALI HARDWARE' }),
]);
for (const q of ['A.K. Hardware', 'AK Hardware', 'a k hardware', 'ak', 'AK', 'hardware a.k', '  A.K.  ', 'akhardware', 'a.k.hardware', '00009']) {
  eq(`search finds only A.K.: "${q}"`, names(o.filterBook(ak, { search: q })), ['A.K. HARDWARE']);
}
eq('search word start, not inside a word', names(o.filterBook(ak, { search: 'kali' })), ['MA KALI HARDWARE']);
eq('search one word matches all', names(o.filterBook(ak, { search: 'hardware' })).length, 4);

eq('sort total desc', names(o.sortBook(book, { id: 'total', desc: true })), ['Beta', 'Alpha', 'Gamma']);
eq('sort days desc, no bill last', names(o.sortBook(book, { id: 'days', desc: true })), ['Gamma', 'Alpha', 'Beta']);
eq('sort oldest asc, no date last', names(o.sortBook(book, { id: 'oldest', desc: false })), ['Gamma', 'Alpha', 'Beta']);
eq('sort does not mutate', names(book), ['Alpha', 'Beta', 'Gamma']);

eq('csv keeps negative numbers numeric', escapeCsvValue('-1234.50'), '-1234.50');
eq('csv still guards formulas', escapeCsvValue('-2+3'), "'-2+3");
eq('csv still guards =', escapeCsvValue('=SUM(A1)'), "'=SUM(A1)");

// Client view scoping:
eq('scope admin sees all', o.scopeBookForUser(book, { role: 'admin' }).length, 3);
eq('scope null user sees all', o.scopeBookForUser(book, null).length, 3);
eq('scope client bihar', names(o.scopeBookForUser(book, { role: 'client', states: ['Bihar'], districts: [] })), ['Gamma']);
eq('scope client wb nadia', names(o.scopeBookForUser(book, { role: 'client', states: ['WB'], districts: ['Nadia'] })), ['Beta']);
eq('scope client unscoped sees all', o.scopeBookForUser(book, { role: 'client', states: [], districts: [] }).length, 3);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
