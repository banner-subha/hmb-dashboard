import { supabase } from './supabaseClient.js';
import { toPlanMonth } from '../utils/businessPlan.js';

// ─────────────────────────────────────────────────────────────────────────────
// Business Plan Service — Dual Path: High-Speed CDN / In-Memory Dataset + RPC Fallback
//
// 1. Primary path: Pre-aggregated and full-fidelity dataset loaded from
//    Supabase Storage CDN (`dashboard-data/business_plan.json`) and local
//    bundle (`/business_plan.json`) in parallel. Calculations and filters run
//    in <1ms in memory, completely eliminating network latency and PostgREST
//    schema cache timeouts.
//
// 2. Authoritative fallback: Direct Postgres RPC calls (`query_business_plan`,
//    `query_business_plan_vs_actual`, `get_plan_months`) via PostgREST.
// ─────────────────────────────────────────────────────────────────────────────

const CDN_URL = 'https://jhsttedcvzfkszbzczak.supabase.co/storage/v1/object/public/dashboard-data/business_plan.json';
const LOCAL_URL = '/business_plan.json';

let _bpDatasetCache = null;
let _bpFetchPromise = null;

/** Synchronous reader for already-warmed cache */
export function getBusinessPlanDatasetSync() {
  return _bpDatasetCache;
}

/**
 * Loads the complete Business Plan dataset.
 * Fetches remote Supabase CDN and local bundled copy in parallel, selecting the freshest.
 */
export async function getBusinessPlanDataset() {
  if (_bpDatasetCache) return _bpDatasetCache;
  if (_bpFetchPromise) return _bpFetchPromise;

  _bpFetchPromise = (async () => {
    try {
      const [remoteRes, localRes] = await Promise.allSettled([
        fetch(CDN_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(LOCAL_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      const remoteJson = remoteRes.status === 'fulfilled' ? remoteRes.value : null;
      const localJson = localRes.status === 'fulfilled' ? localRes.value : null;

      let chosen = null;
      if (remoteJson && localJson) {
        const remoteTime = new Date(remoteJson?.meta?.generatedAt || 0).getTime();
        const localTime = new Date(localJson?.meta?.generatedAt || 0).getTime();
        chosen = localTime > remoteTime ? localJson : remoteJson;
      } else {
        chosen = remoteJson || localJson;
      }

      if (chosen && chosen.meta && Array.isArray(chosen.records)) {
        _bpDatasetCache = chosen;
        return chosen;
      }
    } catch (err) {
      console.warn('[businessPlan] failed to fetch dataset:', err);
    }
    return null;
  })();

  const res = await _bpFetchPromise;
  _bpFetchPromise = null;
  return res;
}

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

const API_PAGE_SIZE = 1000;

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
const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map();
const inFlight = new Map();

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
  _bpDatasetCache = null;
  _bpFetchPromise = null;
  responseCache.clear();
  inFlight.clear();
}

// ── In-Memory Filtering & Aggregation Engine ─────────────────────────────────

function normStr(v) {
  return v ? String(v).trim().toLowerCase() : '';
}

function matchesText(val, target) {
  if (!target) return true;
  if (!val) return false;
  const v = normStr(val);
  const t = normStr(target);
  return v === t || v.includes(t);
}

function filterDatasetRecords(records, filters = {}) {
  const { state, district, customer, kro, krm, product, planStatus, krmStatus } = filters;
  return records.filter((r) => {
    if (state && !matchesText(r.state, state)) return false;
    if (district && !matchesText(r.district, district)) return false;
    if (customer && !matchesText(r.customer_name, customer)) return false;
    if (kro && !matchesText(r.kro, kro) && !matchesText(r.jr_kro, kro)) return false;
    if (krm && !matchesText(r.krm, krm)) return false;
    if (planStatus && normStr(r.plan_status) !== normStr(planStatus)) return false;
    if (krmStatus && normStr(r.krm_status) !== normStr(krmStatus)) return false;
    if (product) {
      const p = normStr(product);
      if (p.includes('ig') || p.includes('i grill')) {
        if (!((r.ig_potential || 0) > 0 || (r.ig_sp_target || 0) > 0)) return false;
      } else if (p.includes('gg') || p.includes('grill guard')) {
        if (!((r.gg_potential || 0) > 0 || (r.gg_sp_target || 0) > 0)) return false;
      } else if (p.includes('p') || p.includes('profile')) {
        if (!((r.p_potential || 0) > 0 || (r.p_sp_target || 0) > 0)) return false;
      } else if (p.includes('rs') || p.includes('roofing')) {
        if (!((r.rs_potential || 0) > 0 || (r.rs_sp_target || 0) > 0)) return false;
      } else if (p.includes('ss') || p.includes('stainless')) {
        if (!((r.ss_potential || 0) > 0 || (r.ss_sp_target || 0) > 0)) return false;
      }
    }
    return true;
  });
}

function sortRows(rows, sortKey) {
  const sorted = [...rows];
  switch (sortKey) {
    case 'sp_target_desc':
      return sorted.sort((a, b) => (b.total_sp_target || b.spTarget || 0) - (a.total_sp_target || a.spTarget || 0));
    case 'sp_target_asc':
      return sorted.sort((a, b) => (a.total_sp_target || a.spTarget || 0) - (b.total_sp_target || b.spTarget || 0));
    case 'potential_desc':
      return sorted.sort((a, b) => (b.total_potential || b.potential || 0) - (a.total_potential || a.potential || 0));
    case 'target_pct_desc':
      return sorted.sort((a, b) => (b.sp_target_pct || b.targetPct || 0) - (a.sp_target_pct || a.targetPct || 0));
    case 'variance_asc':
      return sorted.sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0));
    case 'variance_desc':
      return sorted.sort((a, b) => (b.variance ?? 0) - (a.variance ?? 0));
    case 'target_desc':
      return sorted.sort((a, b) => (b.bp_sp_target || b.spTarget || 0) - (a.bp_sp_target || a.spTarget || 0));
    case 'actual_desc':
      return sorted.sort((a, b) => (b.actual_despatch || b.actual || 0) - (a.actual_despatch || a.actual || 0));
    case 'group_asc':
      return sorted.sort((a, b) => JSON.stringify(a.grp || '').localeCompare(JSON.stringify(b.grp || '')));
    default:
      return sorted;
  }
}

/**
 * `public.query_business_plan`.
 *
 * Uses high-speed cached dataset when available for sub-millisecond response,
 * falling back to PostgREST RPC when necessary.
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
  const dataset = await getBusinessPlanDataset();
  const targetMonth = toPlanMonth(month);

  if (dataset && (!targetMonth || targetMonth === toPlanMonth(dataset.meta.latestMonth))) {
    const hasFilters = Boolean(state || district || customer || kro || krm || product || planStatus || krmStatus);

    // 1. Combos for Cascading Dropdowns
    if (
      dimensions.length === 5 &&
      dimensions.includes('state') &&
      dimensions.includes('district') &&
      dimensions.includes('kro')
    ) {
      return (dataset.combos || []).map((grp) => ({ grp }));
    }

    // 2. Summary (dimensions: [])
    if (dimensions.length === 0) {
      if (!hasFilters && dataset.summary) {
        return [dataset.summary];
      }
      const recs = filterDatasetRecords(dataset.records, {
        state,
        district,
        customer,
        kro,
        krm,
        product,
        planStatus,
        krmStatus,
      });
      const sumTarget = Math.round(recs.reduce((acc, r) => acc + (r.total_sp_target || 0), 0) * 10) / 10;
      const sumPot = Math.round(recs.reduce((acc, r) => acc + (r.total_potential || 0), 0) * 10) / 10;
      const sumCo = Math.round(recs.reduce((acc, r) => acc + (r.total_co_target || 0), 0) * 10) / 10;
      const pct = sumPot > 0 ? Math.round((sumTarget / sumPot) * 1000) / 10 : null;
      return [
        {
          grp: {},
          total_sp_target: sumTarget,
          total_potential: sumPot,
          total_co_target: sumCo,
          sp_target_pct: pct,
          customer_count: recs.length,
          submitted_count: recs.filter((r) => r.plan_status === 'submitted').length,
          reviewed_count: recs.filter((r) => r.krm_status === 'reviewed').length,
          pending_count: recs.filter((r) => r.krm_status === 'pending').length,
          missing_count: recs.filter((r) => r.plan_status === 'missing').length,
          ig_potential: Math.round(recs.reduce((acc, r) => acc + (r.ig_potential || 0), 0) * 10) / 10,
          ig_sp_target: Math.round(recs.reduce((acc, r) => acc + (r.ig_sp_target || 0), 0) * 10) / 10,
          gg_potential: Math.round(recs.reduce((acc, r) => acc + (r.gg_potential || 0), 0) * 10) / 10,
          gg_sp_target: Math.round(recs.reduce((acc, r) => acc + (r.gg_sp_target || 0), 0) * 10) / 10,
          p_potential: Math.round(recs.reduce((acc, r) => acc + (r.p_potential || 0), 0) * 10) / 10,
          p_sp_target: Math.round(recs.reduce((acc, r) => acc + (r.p_sp_target || 0), 0) * 10) / 10,
          rs_potential: Math.round(recs.reduce((acc, r) => acc + (r.rs_potential || 0), 0) * 10) / 10,
          rs_sp_target: Math.round(recs.reduce((acc, r) => acc + (r.rs_sp_target || 0), 0) * 10) / 10,
          ss_potential: Math.round(recs.reduce((acc, r) => acc + (r.ss_potential || 0), 0) * 10) / 10,
          ss_sp_target: Math.round(recs.reduce((acc, r) => acc + (r.ss_sp_target || 0), 0) * 10) / 10,
        },
      ];
    }

    // 3. Products Mix (dimensions: ['product'])
    if (dimensions.length === 1 && dimensions[0] === 'product') {
      if (!hasFilters && dataset.products) {
        return dataset.products;
      }
      const recs = filterDatasetRecords(dataset.records, {
        state,
        district,
        customer,
        kro,
        krm,
        product,
        planStatus,
        krmStatus,
      });
      const defs = [
        { code: 'IG', label: 'IG - I GRILL', potKey: 'ig_potential', tgtKey: 'ig_sp_target' },
        { code: 'GG', label: 'GG - GRILL GUARD', potKey: 'gg_potential', tgtKey: 'gg_sp_target' },
        { code: 'P', label: 'P - PROFILE', potKey: 'p_potential', tgtKey: 'p_sp_target' },
        { code: 'RS', label: 'RS - ROOFING SHEET', potKey: 'rs_potential', tgtKey: 'rs_sp_target' },
        { code: 'SS', label: 'SS - HMB STAINLESS', potKey: 'ss_potential', tgtKey: 'ss_sp_target' },
      ];
      return defs.map((d) => {
        const pRecs = recs.filter((r) => (r[d.potKey] || 0) > 0 || (r[d.tgtKey] || 0) > 0);
        const pot = Math.round(pRecs.reduce((acc, r) => acc + (r[d.potKey] || 0), 0) * 10) / 10;
        const tgt = Math.round(pRecs.reduce((acc, r) => acc + (r[d.tgtKey] || 0), 0) * 10) / 10;
        const pct = pot > 0 ? Math.round((tgt / pot) * 1000) / 10 : null;
        return {
          grp: { product: d.label },
          total_potential: pot,
          total_sp_target: tgt,
          total_co_target: 0,
          sp_target_pct: pct,
          customer_count: pRecs.length,
          submitted_count: pRecs.filter((r) => r.plan_status === 'submitted').length,
          reviewed_count: pRecs.filter((r) => r.krm_status === 'reviewed').length,
          pending_count: pRecs.filter((r) => r.krm_status === 'pending').length,
          missing_count: pRecs.filter((r) => r.plan_status === 'missing').length,
        };
      });
    }

    // 4. Dimensional Tables (state, district, customer, kro, krm)
    if (dimensions.length === 1) {
      const dim = dimensions[0];
      const dimKey = dim === 'dealer' ? 'customer' : dim;
      const basePlanRows = dataset.planDimensions?.[dimKey] || dataset.dimensions?.[dimKey];
      if (!hasFilters && basePlanRows) {
        return sortRows(basePlanRows, sort).slice(0, limit);
      }
      const recs = filterDatasetRecords(dataset.records, {
        state,
        district,
        customer,
        kro,
        krm,
        product,
        planStatus,
        krmStatus,
      });
      const grpField = (dim === 'customer' || dim === 'dealer') ? 'customer_name' : dim;
      const grpMap = new Map();
      recs.forEach((r) => {
        const k = r[grpField] || 'UNASSIGNED';
        let acc = grpMap.get(k);
        if (!acc) {
          acc = {
            grp: { [dim]: k },
            total_potential: 0,
            total_sp_target: 0,
            total_co_target: 0,
            customer_count: 0,
            submitted_count: 0,
            reviewed_count: 0,
            pending_count: 0,
            missing_count: 0,
            ig_potential: 0,
            ig_sp_target: 0,
            gg_potential: 0,
            gg_sp_target: 0,
            p_potential: 0,
            p_sp_target: 0,
            rs_potential: 0,
            rs_sp_target: 0,
            ss_potential: 0,
            ss_sp_target: 0,
          };
          grpMap.set(k, acc);
        }
        acc.total_potential += r.total_potential || 0;
        acc.total_sp_target += r.total_sp_target || 0;
        acc.total_co_target += r.total_co_target || 0;
        acc.customer_count += 1;
        if (r.plan_status === 'submitted') acc.submitted_count += 1;
        if (r.krm_status === 'reviewed') acc.reviewed_count += 1;
        if (r.krm_status === 'pending') acc.pending_count += 1;
        if (r.plan_status === 'missing') acc.missing_count += 1;
        acc.ig_potential += r.ig_potential || 0;
        acc.ig_sp_target += r.ig_sp_target || 0;
        acc.gg_potential += r.gg_potential || 0;
        acc.gg_sp_target += r.gg_sp_target || 0;
        acc.p_potential += r.p_potential || 0;
        acc.p_sp_target += r.p_sp_target || 0;
        acc.rs_potential += r.rs_potential || 0;
        acc.rs_sp_target += r.rs_sp_target || 0;
        acc.ss_potential += r.ss_potential || 0;
        acc.ss_sp_target += r.ss_sp_target || 0;
      });
      const rows = Array.from(grpMap.values()).map((acc) => {
        acc.total_potential = Math.round(acc.total_potential * 10) / 10;
        acc.total_sp_target = Math.round(acc.total_sp_target * 10) / 10;
        acc.sp_target_pct =
          acc.total_potential > 0 ? Math.round((acc.total_sp_target / acc.total_potential) * 1000) / 10 : null;
        return acc;
      });
      return sortRows(rows, sort).slice(0, limit);
    }
  }

  // Fallback to Supabase PostgREST RPC
  const params = {
    p_dimensions: dimensions,
    p_month: targetMonth,
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
  const dataset = await getBusinessPlanDataset();
  const targetMonth = toPlanMonth(month);

  if (dataset && (!targetMonth || targetMonth === toPlanMonth(dataset.meta.latestMonth))) {
    const dim = dimensions[0] || 'state';
    const dimKey = dim === 'customer' ? 'dealer' : dim;
    const baseRows = dataset.actualDimensions?.[dimKey] || dataset.dimensions?.[dimKey];
    const hasFilter = Boolean(state || district || dealer);
    if (!hasFilter && baseRows && Array.isArray(baseRows)) {
      return sortRows(baseRows, sort).slice(0, limit);
    }
    if (dataset.records && Array.isArray(dataset.records)) {
      const recs = filterDatasetRecords(dataset.records, { state, district, customer: dealer });
      const grpField = dimKey === 'dealer' ? 'customer_name' : dimKey;
      const grpMap = new Map();
      recs.forEach((r) => {
        const k = r[grpField] || 'UNASSIGNED';
        let acc = grpMap.get(k);
        if (!acc) {
          acc = {
            grp: { [dimKey]: k },
            bp_sp_target: 0,
            bp_potential: 0,
            actual_despatch: 0,
            bp_dealers: 0,
            active_dealers: 0,
          };
          grpMap.set(k, acc);
        }
        acc.bp_sp_target += r.total_sp_target || 0;
        acc.bp_potential += r.total_potential || 0;
        acc.actual_despatch += r.despatch || 0;
        acc.bp_dealers += 1;
        if ((r.despatch || 0) > 0) acc.active_dealers += 1;
      });
      const rows = Array.from(grpMap.values()).map((acc) => {
        acc.bp_sp_target = Math.round(acc.bp_sp_target * 10) / 10;
        acc.bp_potential = Math.round(acc.bp_potential * 10) / 10;
        acc.actual_despatch = Math.round(acc.actual_despatch * 10) / 10;
        acc.variance = Math.round((acc.actual_despatch - acc.bp_sp_target) * 10) / 10;
        acc.achievement_pct =
          acc.bp_sp_target > 0 ? Math.round((acc.actual_despatch / acc.bp_sp_target) * 1000) / 10 : null;
        acc.coverage_pct =
          acc.bp_dealers > 0 ? Math.round((acc.active_dealers / acc.bp_dealers) * 1000) / 10 : null;
        return acc;
      });
      return sortRows(rows, sort).slice(0, limit);
    }
  }

  const params = {
    p_dimensions: dimensions,
    p_month: targetMonth,
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
 * `public.business_plan_value_exists`.
 */
export async function businessPlanValueExists(dimension, value) {
  const v = clean(value);
  if (!v) return true;
  const dataset = await getBusinessPlanDataset();
  if (dataset && Array.isArray(dataset.records)) {
    const field = dimension === 'dealer' ? 'customer_name' : dimension;
    return dataset.records.some((r) => matchesText(r[field], v));
  }
  const { data, error } = await supabase.rpc('business_plan_value_exists', {
    p_dimension: dimension,
    p_input: v,
  });
  if (error) return true;
  return data === true;
}

/**
 * The newest month that has a plan.
 */
export async function fetchLatestPlanMonth() {
  const dataset = await getBusinessPlanDataset();
  if (dataset?.meta?.latestMonth) {
    return dataset.meta.latestMonth;
  }
  const months = await fetchPlanMonths();
  return months[0] ?? null;
}

/**
 * Every month that has a plan, newest first.
 */
export async function fetchPlanMonths() {
  const dataset = await getBusinessPlanDataset();
  if (dataset?.meta?.months && Array.isArray(dataset.meta.months)) {
    return dataset.meta.months;
  }

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
 * The distinct values of one dimension for a month, cascading with the chosen territory.
 */
export async function fetchDimensionValues(dimension, { month, state, district, kro, krm } = {}) {
  const dataset = await getBusinessPlanDataset();
  const targetMonth = toPlanMonth(month);

  if (dataset && (!targetMonth || targetMonth === toPlanMonth(dataset.meta.latestMonth)) && Array.isArray(dataset.combos)) {
    const combos = dataset.combos;
    const usable = (v) => {
      if (v == null) return false;
      const str = String(v).trim();
      return str !== '' && str.toUpperCase() !== 'UNASSIGNED' && str.toUpperCase() !== 'UNKNOWN';
    };
    const is = (val, chosen) => !chosen || matchesText(val, chosen);
    const repIs = (g, chosen) => !chosen || matchesText(g.kro, chosen) || matchesText(g.jr_kro, chosen);

    const filtered = combos.filter((g) => {
      if (dimension !== 'state' && !is(g.state, state)) return false;
      if (dimension !== 'state' && dimension !== 'district' && !is(g.district, district)) return false;
      if (dimension !== 'state' && dimension !== 'kro' && !repIs(g, kro)) return false;
      if (dimension !== 'state' && dimension !== 'krm' && !is(g.krm, krm)) return false;
      return true;
    });

    const set = new Set();
    filtered.forEach((g) => {
      const val = g[dimension];
      if (usable(val)) set.add(String(val).trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  const rows = await queryBusinessPlan({
    dimensions: [dimension],
    month,
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
