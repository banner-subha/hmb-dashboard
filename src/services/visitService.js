import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Thin, typed-by-convention wrappers over PostgreSQL Field Visit RPCs.
//
// All heavy lifting and two-period aggregations across 321k+ records are
// executed in Postgres with btree date and geo indexes.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const comparisonCache = new Map();
const inFlight = new Map();

/** Strip empty strings, 'ALL', or nulls */
const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s === 'ALL' ? null : s;
};

function unwrap(result, fnName) {
  const { data, error } = result;
  if (error) {
    const detail = [error.message, error.hint, error.details].filter(Boolean).join(' — ');
    const err = new Error(`${fnName}: ${detail || 'request failed'}`);
    err.code = error.code;
    throw err;
  }
  return data;
}

// The dashboard queries as `anon`, which Postgres cancels after 3s. The
// comparison normally finishes in about a second, but while the ingest
// refresh jobs are running on this instance it can cross that line, so a
// timeout (57014) or a dropped connection is retried before it reaches the
// user.
const RETRY_DELAYS_MS = [700, 1800];
const isTransient = err =>
  err?.code === '57014' || /statement timeout|failed to fetch|network/i.test(err?.message || '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Month key one year back: '2026-09' -> '2025-09'. The comparison's default benchmark. */
export function priorYearPeriod(ym) {
  if (!ym) return null;
  const [y, m] = ym.split('-');
  return `${Number(y) - 1}-${m}`;
}

/**
 * Fetch available years and months from public.field_visits.
 * Returns: { years: ['2026', '2025'], by_year: { '2026': [{ month, visits }] }, latest_month: '2026-09' }
 *
 * Through cachedComparison, so it shares the 5-minute cache, the in-flight
 * sharing and the timeout retries of the other visit RPCs. It had its own
 * cache with no retry, and failed on most page loads until migration 029
 * made the RPC cheap.
 */
export async function fetchVisitsCalendar() {
  return cachedComparison('calendar', 'get_visits_calendar', {}, data => Array.isArray(data?.years));
}

/**
 * Compare field visits between two periods (e.g. '2026-08' vs '2025-08' or '2026-08' vs '2026-07')
 * with optional state and district scoping.
 *
 * District scoping is applied by the RPC, not here. Everything but the
 * districts list — the KPI figures, the sales team rows, the customer-type
 * mix — is aggregated server side, so a district narrowed in the browser
 * would leave three of the four breakdowns showing state-wide numbers.
 * Migration 012 added `p_district` for exactly this reason.
 */
export async function compareVisitsPeriods({ periodA, periodB, state = null, district = null }) {
  if (!periodA || !periodB) {
    throw new Error('Both periodA and periodB are required (format: YYYY-MM)');
  }

  const cleanState = clean(state);
  const cleanDistrict = clean(district);
  return cachedComparison(
    `comp:${periodA}:${periodB}:${cleanState || 'ALL'}:${cleanDistrict || 'ALL'}`,
    'compare_visits_periods',
    { p_period_a: periodA, p_period_b: periodB, p_state: cleanState, p_district: cleanDistrict }
  );
}

/**
 * Same comparison over any two date ranges (inclusive 'YYYY-MM-DD'), for the
 * week view. Output matches compareVisitsPeriods except period_a / period_b,
 * which read 'from..to'.
 */
export async function compareVisitsRanges({ a, b, state = null, district = null }) {
  if (!a?.from || !a?.to || !b?.from || !b?.to) {
    throw new Error('Both ranges need a from and a to date (format: YYYY-MM-DD)');
  }

  const cleanState = clean(state);
  const cleanDistrict = clean(district);
  return cachedComparison(
    `rng:${a.from}:${a.to}:${b.from}:${b.to}:${cleanState || 'ALL'}:${cleanDistrict || 'ALL'}`,
    'compare_visits_ranges',
    {
      p_a_from: a.from, p_a_to: a.to,
      p_b_from: b.from, p_b_to: b.to,
      p_state: cleanState, p_district: cleanDistrict,
    }
  );
}

/**
 * Fabricators visited in one district over an inclusive date range, with the
 * reps who visited each: { total_visits, fabricators: [{ name, visits,
 * first_visit, last_visit, city, pincode, reps: [{ name, visits }] }] }.
 * An empty district means "not recorded".
 */
export async function fetchDistrictFabricators({ from, to, state, district }) {
  if (!from || !to || !state) {
    throw new Error('A state and both dates are needed (format: YYYY-MM-DD)');
  }
  const d = String(district ?? '').trim();
  return cachedComparison(
    `fab:${from}:${to}:${state}:${d}`,
    'query_district_fabricators',
    { p_from: from, p_to: to, p_state: state, p_district: d },
    data => Array.isArray(data?.fabricators)
  );
}

/**
 * The Visits page's visit figures for an inclusive range, and for the equally
 * long period before it: { from, to, prev_from, prev_to, days, kpi, districts,
 * reps }. At most 93 days; see migration 024.
 */
export async function fetchVisitsRange({ from, to, state = null }) {
  if (!from || !to) {
    throw new Error('A range needs a from and a to date (format: YYYY-MM-DD)');
  }
  const cleanState = clean(state);
  return cachedComparison(
    `range:${from}:${to}:${cleanState || 'ALL'}`,
    'query_visits_range',
    { p_from: from, p_to: to, p_state: cleanState },
    data => Boolean(data?.kpi)
  );
}

/**
 * Dealers with a 'new lead' visit in an inclusive range (at most 93 days):
 * [{ key, new_lead_visits, first_lead }], key as dealerNameKey in utils/visits.
 */
export async function fetchNewLeadDealers({ from, to }) {
  if (!from || !to) throw new Error('A range needs a from and a to date (format: YYYY-MM-DD)');
  return cachedComparison(`leads:${from}:${to}`, 'query_new_lead_dealers',
    { p_from: from, p_to: to }, data => Array.isArray(data));
}

const hasVisits = data => data && (data.kpi_a?.total_visits > 0 || data.kpi_b?.total_visits > 0);

/**
 * Cache, in-flight sharing and timeout retries for the visit RPCs. shouldCache
 * decides whether a response is kept; the comparisons skip empty ones.
 */
function cachedComparison(cacheKey, fnName, params, shouldCache = hasVisits) {
  const cached = comparisonCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const promise = (async () => {
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await supabase.rpc(fnName, params);
          const data = unwrap(res, fnName);
          if (shouldCache(data)) {
            comparisonCache.set(cacheKey, { data, timestamp: Date.now() });
          }
          return data;
        } catch (err) {
          if (!isTransient(err)) throw err;
          if (attempt >= RETRY_DELAYS_MS.length) {
            throw new Error('The visits database is busy with a data refresh. Please retry in a minute.', { cause: err });
          }
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

export function clearComparisonCache() {
  comparisonCache.clear();
}

/**
 * Warm the calendar and the Comparison tab's opening view (Period A against
 * the same month last year) so the tab opens from cache. Failures are
 * swallowed: the tab makes the same calls itself and shows its own error.
 */
export function prefetchDefaultComparison(periodA, state = null) {
  fetchVisitsCalendar().catch(() => {});
  compareVisitsPeriods({ periodA, periodB: priorYearPeriod(periodA), state }).catch(() => {});
}
