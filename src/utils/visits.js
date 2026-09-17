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

import { VISIT_QUADRANTS, normalizeStateName } from './constants';
import { normalizeDistrict } from './districtNormalizer';

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
    blurb: 'Fabricator visits by district, against the usual for these days of the month. Fabricators do not buy from us — they decide what gets used on site.',
    searchHint: 'Search district or state',
  },
  {
    key: 'reps',
    label: 'Sales Team',
    countKey: 'employees',
    title: 'Sales Team Field Activity',
    blurb: 'Visits this month against the same days last month. Visits per day, mix and length are lifetime figures.',
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

/**
 * Names the hue behind a quadrant colour, for `data-accent`.
 *
 * The quadrant palette is tuned for the dark theme and drops to 2–3 : 1 on a
 * white card. Tagging the element with its hue lets light mode substitute a
 * readable tone of the same colour in CSS (see index.css) while the fills,
 * ribbons and tints keep the original, which reads correctly on either ground.
 */
const ACCENT_BY_HEX = {
  '#22c55e': 'none',
  '#ef4444': 'critical',
  '#f59e0b': 'high',
  '#eab308': 'medium',
  '#3b82f6': 'info',
  '#94a3b8': 'low',
  '#6b7280': 'low',
};

export function accentBucket(hex) {
  return ACCENT_BY_HEX[String(hex).toLowerCase()] || 'none';
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
  const raw = row.histAvgVisitsMtd ?? row.histAvgVisits ?? 0;
  return Math.round(raw);
}

export function comparableFabricatorAvg(row) {
  if (!row) return 0;
  const raw = row.histAvgFabricatorVisitsMtd ?? row.histAvgFabricatorVisits ?? 0;
  return Math.round(raw);
}

/** Visit intensity relative to the comparable average. */
export function visitTrend(row) {
  const rawGrowth = row?.visitGrowth ?? 0;
  const growth = Math.round(rawGrowth) || 0;
  return {
    growth,
    isUp: (row?.visitGrowthStatus ?? (growth > 0 ? 'GROWTH' : 'DEGROWTH')) === 'GROWTH',
  };
}

/** True when nothing is known about this row's sales side. */
export function isUnlinked(row) {
  if (row?.bpTarget > 0) return false;
  const status = row?.paceStatus ?? row?.districtPaceStatus;
  return status === 'UNKNOWN' || row?.salesMatched === false;
}

/**
 * Computes a multi-factor composite Field Conversion Score (0 to 100)
 * reflecting field effort, unique fabricator reach, pro-rated target pace,
 * and daily dispatch velocity.
 *
 * Weight Distribution:
 * - Visit Momentum (35%): Cur visits vs benchmark MTD
 * - Reach Breadth (20%): Unique fabricators and balanced call density (1.1–2.5 calls/fab)
 * - Pro-rated Target Pace (30%): Invoiced MT vs Day-adjusted Target (Target * elapsedDays / 30)
 * - Daily Dispatch Velocity (15%): Actual MT/day vs Historical Daily Run-Rate
 */
export function calculateDistrictScore(row) {
  if (isUnlinked(row)) return null;

  const curVisits = Number(row?.curFabricatorVisits ?? 0);
  const benchVisits = Number(row?.histAvgFabricatorVisitsMtd ?? 0);
  const uniqueFabs = Number(row?.curUniqueFabricators ?? 0);
  const actualSales = Number(row?.salesActual ?? row?.districtCurQty ?? 0);
  const bpTarget = Number(row?.bpTarget ?? 0);
  const elapsedDays = Number(row?.elapsedDays ?? 7) || 7;
  const usualPerDay = Number(row?.salesUsualPerDay ?? 0);

  // ── 1. Visit Momentum (35% weight) ──────────────────────────
  let visitScore = 10;
  if (benchVisits > 0) {
    const vRatio = curVisits / benchVisits;
    if (vRatio >= 1.25) visitScore = 100;
    else if (vRatio >= 1.00) visitScore = 85;
    else if (vRatio >= 0.75) visitScore = 60;
    else if (vRatio >= 0.50) visitScore = 35;
    else visitScore = Math.max(10, Math.round(vRatio * 50));
  } else if (curVisits > 0) {
    visitScore = 80;
  }

  // ── 2. Reach Breadth & Depth (20% weight) ───────────────────
  let reachScore = 0;
  if (curVisits > 0 && uniqueFabs > 0) {
    const callsPerFab = curVisits / uniqueFabs;
    if (callsPerFab >= 1.0 && callsPerFab <= 2.5) {
      reachScore = Math.min(100, Math.round(50 + Math.min(uniqueFabs, 50)));
    } else if (callsPerFab <= 3.5) {
      reachScore = Math.min(100, Math.round(40 + Math.min(uniqueFabs, 45)));
    } else {
      reachScore = Math.max(20, Math.round(30 + Math.min(uniqueFabs, 20)));
    }
  } else if (curVisits === 0) {
    reachScore = 0;
  }

  // ── 3. Pro-rated Target Pace (30% weight) ───────────────────
  let paceScore = 10;
  if (bpTarget > 0) {
    const proratedTarget = (bpTarget * elapsedDays) / 30;
    const paceRatio = proratedTarget > 0 ? actualSales / proratedTarget : 1;
    if (paceRatio >= 1.10) paceScore = 100;
    else if (paceRatio >= 0.90) paceScore = 85;
    else if (paceRatio >= 0.70) paceScore = 65;
    else if (paceRatio >= 0.40) paceScore = 40;
    else paceScore = Math.max(10, Math.round(paceRatio * 75));
  } else if (usualPerDay > 0) {
    const expected = usualPerDay * elapsedDays;
    const paceRatio = expected > 0 ? actualSales / expected : 1;
    if (paceRatio >= 1.10) paceScore = 100;
    else if (paceRatio >= 0.90) paceScore = 85;
    else if (paceRatio >= 0.70) paceScore = 65;
    else if (paceRatio >= 0.40) paceScore = 40;
    else paceScore = Math.max(10, Math.round(paceRatio * 75));
  } else if (actualSales > 0) {
    paceScore = 75;
  }

  // ── 4. Daily Dispatch Velocity (15% weight) ─────────────────
  let velocityScore = 15;
  const currentDailyRate = elapsedDays > 0 ? actualSales / elapsedDays : actualSales;
  if (usualPerDay > 0) {
    const vRatio = currentDailyRate / usualPerDay;
    if (vRatio >= 1.00) velocityScore = 100;
    else if (vRatio >= 0.80) velocityScore = 75;
    else if (vRatio >= 0.50) velocityScore = 45;
    else velocityScore = 15;
  } else if (actualSales > 0) {
    velocityScore = 70;
  }

  const total = Math.round(
    (visitScore * 0.35) +
    (reachScore * 0.20) +
    (paceScore * 0.30) +
    (velocityScore * 0.15)
  );

  return {
    total: Math.min(100, Math.max(0, total)),
    visitScore,
    reachScore,
    paceScore,
    velocityScore,
  };
}

/**
 * The district signal: whether field effort is turning into dealer sales.
 * Evaluated via multi-factor Field Conversion Score (0-100) combining effort,
 * coverage breadth, pro-rated target pace, and dispatch velocity.
 */
export function districtSignal(row) {
  if (isUnlinked(row)) {
    return {
      key: 'UNLINKED',
      tag: 'No Sales Link',
      score: null,
      detail: 'Fabricator visits are tracked here, but this district has no dealer sales on record to compare them against',
      chip: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',
    };
  }

  const breakdown = calculateDistrictScore(row);
  const score = breakdown?.total ?? 0;
  const { visitScore, paceScore } = breakdown || {};

  // Tier 1: High Momentum (75–100)
  if (score >= 75) {
    return {
      key: 'HIGH_MOMENTUM',
      tag: 'High Momentum',
      score,
      detail: `Field visits are above benchmark and dealer dispatches are on or ahead of pro-rated pace (Score: ${score}/100)`,
      chip: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    };
  }

  // Tier 2: Building Demand or Steady Conversion (55–74)
  if (score >= 55) {
    // If visits are strong (effort is high) and billing is underway within early-month cycle
    if ((visitScore ?? 0) >= 60 && (paceScore ?? 0) >= 40) {
      return {
        key: 'BUILDING_DEMAND',
        tag: 'Building Demand',
        score,
        detail: `Active fabricator visits underway; dealer dispatches are building within the 3-5 day order cycle (Score: ${score}/100)`,
        chip: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
      };
    }
    return {
      key: 'STEADY',
      tag: 'Steady Conversion',
      score,
      detail: `Steady baseline visits and consistent dealer dispatch run-rate (Score: ${score}/100)`,
      chip: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    };
  }

  // Tier 3: Conversion Lag or Moderate Activity (35–54)
  if (score >= 35) {
    // If visits were high but billing is severely lagging
    if ((visitScore ?? 0) >= 60 && (paceScore ?? 0) < 40) {
      return {
        key: 'CONVERSION_LAG',
        tag: 'Conversion Lag',
        score,
        detail: `High fabricator visits recorded, but dealer dispatches have not materialized yet. Needs sales follow-up (Score: ${score}/100)`,
        chip: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
      };
    }
    return {
      key: 'MODERATE',
      tag: 'Moderate Activity',
      score,
      detail: `Moderate field visits and average billing rate (Score: ${score}/100)`,
      chip: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    };
  }

  // Tier 4: Needs Coverage (<35)
  return {
    key: 'COVERAGE',
    tag: 'Needs Coverage',
    score,
    detail: `Fabricator visits and dealer dispatches are both significantly behind benchmark (Score: ${score}/100)`,
    chip: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  };
}

/**
 * Joins a district to its dispatch record, and works out what it was expected
 * to ship by now.
 *
 * The visit parser does this join server-side on a plain lowercase compare, so
 * every district the two feeds spell differently came back as "no sales on
 * record" even though the tonnes were sitting there: Medinipur East against
 * Purba Medinipur, 24 Paraganas North against North 24 Parganas, Maldah
 * against Malda. Redoing the join here with the app's own district normaliser
 * recovers those, and it is the same normaliser every other tab already trusts.
 *
 * The target is the district's usual daily rate carried across the days of the
 * cycle so far. That is the figure the AHEAD / BEHIND flag is judged on, so the
 * number shown and the colour beside it come from one source.
 */
const salesKey = (state, district) => {
  const st = normalizeStateName(state || '').toUpperCase().replace(/\s+/g, '');
  const dt = normalizeDistrict(district || '', state || '').toUpperCase().replace(/\s+/g, '');
  return st && dt ? `${st}||${dt}` : null;
};

export function buildDespatchIndex(despatchDistricts = []) {
  const index = new Map();
  despatchDistricts.forEach(d => {
    const k = salesKey(d?.state, d?.district);
    if (k && !index.has(k)) index.set(k, d);
  });
  return index;
}

/**
 * Dealer identity for the Business Plan join.
 *
 * State and district come first because dealer names are not unique across the
 * country — joining on the name alone merges two different traders who happen
 * to share one, and quietly doubles a target. The bare name survives as a
 * fallback key for the rows whose district spelling differs between the two
 * feeds; it is only consulted when the full key misses.
 */
const dealerNameKey = name =>
  String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

const dealerKey = (state, district, dealer) => {
  const base = salesKey(state, district);
  const nm = dealerNameKey(dealer);
  return base && nm ? `${base}||${nm}` : null;
};

// ── Porcelain-safe lightness for the progress ramp ───────────────────────────
// The ramp's own lightness (45-54%) is tuned for a navy ground. On a white card
// the gold end of it (hue ~48) lands at 1.3 : 1 — a percentage rendered in a
// colour nobody can read. Rather than hand-pick a second ramp, the maximum
// lightness that still clears 4.6 : 1 on white is solved per hue, once, and
// cached. The hue is untouched, so a 40% still reads amber and a 95% still
// reads green — only the depth changes, and only in light mode.
const LIGHT_RAMP_LIGHTNESS = new Map();

function hslChannelsToRgb(h, s, l) {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [r + m, g + m, b + m];
}

function relativeLuminance(h, s, l) {
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslChannelsToRgb(h, s, l);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function porcelainLightness(hue, saturation) {
  const key = `${hue}:${saturation}`;
  if (LIGHT_RAMP_LIGHTNESS.has(key)) return LIGHT_RAMP_LIGHTNESS.get(key);
  // Walk down from the dark-theme value until the swatch clears AA on white.
  let l = 50;
  while (l > 18 && (1.05 / (relativeLuminance(hue, saturation, l) + 0.05)) < 4.6) {
    l -= 1;
  }
  LIGHT_RAMP_LIGHTNESS.set(key, l);
  return l;
}

function isLightTheme() {
  return typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-theme') === 'light';
}

/**
 * Progress bar colour, interpolated Red -> Gold -> Green across 0-100%.
 *
 * Shared by the dealer and the district tables so the same percentage cannot
 * render as two different colours depending on which tab you are looking at.
 */
export function getDynamicProgressColor(pct) {
  if (pct == null || isNaN(pct)) {
    return {
      color: isLightTheme() ? '#3B4860' : '#94a3b8',
      glow: 'none',
    };
  }
  const clamped = Math.max(0, Math.min(100, pct));
  let hue;
  if (clamped <= 50) {
    // 0% to 50%: Red (0) -> Yellow/Gold (48)
    hue = Math.round((clamped / 50) * 48);
  } else {
    // 50% to 100%: Yellow/Gold (48) -> Emerald Green (142)
    hue = Math.round(48 + ((clamped - 50) / 50) * (142 - 48));
  }
  const saturation = 88;
  const lightness = isLightTheme()
    ? porcelainLightness(hue, saturation)
    : (clamped < 10 ? 54 : clamped < 70 ? 49 : 45);
  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  return {
    color,
    glow: `0 0 8px hsla(${hue}, ${saturation}%, ${lightness}%, 0.4)`,
  };
}

export function buildBusinessPlanDistrictIndex(bpRows = []) {
  const index = new Map();
  bpRows.forEach(row => {
    const grp = row.grp || {};
    const st = grp.state || row.state;
    const dt = grp.district || row.district;
    const target = Number(row.total_sp_target ?? row.bp_sp_target ?? row.target ?? 0);
    const k = salesKey(st, dt);
    if (k) {
      index.set(k, (index.get(k) || 0) + target);
    }
    if (dt) {
      const dtNorm = normalizeDistrict(dt, st || '').toUpperCase().replace(/\s+/g, '');
      if (dtNorm && !index.has(dtNorm)) {
        index.set(dtNorm, target);
      }
    }
  });
  return index;
}

/**
 * Business Plan targets keyed for the dealer join.
 *
 * Two keys per plan row: the full state||district||dealer identity, and the
 * bare dealer name under a `~` prefix so the two namespaces cannot collide.
 * Targets accumulate per key because one dealer carries a row per product
 * group, and the column is about the total commitment.
 */
/**
 * KRM / KRO lookup for the sales team, from the Business Plan's own columns.
 *
 * The visit payload does not carry a role: the parser classifies reps while
 * building the dealer rows and then throws the answer away, so the only role
 * information that reaches the browser is which dealers a name appears against.
 * Deriving from that covers 98 of 149 people — every rep who visits only
 * fabricators is invisible to it — so the roles are read from the same source
 * the parser uses instead.
 */
export function buildRepRoleIndex({ krm = [], kro = [], jrKro = [] } = {}) {
  const clean = names =>
    new Set(names.map(n => String(n || '').toUpperCase().trim()).filter(Boolean));
  return { krm: clean(krm), kro: clean(kro), jrKro: clean(jrKro) };
}

/**
 * Which role a sales executive holds: 'KRM', 'KRO' or 'OTHER'.
 *
 * Mirrors classify_rep() in cloud_run_visits/main.py, including the retry on
 * the name with its branch suffix removed — the visit sheet writes people as
 * "NAME-AGRA" where the Business Plan holds the bare name. A Junior KRO counts
 * as a KRO, as it does there.
 */
export function classifyRep(name, roleIndex) {
  if (!name || !roleIndex) return 'OTHER';
  const upper = String(name).toUpperCase().trim();
  if (!upper) return 'OTHER';

  const test = value => {
    if (roleIndex.krm.has(value)) return 'KRM';
    if (roleIndex.kro.has(value) || roleIndex.jrKro.has(value)) return 'KRO';
    return null;
  };

  return test(upper) || test(upper.split('-')[0].trim()) || 'OTHER';
}

/** Role filter options for the Sales Team view, in display order. */
export const REP_ROLES = [
  { key: 'ALL', label: 'All Roles' },
  { key: 'KRM', label: 'KRM' },
  { key: 'KRO', label: 'KRO' },
  { key: 'OTHER', label: 'Other' },
];

export function buildBusinessPlanDealerIndex(bpRows = []) {
  const index = new Map();
  bpRows.forEach(row => {
    const grp = row.grp || {};
    const dealer = grp.dealer || row.dealer;
    if (!dealer) return;

    const target = Number(row.total_sp_target ?? row.bp_sp_target ?? row.target ?? 0);
    const potential = Number(row.total_potential ?? row.potential ?? 0);
    const full = dealerKey(grp.state || row.state, grp.district || row.district, dealer);
    if (full) {
      const prev = index.get(full);
      const prevTgt = typeof prev === 'object' && prev !== null ? prev.target : Number(prev || 0);
      const prevPot = typeof prev === 'object' && prev !== null ? prev.potential : 0;
      index.set(full, {
        target: prevTgt + target,
        potential: prevPot + potential,
      });
    }

    const nm = dealerNameKey(dealer);
    if (nm) {
      const prevNm = index.get(`~${nm}`);
      const prevTgt = typeof prevNm === 'object' && prevNm !== null ? prevNm.target : Number(prevNm || 0);
      const prevPot = typeof prevNm === 'object' && prevNm !== null ? prevNm.potential : 0;
      index.set(`~${nm}`, {
        target: prevTgt + target,
        potential: prevPot + potential,
      });
    }
  });
  return index;
}

/**
 * Attaches the sales side of the dealer table.
 *
 * The dealer counterpart of `attachDistrictSales`, and deliberately the same
 * shape: both tabs answer "how much has this account invoiced against what it
 * was asked to" and must answer it the same way, or the Dealers tab and the
 * Districts & Fabricators tab disagree about the same business.
 *
 * The one structural difference is where the actual comes from. A district has
 * to be joined to the dispatch feed; a dealer already carries `salesCur` in the
 * visit payload, so there is nothing to look up.
 *
 * The one thing this does NOT copy from the district version is the run-rate
 * fallback. A district without a plan can be measured against its own dispatch
 * rate because both come from the same feed at the same scale. A dealer's
 * `dailyAvgQty` is its own historical trickle, and dividing month-to-date
 * tonnes by it produced percentages like 3,639% — a number that says nothing
 * about a plan and everything about a quiet account having one good month. The
 * 126 dealers with sales but no plan target therefore read as unbudgeted, which
 * is what they are, rather than carrying an invented denominator under a column
 * headed "BP Target".
 */
export function attachDealerSales(rows = [], bpIndex = null, elapsedDays = 0) {
  if (!rows || rows.length === 0) return rows;

  return rows.map(row => {
    const actual = Number(row.salesCur ?? 0);
    const usualPerDay = Number(row.dailyAvgQty ?? 0);

    const full = dealerKey(row.state, row.district, row.dealer);
    const nm = dealerNameKey(row.dealer);
    const bpEntry =
      (bpIndex && full && bpIndex.get(full)) ||
      (bpIndex && nm && bpIndex.get(`~${nm}`)) ||
      null;

    const bpTarget =
      typeof bpEntry === 'object' && bpEntry !== null
        ? bpEntry.target
        : Number(bpEntry || 0);
    const bpPotential =
      typeof bpEntry === 'object' && bpEntry !== null
        ? bpEntry.potential
        : Number(row.bpPotential || 0);

    const hasBpTarget = bpTarget > 0;
    const target = hasBpTarget ? bpTarget : null;

    const salesAchievedPct = hasBpTarget
      ? Math.round((actual / bpTarget) * 1000) / 10
      : null;

    // Pace against the plan, prorated over the elapsed cycle days, exactly as
    // attachDistrictSales does it.
    // A dealer with an explicit Business Plan target is linked to an active commitment.
    const salesMatched = Boolean(row.salesMatched || hasBpTarget);
    const proratedBpTarget =
      hasBpTarget && elapsedDays > 0 ? bpTarget * (elapsedDays / 30) : bpTarget;

    let paceStatus = row.paceStatus;
    if (hasBpTarget) {
      paceStatus = actual >= proratedBpTarget ? 'AHEAD' : 'BEHIND';
    }

    // The quadrant follows the pace, so it has to be re-derived here rather
    // than taken from the payload. Same rule as the parser: STABLE counts as
    // not-behind, and an unmatched dealer is its own bucket rather than a
    // guess. Visit side is untouched.
    const isHighVisits =
      Number(row.curVisits ?? 0) >= Math.max(1, Number(row.histAvgVisitsMtd ?? 0));
    const isAheadPace = paceStatus === 'AHEAD' || paceStatus === 'STABLE';

    let quadrant;
    if (!salesMatched) quadrant = 'NO_SALES_LINK';
    else if (isHighVisits) quadrant = isAheadPace ? 'GROWTH_DRIVER' : 'RED_FLAG';
    else quadrant = isAheadPace ? 'ORGANIC' : 'NEGLECTED';

    return {
      ...row,
      paceStatus,
      quadrant,
      salesMatched,
      salesActual: actual,
      salesTarget: target,
      bpTarget: hasBpTarget ? bpTarget : null,
      bpPotential: bpPotential > 0 ? bpPotential : (row.bpPotential || null),
      salesUsualPerDay: usualPerDay,
      salesAchievedPct,
      elapsedDays: elapsedDays || 7,
    };
  });
}

export function attachDistrictSales(rows = [], index, elapsedDays = 0, bpIndex = null) {
  if (!rows || rows.length === 0) return rows;
  return rows.map(row => {
    const hit = index ? index.get(salesKey(row.state, row.district)) : null;
    const actual = hit?.cur ?? row.districtCurQty ?? 0;
    const usualPerDay = hit?.dailyAvgQty ?? row.districtDailyAvgQty ?? 0;

    // Resolve BP Target from:
    // 1. bpIndex lookup by state||district
    // 2. bpIndex lookup by district alone
    // 3. row.bpTarget (from visits_intelligence.json)
    const stDtKey = salesKey(row.state, row.district);
    const dtOnlyKey = normalizeDistrict(row.district || '', row.state || '').toUpperCase().replace(/\s+/g, '');
    const bpTarget =
      (bpIndex && stDtKey && bpIndex.get(stDtKey)) ||
      (bpIndex && dtOnlyKey && bpIndex.get(dtOnlyKey)) ||
      row.bpTarget ||
      0;

    const hasBpTarget = bpTarget > 0;
    const target = hasBpTarget ? bpTarget : (elapsedDays > 0 ? Math.round(usualPerDay * elapsedDays * 100) / 100 : null);

    // Percentage of Business Plan target achieved so far:
    const salesAchievedPct = hasBpTarget
      ? Math.round((actual / bpTarget) * 1000) / 10
      : (target > 0 ? Math.round((actual / target) * 1000) / 10 : null);

    // District pace:
    // If BP target is present, evaluate whether actual despatch is on track
    // for elapsed cycle days (prorated over 30-day month):
    const daysInMonth = 30;
    const proratedBpTarget = hasBpTarget && elapsedDays > 0 ? (bpTarget * (elapsedDays / daysInMonth)) : bpTarget;

    let paceStatus = 'UNKNOWN';
    if (hit || row.salesMatched) {
      if (hasBpTarget) {
        paceStatus = actual >= proratedBpTarget ? 'AHEAD' : 'BEHIND';
      } else {
        paceStatus = hit?.lossFlag || (actual >= (target ?? 0) ? 'AHEAD' : 'BEHIND');
      }
    }

    return {
      ...row,
      salesMatched: Boolean(hit || row.salesMatched),
      districtPaceStatus: paceStatus,
      salesActual: actual,
      salesTarget: target,
      bpTarget: hasBpTarget ? bpTarget : null,
      salesUsualPerDay: usualPerDay,
      salesAchievedPct,
      elapsedDays: elapsedDays || 7,
    };
  });
}

/** Average calls per fabricator: 180 visits across 174 people is not 180 across 71. */
export function visitsPerFabricator(row) {
  const visits = row?.curFabricatorVisits ?? 0;
  const people = row?.curUniqueFabricators ?? 0;
  if (people <= 0) return null;
  return Math.round((visits / people) * 10) / 10;
}

/** Filter predicate shared by every view, so the tabs cannot disagree. */
export function matchesFilters(row, { state, quadrant, query }, fields) {
  if (state && state !== 'ALL' && row.state !== state) return false;
  if (quadrant && quadrant !== 'ALL' && row.quadrant !== quadrant) return false;
  if (query) {
    const q = query.toLowerCase();
    const hit = fields.some(f => {
      const val = row[f];
      if (Array.isArray(val)) {
        return val.some(item => (typeof item === 'object' ? item.name : item)?.toLowerCase().includes(q));
      }
      return String(val ?? '').toLowerCase().includes(q);
    });
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

  if (!state || state === 'ALL') {
    // Everything except the group counts is carried through from the payload.
    // The counts are recounted, because the quadrants are re-derived against
    // the Business Plan after the parser has written them — returning
    // `data.summary` whole would leave the five cards describing a
    // classification the table no longer uses.
    const all = data.dealers || [];
    const tally = Object.fromEntries(QUADRANT_ORDER.map(k => [k, 0]));
    all.forEach(d => { if (tally[d.quadrant] !== undefined) tally[d.quadrant] += 1; });

    return {
      ...data.summary,
      growthDriversCount: tally.GROWTH_DRIVER,
      redFlagsCount: tally.RED_FLAG,
      neglectedCount: tally.NEGLECTED,
      organicChampionsCount: tally.ORGANIC,
      noSalesLinkCount: tally.NO_SALES_LINK,
    };
  }

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
