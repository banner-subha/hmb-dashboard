import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Thin, typed-by-convention wrappers over PostgreSQL Field Visit RPCs.
//
// All heavy lifting and two-period aggregations across 321k+ records are
// executed in Postgres with btree date and geo indexes.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const calendarCache = { data: null, timestamp: 0 };
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
 * Returns: { years: ['2026', '2025'], by_year: { '2026': [...], '2025': [...] }, latest_month: '2026-09' }
 */
export async function fetchVisitsCalendar() {
  const now = Date.now();
  if (calendarCache.data && now - calendarCache.timestamp < CACHE_TTL_MS) {
    return calendarCache.data;
  }

  if (inFlight.has('calendar')) {
    return inFlight.get('calendar');
  }

  const promise = (async () => {
    try {
      const res = await supabase.rpc('get_visits_calendar');
      const data = unwrap(res, 'get_visits_calendar');
      calendarCache.data = data;
      calendarCache.timestamp = Date.now();
      return data;
    } finally {
      inFlight.delete('calendar');
    }
  })();

  inFlight.set('calendar', promise);
  return promise;
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

/** Cache, in-flight sharing and timeout retries for both comparison RPCs. */
function cachedComparison(cacheKey, fnName, params) {
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
          if (data && (data.kpi_a?.total_visits > 0 || data.kpi_b?.total_visits > 0)) {
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
