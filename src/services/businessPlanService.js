import { supabase } from './supabaseClient';
import { toPlanMonth } from '../utils/businessPlan';

// ─────────────────────────────────────────────────────────────────────────────
// Thin, typed-by-convention wrappers over the three business-plan RPCs.
//
// Every aggregate is computed in Postgres. Nothing in this file re-adds,
// re-averages or re-derives a number the database already returned — the UI
// renders exactly what the RPC produced, which is the only way the tab and a
// SQL console can be expected to agree.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip empty strings and nulls so PostgREST gets `null`, not `''`. */
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
  return Array.isArray(data) ? data : data == null ? [] : [data];
}

/**
 * The hard ceiling PostgREST puts on any single response.
 *
 * The RPCs happily return more than this — the dealer view of plan vs. actual
 * is ~1,900 rows — but the API truncates the response at 1,000 and says
 * nothing about it. Asking for more in `p_limit` alone therefore produces a
 * quietly short table, which is exactly the failure a dashboard must not have.
 */
const API_PAGE_SIZE = 1000;

/**
 * Call a set-returning RPC and page past the API's response ceiling.
 *
 * The pages are requested *together*, not one after the next. Postgres does
 * about 20ms of work per call here; the rest of a request is a round trip to
 * us-east-1, which measures around 400ms. Fetching serially therefore doubles
 * the wait for the two views that exceed the ceiling (customer, ~1,950 rows;
 * dealer, ~1,920) to buy nothing, since the row ceilings are set such that
 * this is at most two requests. A second page that comes back empty costs one
 * cheap round trip that overlapped the first anyway.
 *
 * Paging is by offset over the ordering the function itself applied, so rows
 * arrive in the order the RPC chose. Ties at a page boundary could in
 * principle repeat a group across two pages, so groups are de-duplicated on
 * the way out; a repeated row would otherwise be counted twice by anything
 * that totals the result.
 */
async function rpcPaged(fnName, params, limit) {
  const offsets = [];
  for (let offset = 0; offset < limit; offset += API_PAGE_SIZE) offsets.push(offset);

  const pages = await Promise.all(
    offsets.map((offset) => {
      const size = Math.min(API_PAGE_SIZE, limit - offset);
      return supabase
        .rpc(fnName, params)
        .range(offset, offset + size - 1)
        .then((res) => unwrap(res, fnName));
    })
  );

  const rows = [];
  const seen = new Set();
  pages.forEach((page) => {
    page.forEach((row) => {
      const id = JSON.stringify(row.grp ?? null);
      if (seen.has(id)) return;
      seen.add(id);
      rows.push(row);
    });
  });

  return rows;
}

// ── Request cache ────────────────────────────────────────────────────────────

/**
 * How long a response stays reusable. The plan is a monthly artefact that is
 * uploaded, not edited through the day, so a few minutes of reuse costs
 * nothing in freshness and removes every repeated round trip from switching
 * views, stepping a filter back, or leaving the tab and returning to it.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

const responseCache = new Map();
const inFlight = new Map();

/**
 * Memoise one request by key, and collapse concurrent callers onto a single
 * one.
 *
 * The de-duplication matters as much as the caching: the page asks for the
 * state grouping of plan-vs-actual from two places at once (the table and the
 * totals strip), and several filter combinations resolve to a request another
 * section has already issued this render.
 */
function cached(key, producer) {
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.value);

  const live = inFlight.get(key);
  if (live) return live;

  const pending = producer()
    .then((value) => {
      responseCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, pending);
  return pending;
}

/** Drop everything memoised — what "Try Again" and a manual refresh mean. */
export function clearBusinessPlanCache() {
  responseCache.clear();
  inFlight.clear();
}

/**
 * `public.query_business_plan`.
 *
 * `dimensions: []` returns the single national summary row; anything else
 * returns one row per group.
 */
export async function queryBusinessPlan({
  dimensions = [],
  month,
  state,
  district,
  customer,
  kro,
  krm,
  product,
  planStatus,
  krmStatus,
  limit = 50,
  sort = 'sp_target_desc',
} = {}) {
  const params = {
    p_dimensions: dimensions,
    p_month: toPlanMonth(month),
    p_state: clean(state),
    p_district: clean(district),
    p_customer: clean(customer),
    p_kro: clean(kro),
    p_krm: clean(krm),
    p_product: clean(product),
    p_plan_status: clean(planStatus),
    p_krm_status: clean(krmStatus),
    p_limit: limit,
    p_sort: sort,
  };

  return cached(`plan:${JSON.stringify(params)}`, () =>
    rpcPaged('query_business_plan', params, limit)
  );
}

/**
 * `public.query_business_plan_vs_actual`.
 *
 * Note the server-side shape of this one: it accepts `p_kro` / `p_krm` but
 * only applies state, district and dealer to either side of the join, so the
 * caller must not present a rep filter as if it narrowed this section. The
 * page states that limitation in the UI rather than passing a filter that
 * would be silently ignored.
 */
export async function queryBusinessPlanVsActual({
  dimensions = ['state'],
  month,
  state,
  district,
  dealer,
  limit = 50,
  sort = 'variance_asc',
} = {}) {
  const params = {
    p_dimensions: dimensions,
    p_month: toPlanMonth(month),
    p_state: clean(state),
    p_district: clean(district),
    p_dealer: clean(dealer),
    p_limit: limit,
    p_sort: sort,
  };

  return cached(`actual:${JSON.stringify(params)}`, () =>
    rpcPaged('query_business_plan_vs_actual', params, limit)
  );
}

/**
 * `public.business_plan_value_exists` — used to validate a typed-in filter
 * before it is applied, so a typo shows "no match" instead of an empty table.
 *
 * The deployed signature is `(p_dimension, p_input)`; the spec document names
 * the arguments `(p_field, p_value)`. The deployed names are what PostgREST
 * matches on, so those are what this sends.
 */
export async function businessPlanValueExists(dimension, value) {
  const v = clean(value);
  if (!v) return true;
  const { data, error } = await supabase.rpc('business_plan_value_exists', {
    p_dimension: dimension,
    p_input: v,
  });
  if (error) return true; // never block the user on a validation call
  return data === true;
}

/**
 * The newest month that has a plan — the first thing every other section waits
 * for.
 *
 * Read from the month list rather than from `business_plan` directly. RLS on
 * that table is deny-all for client roles by design — access goes through the
 * SECURITY DEFINER RPCs — so the direct `.from('business_plan')` select this
 * used to run returned zero rows and, worse, zero rows is not an error: it
 * resolved to null and the page quietly fell back to a hard-coded month.
 *
 * The round trip this used to save no longer exists either. `get_plan_months()`
 * resolves every month in one call, so the list is as cheap as the latest, and
 * `cached` collapses the two callers onto a single in-flight request.
 */
export async function fetchLatestPlanMonth() {
  const months = await fetchPlanMonths();
  return months[0] ?? null;
}

/**
 * Every month that has a plan, newest first — for the month dropdown, and the
 * source of the selected month.
 *
 * `get_plan_months()` resolves all distinct plan months in one round trip. It
 * must be SECURITY DEFINER to do so: `business_plan` carries RLS with no
 * policies, so an invoker-rights function reads it as the caller, matches
 * nothing and returns an empty array — which is what emptied this dropdown
 * while the rest of the page, served by the SECURITY DEFINER
 * `query_business_plan`, showed real figures.
 *
 * A genuine failure throws rather than resolving empty. The silent empty array
 * that used to come back here was indistinguishable from "this database has no
 * plans", and the caller cannot tell a broken page from an empty one.
 */
export async function fetchPlanMonths() {
  return cached('planMonths', async () => {
    const { data, error } = await supabase.rpc('get_plan_months');
    if (error) throw new Error(`business_plan months: ${error.message}`);

    return (Array.isArray(data) ? data : [])
      .map(toPlanMonth)
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a));
  });
}

/**
 * The distinct values of one dimension for a month, for the filter dropdowns.
 *
 * Built from `query_business_plan` itself rather than a second query path, so
 * a filter can never offer a value the table would then find nothing for.
 * Cardinality here is small — 14 states, 167 districts, 34 reps, 8 managers —
 * so the limit is one API page: asking for more would only add round trips
 * fetching pages that come back empty.
 */
export async function fetchDimensionValues(dimension, { month, state, district, kro, krm } = {}) {
  const rows = await queryBusinessPlan({
    dimensions: [dimension],
    month,
    // Districts, reps, and regional managers are scoped by the territory and hierarchy chosen,
    // so all dropdowns cascade instead of listing options outside the active scope.
    state: dimension === 'state' ? null : state,
    district: dimension === 'state' || dimension === 'district' ? null : district,
    kro: dimension === 'state' || dimension === 'kro' ? null : kro,
    krm: dimension === 'state' || dimension === 'krm' ? null : krm,
    limit: API_PAGE_SIZE,
    sort: 'group_asc',
  });

  return rows
    .map((r) => r.grp?.[dimension])
    .filter((v) => {
      if (v == null) return false;
      const str = String(v).trim();
      if (str === '') return false;
      if (str.toUpperCase() === 'UNASSIGNED') return false;
      return true;
    })
    .map(String)
    .sort((a, b) => a.localeCompare(b));
}
