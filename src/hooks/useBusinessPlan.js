import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  queryBusinessPlan,
  queryBusinessPlanVsActual,
  fetchLatestPlanMonth,
  fetchPlanMonths,
  clearBusinessPlanCache,
} from '../services/businessPlanService';
import {
  BP_DIMENSIONS,
  normalizePlanRow,
  normalizeProductRow,
  normalizeActualRow,
  num,
  numOrNull,
} from '../utils/businessPlan';

// Row ceilings per view. The RPC refuses anything over 5,000 and silently
// falls back to 100, so these stay well inside that. Customer and dealer views
// pull the whole slice and paginate in the browser, which keeps sorting a
// client-side operation over a complete set rather than over page one.
const ROW_LIMIT = { customer: 2000, dealer: 2000, default: 500 };
const limitFor = (dimension) => ROW_LIMIT[dimension] ?? ROW_LIMIT.default;

/** How long the customer box waits after the last keystroke before querying. */
const CUSTOMER_DEBOUNCE_MS = 350;

const EMPTY_FILTERS = {
  state: '',
  district: '',
  kro: '',
  krm: '',
  product: '',
  planStatus: '',
  krmStatus: '',
  customer: '',
};

/**
 * Runs an async producer whenever `depKey` changes and keeps only the newest
 * result.
 *
 * Every control on this page (month, eight filters, two view switchers)
 * re-fires requests, so out-of-order responses are the default failure mode,
 * not an edge case: change a filter twice quickly and the slower first
 * response would otherwise land last and repaint the table with the previous
 * filter's numbers. The ticket check drops anything that is no longer current.
 *
 * `depKey` is a string rather than a dependency array so the identity of the
 * producer closure — recreated on every render — never triggers a refetch.
 */
function useLatest(producer, depKey, { initial = null, enabled = true } = {}) {
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Identifies one particular run. `reload` bumps the nonce so asking for the
  // same data again is a different run, not a no-op.
  const runKey = `${depKey}#${nonce}`;

  // `settledFor` is the runKey whose result `data` holds. Loading is derived
  // from it rather than stored, which keeps the effect free of a synchronous
  // setState and makes a stale-then-fresh flicker impossible: the previous
  // numbers stay on screen, marked as loading, until the new ones land.
  const [state, setState] = useState({ settledFor: null, data: initial, error: null });
  const seq = useRef(0);
  const producerRef = useRef(producer);

  // Declared before the fetching effect on purpose: effects run in declaration
  // order, so the ref already holds this render's closure by the time the
  // effect below reads it.
  useEffect(() => {
    producerRef.current = producer;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const ticket = ++seq.current;
    let live = true;

    Promise.resolve()
      .then(() => producerRef.current())
      .then((result) => {
        if (!live || ticket !== seq.current) return;
        setState({ settledFor: runKey, data: result, error: null });
      })
      .catch((err) => {
        if (!live || ticket !== seq.current) return;
        setState((prev) => ({
          settledFor: runKey,
          data: prev.data,
          error: err?.message || 'Request failed',
        }));
      });

    return () => {
      live = false;
    };
    // runKey is derived from depKey and nonce, so listing those is the same
    // dependency set without re-running on an unchanged string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, enabled, nonce]);

  return {
    data: state.data,
    error: state.error,
    // While disabled nothing is in flight, so the section is not "loading" —
    // it is waiting on a prerequisite the caller reports separately.
    loading: enabled && state.settledFor !== runKey,
    reload: refresh,
  };
}

/**
 * Everything the Business Plan tab reads, in one place.
 *
 * Each section is its own request against its own RPC shape rather than one
 * fetch sliced five ways, because the aggregates genuinely differ: the KPI row
 * is an ungrouped roll-up, the product grid is an unpivot, and plan-vs-actual
 * joins a second table. Deriving any of them from another in JavaScript would
 * produce numbers the database never agreed to.
 */
export function useBusinessPlan() {
  const [monthChoice, setMonthChoice] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedCustomer, setDebouncedCustomer] = useState('');
  const [dimension, setDimension] = useState(BP_DIMENSIONS[0].key);
  const [dimensionSort, setDimensionSort] = useState('sp_target_desc');

  // ── Months ────────────────────────────────────────────────────────────────
  //
  // Both of these now resolve from one `get_plan_months()` round trip, which
  // the service layer caches — the latest month is simply the head of the
  // list. They stay as two queries because the latest is what gates every
  // other section, and the error and loading flags below are wired to it.
  const latestMonthQuery = useLatest(() => fetchLatestPlanMonth(), 'latestMonth');
  const monthsQuery = useLatest(() => fetchPlanMonths(), 'months', { initial: [] });

  const latestMonth = latestMonthQuery.data ?? null;
  // Memoised for identity, not for cost: this array is a prop of the memoised
  // filter bar, and a fresh [] each render would defeat that.
  const months = useMemo(() => monthsQuery.data || [], [monthsQuery.data]);

  /**
   * The month in force, derived rather than stored.
   *
   * Nothing is pinned to August 2026: the newest month that has a plan is the
   * default, and an explicit choice only holds while that month still exists
   * in the list — so a stale selection cannot leave the page querying a month
   * the database no longer has.
   *
   * It resolves to null rather than to a hard-coded month when there is no
   * list. A literal '2026-08' here is what hid an RLS fault that emptied both
   * month lookups: the dropdown read "No plan months" while every figure below
   * it loaded, because the default happened to name the one month the table
   * held. A page with no month must query nothing and say so.
   */
  const month = useMemo(() => {
    if (monthChoice && months.includes(monthChoice)) return monthChoice;
    return latestMonth ?? months[0] ?? null;
  }, [monthChoice, months, latestMonth]);

  const ready = Boolean(month);

  // ── Filters ───────────────────────────────────────────────────────────────
  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      if (prev[key] === value) return prev;
      const next = { ...prev, [key]: value };
      // A district only means something inside its state, and a rep only
      // inside their territory — clearing the parent has to clear the child
      // or the table silently returns nothing.
      if (key === 'state') {
        next.district = '';
        next.kro = '';
        next.krm = '';
      }
      if (key === 'district') {
        next.kro = '';
      }
      if (key === 'krm') {
        next.kro = '';
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setDebouncedCustomer('');
  }, []);

  // The customer box is a free-text server-side match, so it is the one filter
  // that must not fire per keystroke. The typed value stays instant in the
  // input; only this debounced copy reaches the RPC.
  useEffect(() => {
    if (filters.customer === debouncedCustomer) return undefined;
    const t = setTimeout(() => setDebouncedCustomer(filters.customer.trim()), CUSTOMER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filters.customer, debouncedCustomer]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v !== '').length,
    [filters]
  );

  const filterArgs = useMemo(
    () => ({
      month,
      state: filters.state,
      district: filters.district,
      kro: filters.kro,
      krm: filters.krm,
      product: filters.product,
      planStatus: filters.planStatus,
      krmStatus: filters.krmStatus,
      customer: debouncedCustomer,
    }),
    [
      month,
      filters.state,
      filters.district,
      filters.kro,
      filters.krm,
      filters.product,
      filters.planStatus,
      filters.krmStatus,
      debouncedCustomer,
    ]
  );

  const filterKey = JSON.stringify(filterArgs);

  // ── KPI summary — the ungrouped national (or filtered) roll-up ────────────
  const summaryQuery = useLatest(
    async () => {
      const rows = await queryBusinessPlan({ ...filterArgs, dimensions: [], limit: 1 });
      return rows.length ? normalizePlanRow(rows[0], null) : null;
    },
    `summary:${filterKey}`,
    { enabled: ready }
  );

  // ── Product mix ───────────────────────────────────────────────────────────
  const productsQuery = useLatest(
    async () => {
      const rows = await queryBusinessPlan({
        ...filterArgs,
        dimensions: ['product'],
        limit: 50,
        sort: 'sp_target_desc',
      });
      return rows.map(normalizeProductRow).filter(Boolean);
    },
    `products:${filterKey}`,
    { initial: [], enabled: ready }
  );

  // ── Dimensional table ─────────────────────────────────────────────────────
  const dimensionMeta = useMemo(
    () => BP_DIMENSIONS.find((d) => d.key === dimension) || BP_DIMENSIONS[0],
    [dimension]
  );

  const dimensionQuery = useLatest(
    async () => {
      const isActualSupported = ['state', 'district', 'customer'].includes(dimensionMeta.key);
      const actualDim = dimensionMeta.key === 'customer' ? 'dealer' : dimensionMeta.key;

      const [rows, actualRows] = await Promise.all([
        queryBusinessPlan({
          ...filterArgs,
          dimensions: [dimensionMeta.key],
          limit: limitFor(dimensionMeta.key),
          sort: dimensionSort,
        }),
        isActualSupported
          ? queryBusinessPlanVsActual({
              dimensions: [actualDim],
              month,
              state: filters.state,
              district: filters.district,
              dealer: actualDim === 'dealer' ? debouncedCustomer : '',
              limit: limitFor(dimensionMeta.key),
              sort: 'variance_asc',
            }).catch((err) => {
              console.warn('Failed to fetch actuals for dimension:', err);
              return [];
            })
          : Promise.resolve([]),
      ]);

      const actualMap = new Map();
      if (isActualSupported && Array.isArray(actualRows)) {
        for (const ar of actualRows) {
          const rawKey = ar.grp?.[actualDim] ?? ar.grp?.dealer ?? ar.grp?.state ?? ar.grp?.district;
          if (rawKey != null) {
            actualMap.set(String(rawKey).trim().toUpperCase(), ar);
          }
        }
      }

      const normalized = rows
        .map((r) => {
          const norm = normalizePlanRow(r, dimensionMeta.grpKey);
          if (!norm) return null;
          if (isActualSupported) {
            const lookupKey = String(norm.key ?? norm.label ?? '').trim().toUpperCase();
            const actualObj = actualMap.get(lookupKey);
            if (actualObj) {
              norm.despatch = num(actualObj.actual_despatch);
              norm.shortfallGap = num(actualObj.variance ?? (norm.despatch - norm.spTarget));
              norm.activeDealers = num(actualObj.active_dealers);
              norm.bpDealers = num(actualObj.bp_dealers);
              norm.coveragePct = numOrNull(actualObj.coverage_pct);
            } else {
              norm.despatch = 0;
              norm.shortfallGap = -norm.spTarget;
              norm.activeDealers = 0;
              norm.bpDealers = norm.customers || 0;
              norm.coveragePct = 0;
            }
            norm.achievementPct = norm.spTarget > 0 ? (norm.despatch / norm.spTarget) * 100 : null;
          } else {
            norm.despatch = null;
            norm.shortfallGap = null;
            norm.achievementPct = null;
            norm.activeDealers = null;
            norm.bpDealers = null;
            norm.coveragePct = null;
          }
          return norm;
        })
        .filter(Boolean);

      // For Regional Manager (KRM), omit the unassigned 0-target boundary row so the breakdown strictly lists active managers
      if (dimensionMeta.key === 'krm') {
        return normalized.filter((r) => r.key !== 'UNASSIGNED' && (r.spTarget > 0 || r.potential > 0));
      }
      return normalized;
    },
    `dimension:${dimensionMeta.key}:${dimensionSort}:${filterKey}`,
    { initial: [], enabled: ready }
  );

  /**
   * Totals for the plan-vs-actual header.
   *
   * Always over the state grouping, whichever view is on screen. The RPC has
   * no ungrouped mode, and states are the one grouping guaranteed to be
   * complete — 14 rows, never near the row ceiling — so summing them gives the
   * same total the district and dealer groupings describe, without the risk of
   * adding up a dealer list that was cut off at the limit.
   *
   * Its parameters match the state table's actuals request exactly (same
   * sort, same limit), so while the state view is open the service collapses
   * the two onto one round trip. The sort does not affect a sum.
   */
  const actualTotalsQuery = useLatest(
    async () => {
      const rows = await queryBusinessPlanVsActual({
        dimensions: ['state'],
        month,
        state: filters.state,
        district: filters.district,
        dealer: debouncedCustomer,
        limit: limitFor('state'),
        sort: 'variance_asc',
      });
      return rows.map((r) => normalizeActualRow(r, 'state'));
    },
    `actualTotals:${month}:${filters.state}:${filters.district}:${debouncedCustomer}`,
    { initial: [], enabled: ready }
  );

  const actualTotals = useMemo(
    () =>
      (actualTotalsQuery.data || []).reduce(
        (acc, r) => ({
          spTarget: acc.spTarget + r.spTarget,
          potential: acc.potential + r.potential,
          actual: acc.actual + r.actual,
          bpDealers: acc.bpDealers + r.bpDealers,
          activeDealers: acc.activeDealers + r.activeDealers,
        }),
        { spTarget: 0, potential: 0, actual: 0, bpDealers: 0, activeDealers: 0 }
      ),
    [actualTotalsQuery.data]
  );

  // ── Filter options, cascading with the territory already chosen ───────────
  //
  // One request per month, not four per filter change. Every territory
  // combination the plan holds (~300 rows for a month) comes back once, and the
  // cascade is a filter over that set in the browser. The old per-change
  // lookups put three extra RPCs in flight beside the four that draw the page
  // each time a state or district was picked, and on this database that
  // contention, not query cost, is what made each filter take seconds.
  //
  // jr_kro is carried because the server's KRO filter matches a junior KRO as
  // well, so the district and KRM lists must narrow the same way.
  const comboQuery = useLatest(
    () =>
      queryBusinessPlan({
        month,
        dimensions: ['state', 'district', 'kro', 'jr_kro', 'krm'],
        limit: 1000,
        sort: 'group_asc',
      }),
    `combos:${month}`,
    { initial: [], enabled: ready }
  );

  const options = useMemo(() => {
    const combos = (comboQuery.data || []).map((r) => r.grp || {});
    const usable = (v) => {
      if (v == null) return false;
      const t = String(v).trim().toUpperCase();
      return t !== '' && t !== 'UNASSIGNED' && t !== 'UNKNOWN';
    };
    const distinct = (list, key) =>
      [...new Set(list.map((g) => g[key]).filter(usable).map(String))].sort((x, y) => x.localeCompare(y));
    const is = (value, chosen) => !chosen || value === chosen;
    const repIs = (g, chosen) => !chosen || g.kro === chosen || g.jr_kro === chosen;

    const { state, district, kro, krm } = filters;
    return {
      states: distinct(combos, 'state'),
      districts: distinct(combos.filter((g) => is(g.state, state) && is(g.krm, krm) && repIs(g, kro)), 'district'),
      kros: distinct(combos.filter((g) => is(g.state, state) && is(g.district, district) && is(g.krm, krm)), 'kro'),
      krms: distinct(combos.filter((g) => is(g.state, state) && is(g.district, district) && repIs(g, kro)), 'krm'),
    };
  }, [comboQuery.data, filters]);

  const optionsLoading = comboQuery.loading;

  // Auto-prune any active selection that is no longer valid within the updated cascading options list
  useEffect(() => {
    if (optionsLoading) return;
    const { districts, kros, krms } = options;
    setFilters((prev) => {
      let changed = false;
      const next = { ...prev };
      if (prev.district && !districts.includes(prev.district)) {
        next.district = '';
        changed = true;
      }
      if (prev.kro && !kros.includes(prev.kro)) {
        next.kro = '';
        changed = true;
      }
      if (prev.krm && !krms.includes(prev.krm)) {
        next.krm = '';
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [options, optionsLoading]);

  const reloadLatestMonth = latestMonthQuery.reload;
  const reloadMonths = monthsQuery.reload;
  const reloadSummary = summaryQuery.reload;
  const reloadProducts = productsQuery.reload;
  const reloadDimension = dimensionQuery.reload;
  const reloadActualTotals = actualTotalsQuery.reload;
  const reloadOptions = comboQuery.reload;

  // Emptying the memo first is what makes this a refresh rather than a replay:
  // without it every section would be handed the response it already has.
  const reload = useCallback(() => {
    clearBusinessPlanCache();
    reloadLatestMonth();
    reloadMonths();
    reloadSummary();
    reloadProducts();
    reloadDimension();
    reloadActualTotals();
    reloadOptions();
  }, [
    reloadLatestMonth,
    reloadMonths,
    reloadSummary,
    reloadProducts,
    reloadDimension,
    reloadActualTotals,
    reloadOptions,
  ]);

  return {
    // month
    months,
    month,
    setMonth: setMonthChoice,
    monthsLoading: latestMonthQuery.loading,
    // Only the latest-month lookup can block the page. A failure of the
    // background walk costs the dropdown its other options, not the figures.
    monthsError: latestMonthQuery.error,

    // filters
    filters,
    setFilter,
    resetFilters,
    activeFilterCount,
    options,
    optionsLoading,

    // sections
    summary: summaryQuery.data,
    summaryLoading: summaryQuery.loading || !ready,
    summaryError: summaryQuery.error,

    products: productsQuery.data,
    productsLoading: productsQuery.loading || !ready,
    productsError: productsQuery.error,

    dimension,
    setDimension,
    dimensionMeta,
    dimensionSort,
    setDimensionSort,
    dimensionRows: dimensionQuery.data,
    dimensionLoading: dimensionQuery.loading || !ready,
    dimensionError: dimensionQuery.error,
    dimensionRowLimit: limitFor(dimensionMeta.key),

    actualTotals,
    actualTotalsLoading: actualTotalsQuery.loading || !ready,

    reload,
  };
}

export default useBusinessPlan;
