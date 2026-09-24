// Week arithmetic for the field visit Comparison tab.
//
// A week is a fixed block of the month's dates, whatever the weekdays:
// Wk 1 = 1–7, Wk 2 = 8–14, Wk 3 = 15–21, Wk 4 = 22–28, Wk 5 = 29 to month end.
// Week N of one month therefore lines up date for date with week N of any
// other, and a month's weeks add up to the month.
//
// Every date is a 'YYYY-MM-DD' string and all arithmetic runs in UTC, so a
// browser's time zone can never shift a day. A range is { from, to }, both
// inclusive.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86400000;

const toDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toISO = date => date.toISOString().slice(0, 10);

/** Today on the viewer's own calendar, not UTC's (IST runs 5.5 hours ahead). */
export const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (iso, n) => toISO(new Date(toDate(iso).getTime() + n * DAY_MS));
export const daysBetween = (from, to) => Math.round((toDate(to) - toDate(from)) / DAY_MS);
export const rangeDays = r => daysBetween(r.from, r.to) + 1;

const monthEndDay = ym => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

const shiftMonth = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  return toISO(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
};

const dd = n => String(n).padStart(2, '0');

/** The month's date blocks: [{ idx, from, to }], Wk 5 running to month end. */
export function monthWeeks(ym) {
  const last = monthEndDay(ym);
  return [1, 8, 15, 22, 29]
    .filter(start => start <= last)
    .map((start, i) => ({
      idx: i + 1,
      from: `${ym}-${dd(start)}`,
      to: `${ym}-${dd(i === 4 ? last : Math.min(start + 6, last))}`,
    }));
}

/** Which block a day falls in: { ym, idx, from, to }. */
export function monthWeekOf(iso) {
  const ym = iso.slice(0, 7);
  const idx = Math.min(Math.ceil(Number(iso.slice(8, 10)) / 7), 5);
  return { ym, ...monthWeeks(ym)[idx - 1] };
}

/** Week `idx` of a month, or that month's last week when it has fewer. */
export function nthMonthWeek(ym, idx) {
  const weeks = monthWeeks(ym);
  return { ym, ...(weeks[idx - 1] || weeks[weeks.length - 1]) };
}

/** The block before this one; Wk 1's is the previous month's last block. */
export function prevMonthWeek(w) {
  if (w.idx > 1) return nthMonthWeek(w.ym, w.idx - 1);
  const ym = shiftMonth(w.ym, -1);
  const weeks = monthWeeks(ym);
  return { ym, ...weeks[weeks.length - 1] };
}

/**
 * The last day whose visits are fully loaded. The ingest writes the newest
 * day while it is still happening (23 Sep 2026 held 40 rows against ~700 on
 * a normal weekday), so the latest day only counts once it is at least two
 * days behind today.
 */
export function completeThrough(latestISO, todayISO) {
  if (!latestISO) return null;
  if (!todayISO) return latestISO;
  return daysBetween(latestISO, todayISO) >= 2 ? latestISO : addDays(latestISO, -1);
}

/**
 * Cut both ranges at the last complete day, then, if either lost days to
 * that cut, trim the other to the same number of days from its own start.
 * A running week compares its first three days against the benchmark's
 * first three, never against the whole benchmark week. Returns
 * { a, b, matched } where matched says a trim happened.
 */
export function likeForLike(a, b, through) {
  if (!through) return { a, b, matched: false };
  const clip = r => (r.to > through ? { from: r.from, to: through } : r);
  const ca = clip(a);
  const cb = clip(b);
  const aCut = ca.to !== a.to;
  const bCut = cb.to !== b.to;
  if (!aCut && !bCut) return { a, b, matched: false };

  const days = Math.min(rangeDays(ca), rangeDays(cb));
  const trim = r => ({ from: r.from, to: addDays(r.from, days - 1) });
  return { a: trim(ca), b: trim(cb), matched: true };
}

/** "22–28 Sep 2026", "29 Aug – 4 Sep 2026", "29 Dec 2025 – 4 Jan 2026", "23 Sep 2026". */
export function formatRange(r, { year = true } = {}) {
  if (!r?.from || !r?.to) return '';
  const [y1, m1, d1] = r.from.split('-').map(Number);
  const [y2, m2, d2] = r.to.split('-').map(Number);
  const yr = year ? ` ${y2}` : '';
  if (y1 !== y2) return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]}${yr}`;
  if (d1 === d2) return `${d1} ${MONTHS[m1 - 1]}${yr}`;
  return `${d1}–${d2} ${MONTHS[m1 - 1]}${yr}`;
}

/** Stable key for cache and file names: '2026-09-22_2026-09-28'. */
export const rangeKey = r => `${r.from}_${r.to}`;

/**
 * Week shortcuts, all relative to the last complete day so they roll forward
 * with the data. Each returns raw (untrimmed) blocks; likeForLike does the
 * matching.
 */
export function weekPresets(through) {
  if (!through) return [];
  const cur = monthWeekOf(through);
  const last = prevMonthWeek(cur);
  const range = w => ({ from: w.from, to: w.to });
  return [
    { key: 'w_prev', label: 'This Week vs Last Week', a: range(cur), b: range(last) },
    { key: 'w_month', label: 'vs Same Week Last Month', a: range(cur), b: range(nthMonthWeek(shiftMonth(cur.ym, -1), cur.idx)) },
    { key: 'w_year', label: 'vs Same Week Last Year', a: range(cur), b: range(nthMonthWeek(shiftMonth(cur.ym, -12), cur.idx)) },
    { key: 'w_full', label: 'Last Week vs Week Before', a: range(last), b: range(prevMonthWeek(last)) },
  ];
}
