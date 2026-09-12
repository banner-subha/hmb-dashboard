import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  queryBusinessPlan,
  queryBusinessPlanVsActual,
  fetchLatestPlanMonth,
  fetchPlanMonths,
  fetchDimensionValues,
  clearBusinessPlanCache,
} from '../services/businessPlanService';
import {
  BP_DIMENSIONS,
  BP_ACTUAL_DIMENSIONS,
  normalizePlanRow,
  normalizeProductRow,
  normalizeActualRow,
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
  const [actualDimension, setActualDimension] = useState(BP_ACTUAL_DIMENSIONS[0].key);
  const [actualSort, setActualSort] = useState('variance_asc');

  // ── Months ────────────────────────────────────────────────────────────────
  //
  // Two queries, on purpose. The latest month is one request and gates every
  // other section, so it is the only thing on the critical path; the full list
  // of months costs a round trip per month and exists solely to fill the
  // dropdown, so it resolves alongside the figures rather than ahead of them.
  const latestMonthQuery = useLatest(() => fetchLatestPlanMonth(), 'latestMonth');
  const monthsQuery = useLatest(() => fetchPlanMonths(), 'months', { initial: [] });

  const latestMonth = latestMonthQuery.data ?? null;

  const months = useMemo(() => {
    const list = monthsQuery.data || [];
    // Until the walk finishes, the dropdown still has to offer the month the
    // page is actually showing.
    if (list.length === 0 && latestMonth) return [latestMonth];
    return list;
  }, [monthsQuery.data, latestMonth]);

  /**
   * The month in force, derived rather than stored.
   *
   * Nothing is pinned to August 2026: the newest month that has a plan is the
   * default, and an explicit choice only holds while that month still exists
   * in the list — so a stale selection cannot leave the page querying a month
   * the database no longer has.
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
      }
      if (key === 'district') next.kro = '';
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
      const rows = await queryBusinessPlan({
        ...filterArgs,
        dimensions: [dimensionMeta.key],
        limit: limitFor(dimensionMeta.key),
        sort: dimensionSort,
      });
      const normalized = rows.map((r) => normalizePlanRow(r, dimensionMeta.grpKey)).filter(Boolean);
      // For Regional Manager (KRM), omit the unassigned 0-target boundary row so the breakdown strictly lists active managers
      if (dimensionMeta.key === 'krm') {
        return normalized.filter((r) => r.key !== 'UNASSIGNED' && (r.spTarget > 0 || r.potential > 0));
      }
      return normalized;
    },
    `dimension:${dimensionMeta.key}:${dimensionSort}:${filterKey}`,
    { initial: [], enabled: ready }
  );

  // ── Plan vs actual ────────────────────────────────────────────────────────
  const actualMeta = useMemo(
    () => BP_ACTUAL_DIMENSIONS.find((d) => d.key === actualDimension) || BP_ACTUAL_DIMENSIONS[0],
    [actualDimension]
  );

  // Only the filters this RPC actually applies. It accepts p_kro / p_krm but
  // uses neither, so passing them would look like a narrowed comparison while
  // returning the unfiltered one.
  const actualFilterKey = JSON.stringify({
    month,
    state: filters.state,
    district: filters.district,
    dealer: actualMeta.key === 'dealer' ? debouncedCustomer : '',
  });

  const actualQuery = useLatest(
    async () => {
      const rows = await queryBusinessPlanVsActual({
        dimensions: [actualMeta.key],
        month,
        state: filters.state,
        district: filters.district,
        // The dealer filter is only meaningful once the dealer view is open;
        // in the state and district views it would collapse the section to a
        // single row.
        dealer: actualMeta.key === 'dealer' ? debouncedCustomer : '',
        limit: limitFor(actualMeta.key),
        sort: actualSort,
      });
      return rows.map((r) => normalizeActualRow(r, actualMeta.grpKey)).filter(Boolean);
    },
    `actual:${actualMeta.key}:${actualSort}:${actualFilterKey}`,
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
   * When the state view is the one on screen those rows are already in hand,
   * so this fires only for the district and dealer views. Asking for them
   * again would be a second round trip for a set the page just received.
   */
  const needsOwnTotals = actualMeta.key !== 'state';

  const actualTotalsQuery = useLatest(
    async () => {
      const rows = await queryBusinessPlanVsActual({
        dimensions: ['state'],
        month,
        state: filters.state,
        district: filters.district,
        limit: 500,
        sort: 'target_desc',
      });
      return rows.map((r) => normalizeActualRow(r, 'state'));
    },
    `actualTotals:${month}:${filters.state}:${filters.district}`,
    { initial: [], enabled: ready && needsOwnTotals }
  );

  const totalsSource = needsOwnTotals ? actualTotalsQuery.data : actualQuery.data;

  const actualTotals = useMemo(
    () =>
      (totalsSource || []).reduce(
        (acc, r) => ({
          spTarget: acc.spTarget + r.spTarget,
          potential: acc.potential + r.potential,
          actual: acc.actual + r.actual,
          bpDealers: acc.bpDealers + r.bpDealers,
          activeDealers: acc.activeDealers + r.activeDealers,
        }),
        { spTarget: 0, potential: 0, actual: 0, bpDealers: 0, activeDealers: 0 }
      ),
    [totalsSource]
  );

  // ── Filter options, cascading with the territory already chosen ───────────
  //
  // Held back until the headline figures have settled. These four requests
  // fill dropdowns nobody has opened yet, and firing them alongside the six
  // that draw the page put ten requests in flight at once — enough contention
  // that the slowest of them, rather than the fastest, decided when the tab
  // looked ready.
  //
  // The gate is "the summary is no longer in flight", not "the summary has
  // rows": a filter combination that legitimately matches nothing would
  // otherwise leave the dropdowns permanently empty, with no way for the user
  // to pick their way back out. Re-enabling on each change costs nothing —
  // the service memoises, so an unchanged option list is not re-fetched.
  const summaryInFlight = summaryQuery.loading;

  const optionsQuery = useLatest(
    async () => {
      const [states, districts, kros, krms] = await Promise.all([
        fetchDimensionValues('state', { month }),
        fetchDimensionValues('district', { month, state: filters.state }),
        fetchDimensionValues('kro', { month, state: filters.state, district: filters.district }),
        fetchDimensionValues('krm', { month }),
      ]);
      return { states, districts, kros, krms };
    },
    `options:${month}:${filters.state}:${filters.district}`,
    {
      initial: { states: [], districts: [], kros: [], krms: [] },
      enabled: ready && !summaryInFlight,
    }
  );

  const reloadLatestMonth = latestMonthQuery.reload;
  const reloadMonths = monthsQuery.reload;
  const reloadSummary = summaryQuery.reload;
  const reloadProducts = productsQuery.reload;
  const reloadDimension = dimensionQuery.reload;
  const reloadActual = actualQuery.reload;
  const reloadActualTotals = actualTotalsQuery.reload;
  const reloadOptions = optionsQuery.reload;

  // Emptying the memo first is what makes this a refresh rather than a replay:
  // without it every section would be handed the response it already has.
  const reload = useCallback(() => {
    clearBusinessPlanCache();
    reloadLatestMonth();
    reloadMonths();
    reloadSummary();
    reloadProducts();
    reloadDimension();
    reloadActual();
    reloadActualTotals();
    reloadOptions();
  }, [
    reloadLatestMonth,
    reloadMonths,
    reloadSummary,
    reloadProducts,
    reloadDimension,
    reloadActual,
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
    options: optionsQuery.data,
    optionsLoading: optionsQuery.loading,

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

    actualDimension,
    setActualDimension,
    actualMeta,
    actualSort,
    setActualSort,
    actualRows: actualQuery.data,
    actualLoading: actualQuery.loading || !ready,
    actualError: actualQuery.error,
    actualTotals,
    actualTotalsLoading:
      (needsOwnTotals ? actualTotalsQuery.loading : actualQuery.loading) || !ready,
    actualRowLimit: limitFor(actualMeta.key),

    reload,
  };
}

export default useBusinessPlan;
