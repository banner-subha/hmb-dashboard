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

/** Never walk further than three years of plan months. */
const MAX_PLAN_MONTHS = 36;

/**
 * The newest month that has a plan — one request, and the only thing the rest
 * of the page has to wait for.
 *
 * This is split out from `fetchPlanMonths` deliberately. Every section of the
 * tab needs a month before it can ask for anything, so whatever discovers the
 * month sits alone on the critical path. The full distinct-month walk costs a
 * round trip per month plus one to prove there are no more; putting that in
 * front of the first paint added most of a second to a page whose queries
 * take the database about 20ms each. The dropdown can fill in afterwards.
 */
export async function fetchLatestPlanMonth() {
  return cached('latestPlanMonth', async () => {
    const { data, error } = await supabase
      .from('business_plan')
      .select('plan_month')
      .not('plan_month', 'is', null)
      .order('plan_month', { ascending: false })
      .limit(1);

    if (error) throw new Error(`business_plan months: ${error.message}`);
    return data?.length ? toPlanMonth(data[0].plan_month) : null;
  });
}

/**
 * Every month that has a plan, newest first — for the month dropdown.
 *
 * There is no RPC for this and PostgREST has no DISTINCT, so this walks the
 * distinct values with a keyset scan: one row at a time, each time asking for
 * the smallest `plan_month` greater than the last. That is a handful of tiny
 * requests instead of pulling all ~2,000 plan rows to read one column, and
 * unlike a bulk select it cannot be truncated by the API's row cap into a list
 * that silently misses a month. Nothing blocks on it — the page is already
 * showing the latest month's figures while this resolves.
 */
export async function fetchPlanMonths() {
  return cached('planMonths', async () => {
    const months = [];
    let cursor = null;

    for (let i = 0; i < MAX_PLAN_MONTHS; i += 1) {
      let q = supabase
        .from('business_plan')
        .select('plan_month')
        .not('plan_month', 'is', null)
        .order('plan_month', { ascending: true })
        .limit(1);

      if (cursor) q = q.gt('plan_month', cursor);

      const { data, error } = await q;
      if (error) throw new Error(`business_plan months: ${error.message}`);
      if (!data || data.length === 0) break;

      cursor = data[0].plan_month;
      const normalised = toPlanMonth(cursor);
      if (normalised && !months.includes(normalised)) months.push(normalised);
    }

    return months.sort((a, b) => b.localeCompare(a));
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
export async function fetchDimensionValues(dimension, { month, state, district } = {}) {
  const rows = await queryBusinessPlan({
    dimensions: [dimension],
    month,
    // Districts and reps are scoped by the territory already chosen, so the
    // dropdowns cascade instead of listing every district in the country.
    state: dimension === 'state' ? null : state,
    district: dimension === 'state' || dimension === 'district' ? null : district,
    limit: API_PAGE_SIZE,
    sort: 'group_asc',
  });

  return rows
    .map((r) => r.grp?.[dimension])
    .filter((v) => v != null && String(v).trim() !== '')
    .map(String)
    .sort((a, b) => a.localeCompare(b));
}
