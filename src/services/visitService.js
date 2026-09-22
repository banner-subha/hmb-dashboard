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
    throw new Error(`${fnName}: ${detail || 'request failed'}`);
  }
  return data;
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
  const cacheKey = `comp:${periodA}:${periodB}:${cleanState || 'ALL'}:${cleanDistrict || 'ALL'}`;
  const now = Date.now();

  const cached = comparisonCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const res = await supabase.rpc('compare_visits_periods', {
        p_period_a: periodA,
        p_period_b: periodB,
        p_state: cleanState,
        p_district: cleanDistrict,
      });
      const data = unwrap(res, 'compare_visits_periods');
      comparisonCache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}
