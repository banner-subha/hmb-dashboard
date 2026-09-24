// Checks for src/utils/visitWeeks.js. Run: node scripts/test-visit-weeks.mjs
import * as w from '../src/utils/visitWeeks.js';

let failed = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g === e) return console.log('ok  ', name);
  failed++;
  console.log('FAIL', name, '\n   got', g, '\n   exp', e);
};
const spans = ym => w.monthWeeks(ym).map(x => `${x.from.slice(8)}-${x.to.slice(8)}`);

eq('Sep 2026 blocks', spans('2026-09'), ['01-07', '08-14', '15-21', '22-28', '29-30']);
eq('Aug 2026 blocks (31 days)', spans('2026-08'), ['01-07', '08-14', '15-21', '22-28', '29-31']);
eq('Feb 2027 blocks (28 days, no Wk 5)', spans('2027-02'), ['01-07', '08-14', '15-21', '22-28']);
eq('Feb 2028 blocks (leap day)', spans('2028-02'), ['01-07', '08-14', '15-21', '22-28', '29-29']);

eq('monthWeekOf 7th is Wk 1', w.monthWeekOf('2026-09-07').idx, 1);
eq('monthWeekOf 8th is Wk 2', w.monthWeekOf('2026-09-08').idx, 2);
eq('monthWeekOf 22nd', w.monthWeekOf('2026-09-22'), { ym: '2026-09', idx: 4, from: '2026-09-22', to: '2026-09-28' });
eq('monthWeekOf 31st is Wk 5', w.monthWeekOf('2026-08-31').idx, 5);
eq('nthMonthWeek past the end', w.nthMonthWeek('2027-02', 5).idx, 4);
eq('prevMonthWeek inside a month', w.prevMonthWeek(w.monthWeekOf('2026-09-22')).from, '2026-09-15');
eq('prevMonthWeek from Wk 1', w.prevMonthWeek(w.monthWeekOf('2026-09-03')), { ym: '2026-08', idx: 5, from: '2026-08-29', to: '2026-08-31' });
eq('prevMonthWeek from Wk 1 of January', w.prevMonthWeek(w.monthWeekOf('2026-01-05')).from, '2025-12-29');

eq('completeThrough, latest = yesterday', w.completeThrough('2026-09-23', '2026-09-24'), '2026-09-22');
eq('completeThrough, latest = today', w.completeThrough('2026-09-24', '2026-09-24'), '2026-09-23');
eq('completeThrough, stale feed', w.completeThrough('2026-09-20', '2026-09-24'), '2026-09-20');

eq('likeForLike, running week',
  w.likeForLike({ from: '2026-09-22', to: '2026-09-28' }, { from: '2026-09-15', to: '2026-09-21' }, '2026-09-24'),
  { a: { from: '2026-09-22', to: '2026-09-24' }, b: { from: '2026-09-15', to: '2026-09-17' }, matched: true });
eq('likeForLike, past weeks untouched',
  w.likeForLike({ from: '2026-09-15', to: '2026-09-21' }, { from: '2026-09-08', to: '2026-09-14' }, '2026-09-24').matched,
  false);
eq('likeForLike, running week on the B side',
  w.likeForLike({ from: '2026-09-15', to: '2026-09-21' }, { from: '2026-09-22', to: '2026-09-28' }, '2026-09-24'),
  { a: { from: '2026-09-15', to: '2026-09-17' }, b: { from: '2026-09-22', to: '2026-09-24' }, matched: true });

eq('formatRange, one month', w.formatRange({ from: '2026-09-22', to: '2026-09-28' }), '22–28 Sep 2026');
eq('formatRange, two months', w.formatRange({ from: '2026-08-29', to: '2026-09-04' }), '29 Aug – 4 Sep 2026');
eq('formatRange, two years', w.formatRange({ from: '2025-12-29', to: '2026-01-04' }), '29 Dec 2025 – 4 Jan 2026');
eq('formatRange, one day', w.formatRange({ from: '2026-08-31', to: '2026-08-31' }), '31 Aug 2026');
eq('formatRange, no year', w.formatRange({ from: '2026-08-01', to: '2026-08-07' }, { year: false }), '1–7 Aug');

const p = w.weekPresets('2026-09-22');
eq('preset: this week vs last week', [p[0].a, p[0].b],
  [{ from: '2026-09-22', to: '2026-09-28' }, { from: '2026-09-15', to: '2026-09-21' }]);
eq('preset: same week last month', p[1].b, { from: '2026-08-22', to: '2026-08-28' });
eq('preset: same week last year', p[2].b, { from: '2025-09-22', to: '2025-09-28' });
eq('preset: last week vs week before', [p[3].a, p[3].b],
  [{ from: '2026-09-15', to: '2026-09-21' }, { from: '2026-09-08', to: '2026-09-14' }]);

const pj = w.weekPresets('2026-01-02');
eq('January: same week last month', pj[1].b, { from: '2025-12-01', to: '2025-12-07' });
eq('January: last week is December Wk 5', pj[0].b, { from: '2025-12-29', to: '2025-12-31' });

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
