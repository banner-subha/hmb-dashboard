// Date ranges for the Field Visits page, and folding query_visits_range into
// the rows the page already renders.
//
// Pure and import-free, so scripts/test-visit-range.mjs runs it under node.
// Dates are 'YYYY-MM-DD' strings throughout, done in UTC so a day never shifts.

export const MAX_RANGE_DAYS = 93;
export const EARLIEST_VISIT_DAY = '2025-01-01';

const toDate = iso => new Date(`${iso}T00:00:00Z`);
const toIso = d => d.toISOString().slice(0, 10);

export function addDays(iso, n) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Inclusive day count: '2026-09-21'..'2026-09-27' is 7. */
export function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86400000) + 1;
}

/** The running month is the page's own view; the others are ranges ending at `latest`. */
export const RANGE_PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'prevMonth', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

/** { from, to } for a preset, or null for 'month' and 'custom'. */
export function presetRange(key, latest) {
  if (!latest) return null;
  if (key === 'last7') return { from: addDays(latest, -6), to: latest };
  if (key === 'last30') return { from: addDays(latest, -29), to: latest };
  if (key === 'prevMonth') {
    const firstOfMonth = `${latest.slice(0, 7)}-01`;
    const to = addDays(firstOfMonth, -1);
    return { from: `${to.slice(0, 7)}-01`, to };
  }
  return null;
}

/** Why a custom range can't be used, or null when it can. */
export function rangeProblem(from, to, latest) {
  if (!from || !to) return 'Pick both a start and an end date.';
  if (to < from) return 'The end date is before the start date.';
  if (from < EARLIEST_VISIT_DAY) return 'Visits are only recorded from 1 Jan 2025.';
  if (latest && to > latest) return 'Visits are only recorded up to the latest upload.';
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return `Pick ${MAX_RANGE_DAYS} days or fewer.`;
  return null;
}

// State and district as one key, whatever case or spacing each feed uses.
const norm = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
const key = (state, district) => `${norm(state)}|${norm(district)}`;
const titleCase = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/**
 * The district table's rows with the fabricator figures for the range.
 *
 * Every district from the month payload stays (at zero if the range has no
 * visits there), because it carries the sales and plan figures; districts only
 * the range has are added. `monthly` keeps the original row, so the status tag,
 * which is a monthly judgement, is still computed from monthly figures.
 */
export function mergeRangeDistricts(monthRows = [], rangeRows = []) {
  const byKey = new Map(rangeRows.map(r => [key(r.state, r.district), r]));
  const out = monthRows.map(row => {
    const r = byKey.get(key(row.state, row.district));
    byKey.delete(key(row.state, row.district));
    return withRange(row, r);
  });
  for (const r of byKey.values()) {
    out.push(withRange({ state: titleCase(r.state), district: titleCase(r.district) }, r));
  }
  return out;
}

function withRange(row, r) {
  const cur = r?.fab_visits ?? 0;
  const prev = r?.prev_fab_visits ?? 0;
  return {
    ...row,
    monthly: row,
    curFabricatorVisits: cur,
    curUniqueFabricators: r?.unique_fabricators ?? 0,
    rangePrevFabricatorVisits: prev,
    fabricatorGrowth: cur - prev,
  };
}

/**
 * The sales-team rows with the range's activity. Reps only the range has are
 * added; reps in the month payload with nothing in the range stay at zero.
 * `roleOf` stamps KRM / KRO / OTHER on the added rows, as the page does for
 * the month's.
 */
export function mergeRangeReps(monthRows = [], rangeRows = [], roleOf = () => 'OTHER') {
  const byName = new Map(rangeRows.map(r => [r.rep, r]));
  const out = monthRows.map(row => {
    const r = byName.get(row.employee_name);
    byName.delete(row.employee_name);
    return repWithRange(row, r);
  });
  for (const r of byName.values()) {
    out.push(repWithRange({ employee_name: r.rep, role: roleOf(r.rep) }, r));
  }
  return out.filter(r => r.curVisits > 0 || r.prevVisitsMtd > 0);
}

function repWithRange(row, r) {
  const visits = r?.visits ?? 0;
  const days = r?.active_days ?? 0;
  return {
    ...row,
    curVisits: visits,
    prevVisitsMtd: r?.prev_visits ?? 0,
    totalVisits: visits,
    activeDays: days,
    dailyVisitRate: days > 0 ? Math.round((visits / days) * 10) / 10 : 0,
    uniqueCustomers: r?.customers ?? 0,
    dealerVisits: r?.dealer_visits ?? 0,
    fabricatorVisits: r?.fabricator_visits ?? 0,
    avgDurationMins: r?.avg_duration ?? 0,
    middayPct: r?.midday_pct ?? 0,
    afternoonPct: r?.afternoon_pct ?? 0,
  };
}

/**
 * The KPI row's summary for a range. Dealer coverage keeps the month's tracked
 * dealers as its denominator: the tracked list is the dealer master, not a
 * monthly figure.
 */
export function rangeSummary(kpi, monthSummary) {
  if (!kpi) return null;
  const tracked = monthSummary?.totalDealersTracked ?? 0;
  const visited = kpi.dealers_visited ?? 0;
  return {
    ...monthSummary,
    curTotalVisits: kpi.visits ?? 0,
    prevTotalVisits: kpi.prev_visits ?? 0,
    curDealerVisits: kpi.dealer_visits ?? 0,
    curFabricatorVisits: kpi.fabricator_visits ?? 0,
    activeDealersVisited: visited,
    totalDealersTracked: tracked,
    dealerCoveragePct: tracked > 0 ? Math.round((visited / tracked) * 1000) / 10 : 0,
    avgVisitDurationMins: kpi.avg_dealer_duration != null ? Math.round(kpi.avg_dealer_duration * 10) / 10 : 0,
    activeFieldReps: kpi.active_reps ?? 0,
  };
}
