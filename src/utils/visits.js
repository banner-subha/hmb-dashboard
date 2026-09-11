// Field visit domain vocabulary.
//
// Lives beside despatch.js and trendEngine.js rather than inside the page, so
// the visits tab stops being the one screen that computes its own meaning.
// Everything here is pure: no React, no fetching.
//
// Wording follows docs/naming-philosophy/NAMING_PHILOSOPHY.md. Titles are noun
// phrases, never questions or sentences (Law 1); no bare MoM/MTD (Law 2); every
// number carries a label that explains it (Law 3); the business outcome leads,
// not the formula (Law 4). Status words come from the approved badge map:
// "On Track", "Falling Behind", "Needs Attention".

import { VISIT_QUADRANTS } from './constants';

/** The four views, in the order the page shows them. */
export const VISIT_SECTIONS = [
  {
    key: 'dealers',
    label: 'Dealers',
    countKey: 'dealers',
    title: 'Dealer Visit Performance',
    blurb: 'Every dealer visited this month, the visit count, and whether their sales kept up.',
    searchHint: 'Search dealer, district or executive',
  },
  {
    key: 'districts',
    label: 'Districts & Fabricators',
    countKey: 'districts',
    title: 'Fabricator Coverage by District',
    blurb: 'Fabricator visits by district. Fabricators do not buy from us — they decide what gets used on site, so their activity moves dealer sales later.',
    searchHint: 'Search district or state',
  },
  {
    key: 'reps',
    label: 'Sales Team',
    countKey: 'employees',
    title: 'Sales Team Field Activity',
    blurb: 'Visits per person this month, the same-day comparison against last month, and the split of their working day.',
    searchHint: 'Search sales executive',
  },
  {
    key: 'trends',
    label: 'Timings & Trends',
    countKey: null,
    title: 'Visit Timings & Monthly Trend',
    blurb: 'Time of day the team is in the field, length of each call, and the visit count month by month.',
    searchHint: null,
  },
];

/**
 * Sales target status has FOUR states, not two.
 *
 * Rendering it as a boolean meant "no sales account" and "holding steady" both
 * displayed as "Behind Target" - the first is a claim about data that does not
 * exist, the second is the opposite of the truth.
 */
export function paceDisplay(row) {
  if (!row) {
    return { key: 'NONE', label: '—', text: 'text-text-muted', chip: 'bg-slate-500/15 text-slate-400 border border-slate-500/30' };
  }
  const status = row.paceStatus ?? row.districtPaceStatus;
  if (status === 'UNKNOWN' || row.salesMatched === false) {
    return { key: 'UNKNOWN', label: 'No Sales Yet', text: 'text-slate-400', chip: 'bg-slate-500/15 text-slate-400 border border-slate-500/30' };
  }
  if (status === 'AHEAD') {
    return { key: 'AHEAD', label: 'Ahead of Target', text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' };
  }
  if (status === 'STABLE') {
    return { key: 'STABLE', label: 'On Track', text: 'text-blue-400', chip: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' };
  }
  return { key: 'BEHIND', label: 'Falling Behind', text: 'text-rose-400', chip: 'bg-rose-500/15 text-rose-400 border border-rose-500/30' };
}

/**
 * Group config, never guessing. Falling back to ORGANIC would label an
 * unrecognised key "Steady Accounts", which is an assertion rather than a
 * default.
 */
export function quadrantConfig(key) {
  return VISIT_QUADRANTS[key] || VISIT_QUADRANTS.NO_SALES_LINK;
}

/** Group keys in ribbon order, so the cards and the counts cannot drift. */
export const QUADRANT_ORDER = [
  'GROWTH_DRIVER', 'RED_FLAG', 'NEGLECTED', 'ORGANIC', 'NO_SALES_LINK',
];

/** Count field on `summary` for each group. */
export const QUADRANT_COUNT_KEYS = {
  GROWTH_DRIVER: 'growthDriversCount',
  RED_FLAG: 'redFlagsCount',
  NEGLECTED: 'neglectedCount',
  ORGANIC: 'organicChampionsCount',
  NO_SALES_LINK: 'noSalesLinkCount',
};

/**
 * The comparable historical average. The parser emits both: histAvgVisits is a
 * whole-month figure, histAvgVisitsMtd covers the same day-of-month window the
 * current month has reached. Classifications use the latter, so anything shown
 * next to a change figure must use it too - displaying one while computing from
 * the other is what made the old table confusing.
 */
export function comparableAvg(row) {
  if (!row) return 0;
  return row.histAvgVisitsMtd ?? row.histAvgVisits ?? 0;
}

export function comparableFabricatorAvg(row) {
  if (!row) return 0;
  return row.histAvgFabricatorVisitsMtd ?? row.histAvgFabricatorVisits ?? 0;
}

/** Visit intensity relative to the comparable average. */
export function visitTrend(row) {
  const growth = row?.visitGrowth ?? 0;
  return {
    growth,
    isUp: (row?.visitGrowthStatus ?? (growth > 0 ? 'GROWTH' : 'DEGROWTH')) === 'GROWTH',
  };
}

/** True when nothing is known about this row's sales side. */
export function isUnlinked(row) {
  const status = row?.paceStatus ?? row?.districtPaceStatus;
  return status === 'UNKNOWN' || row?.salesMatched === false;
}

/**
 * The district insight sentence. Every branch except the first asserts
 * something about dealer sales, so an unlinked district cannot use any of them:
 * 92 of 187 districts have no entry in the sales feed.
 */
export function districtInsight(row) {
  const accel = row?.fabricatorTrend === 'ACCELERATING';
  if (isUnlinked(row)) {
    return { text: 'Fabricator visits tracked, no dealer sales recorded in this district', color: 'text-slate-400' };
  }
  const ahead = row?.districtPaceStatus === 'AHEAD' || row?.districtPaceStatus === 'STABLE';
  if (accel && ahead) return { text: 'Fabricator visits up, dealer sales following through', color: 'text-emerald-400 font-bold' };
  if (accel && !ahead) return { text: 'Fabricator visits up, dealer sales not yet following', color: 'text-amber-400' };
  if (!accel && !ahead) return { text: 'Low fabricator visits, dealer sales slow — needs coverage', color: 'text-rose-400' };
  return { text: 'Dealer sales steady on normal fabricator contact', color: 'text-blue-400' };
}

/** Filter predicate shared by every view, so the tabs cannot disagree. */
export function matchesFilters(row, { state, quadrant, query }, fields) {
  if (state && state !== 'ALL' && row.state !== state) return false;
  if (quadrant && quadrant !== 'ALL' && row.quadrant !== quadrant) return false;
  if (query) {
    const q = query.toLowerCase();
    const hit = fields.some(f => String(row[f] ?? '').toLowerCase().includes(q));
    if (!hit) return false;
  }
  return true;
}

/**
 * Per-state summary. Recomputed client-side because the payload's `summary`
 * covers every state at once.
 *
 * NO_SALES_LINK is included deliberately: without it the group counts stop
 * summing to the dealer total for the selected state and ~1,600 dealers vanish
 * from the page.
 */
export function summariseState(data, state) {
  if (!data) return null;
  if (!state || state === 'ALL') return data.summary;

  const dealers = (data.dealers || []).filter(d => d.state === state);
  const districts = (data.districts || []).filter(d => d.state === state);

  const dealerVisits = dealers.reduce((s, d) => s + (d.curVisits || 0), 0);
  const fabVisits = districts.reduce((s, d) => s + (d.curFabricatorVisits || 0), 0);
  const visited = dealers.filter(d => d.curVisits > 0).length;
  const tracked = dealers.length;

  const counts = Object.fromEntries(QUADRANT_ORDER.map(k => [k, 0]));
  dealers.forEach(d => { if (counts[d.quadrant] !== undefined) counts[d.quadrant] += 1; });

  return {
    curTotalVisits: dealerVisits + fabVisits,
    curDealerVisits: dealerVisits,
    curFabricatorVisits: fabVisits,
    activeDealersVisited: visited,
    totalDealersTracked: tracked,
    dealerCoveragePct: tracked > 0 ? Math.round((visited / tracked) * 1000) / 10 : 0,
    // Both of these are all-dataset figures in the payload, not per-state and
    // not current-month. Carried through unchanged rather than recomputed from
    // a slice that cannot support them.
    avgVisitDurationMins: data.summary?.avgVisitDurationMins || 0,
    activeFieldReps: data.summary?.activeFieldReps || 0,
    growthDriversCount: counts.GROWTH_DRIVER,
    redFlagsCount: counts.RED_FLAG,
    neglectedCount: counts.NEGLECTED,
    organicChampionsCount: counts.ORGANIC,
    noSalesLinkCount: counts.NO_SALES_LINK,
    salesLinkedDealers: dealers.filter(d => d.salesMatched).length,
  };
}
