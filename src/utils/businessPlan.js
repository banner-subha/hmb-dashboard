// ─────────────────────────────────────────────────────────────────────────────
// Business Plan — shared vocabulary, formatters and row normalisers.
//
// This file deliberately keeps its own product table instead of reusing
// PRODUCT_LABELS from constants.js. That list describes the *despatch* item
// taxonomy (GI, IGG, HGI, P = Pipe); the business plan is written against a
// different five-line taxonomy where `GG` is Grill Guard and `P` is Profile.
// Merging them would silently relabel one dataset with the other's names.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The five planned product lines.
 *
 * `rpcLabel` is what `query_business_plan` emits in `grp.product` when it
 * unpivots (e.g. `"IG - I GRILL"`); `potentialKey` / `targetKey` are the
 * per-product columns returned on every non-product row.
 */
export const BP_PRODUCTS = [
  { code: 'IG', label: 'I-Grill',         rpcLabel: 'IG - I GRILL',       potentialKey: 'ig_potential', targetKey: 'ig_sp_target', color: '#1D4ED8' },
  { code: 'GG', label: 'Grill Guard',     rpcLabel: 'GG - GRILL GUARD',   potentialKey: 'gg_potential', targetKey: 'gg_sp_target', color: '#2563EB' },
  { code: 'P',  label: 'Profile',         rpcLabel: 'P - PROFILE',        potentialKey: 'p_potential',  targetKey: 'p_sp_target',  color: '#0EA5E9' },
  { code: 'RS', label: 'Roofing Sheet',   rpcLabel: 'RS - ROOFING SHEET', potentialKey: 'rs_potential', targetKey: 'rs_sp_target', color: '#06B6D4' },
  { code: 'SS', label: 'Stainless Steel', rpcLabel: 'SS - HMB STAINLESS', potentialKey: 'ss_potential', targetKey: 'ss_sp_target', color: '#38BDF8' },
];

export const BP_PRODUCT_BY_RPC_LABEL = Object.fromEntries(
  BP_PRODUCTS.map((p) => [p.rpcLabel, p])
);

/**
 * The dimensional views. `key` is what `p_dimensions` receives, `grpKey` is
 * the property the RPC writes into `grp`.
 *
 * `customer` and `dealer` are the same column server-side; the table uses
 * `customer` because that is the key the RPC echoes back.
 */
export const BP_DIMENSIONS = [
  { key: 'state',    grpKey: 'state',    label: 'By State',            entity: 'State' },
  { key: 'district', grpKey: 'district', label: 'By District',         entity: 'District' },
  { key: 'kro',      grpKey: 'kro',      label: 'By Sales Rep (KRO)',  entity: 'Sales Rep' },
  { key: 'krm',      grpKey: 'krm',      label: 'By Regional Manager', entity: 'Regional Manager' },
  { key: 'customer', grpKey: 'customer', label: 'By Customer',         entity: 'Customer' },
];

/** Dimensions `query_business_plan_vs_actual` can group by. */
export const BP_ACTUAL_DIMENSIONS = [
  { key: 'state',    grpKey: 'state',    label: 'By State',    entity: 'State' },
  { key: 'district', grpKey: 'district', label: 'By District', entity: 'District' },
  { key: 'dealer',   grpKey: 'dealer',   label: 'By Dealer',   entity: 'Dealer' },
];

export const PLAN_STATUS_OPTIONS = [
  { value: '', label: 'Any Plan Status' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'draft', label: 'Draft' },
  { value: 'missing', label: 'Missing' },
];

export const KRM_STATUS_OPTIONS = [
  { value: '', label: 'Any Review Status' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'na', label: 'Not Applicable' },
];

// ── Numbers ──────────────────────────────────────────────────────────────────

/**
 * Coerce an RPC value to a finite number.
 *
 * PostgREST can hand `numeric` back as either a JSON number or a quoted
 * string depending on the column and the driver, and `bigint` counts arrive as
 * numbers. Every read goes through here so a quoted "13694.3" can never end
 * up concatenated into a total instead of added to it.
 */
export const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Same coercion, but preserves "no value" as null (for achievement %). */
export const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Tonnage, to one decimal place with the unit — the commercial format the
 * business plan is written in (29,681.3 MT).
 *
 * Deliberately not `formatters.formatMT`, which renders two decimals for the
 * despatch pages. Changing that shared helper would re-format every other tab.
 */
export const formatMT1 = (n) => {
  const v = numOrNull(n);
  if (v === null) return '—';
  return `${v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MT`;
};

/** Tonnage with an explicit sign — used for the shortfall / surplus column. */
export const formatVariance = (n) => {
  const v = numOrNull(n);
  if (v === null) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MT`;
};

/** Percentage to one decimal place. Null stays a dash, never 0.0%. */
export const formatPct1 = (n) => {
  const v = numOrNull(n);
  if (v === null) return '—';
  return `${v.toFixed(1)}%`;
};

/** Whole counts, Indian grouping. */
export const formatCount = (n) => num(n).toLocaleString('en-IN');

// ── Months ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-08-01' becomes 'August 2026'. Anything unparseable is echoed back. */
export const formatMonthLabel = (iso) => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})/.exec(String(iso).trim());
  if (!m) return String(iso);
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  return MONTH_NAMES[monthIdx] ? `${MONTH_NAMES[monthIdx]} ${year}` : String(iso);
};

/** Normalise anything month-shaped to the 'YYYY-MM-01' the RPCs expect. */
export const toPlanMonth = (iso) => {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})/.exec(String(iso).trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
};

// ── Row shapes ───────────────────────────────────────────────────────────────

/**
 * One `query_business_plan` row, with every numeric coerced once.
 *
 * `sp_target_pct` stays null when the RPC could not divide (no potential), so
 * the table shows a dash rather than a misleading 0.0%.
 */
export const normalizePlanRow = (row, grpKey) => {
  if (!row) return null;
  const grp = row.grp || {};
  const rawKey = grpKey ? grp[grpKey] ?? null : null;
  let label = 'National';
  if (grpKey) {
    if (!rawKey || rawKey === 'UNASSIGNED') {
      label = grpKey === 'kro' ? 'Direct Accounts (No Rep Assigned)' : 'Unassigned Accounts';
    } else {
      label = rawKey;
    }
  }
  return {
    key: grpKey ? rawKey : '__total__',
    label,
    grp,
    potential: num(row.total_potential),
    spTarget: num(row.total_sp_target),
    coTarget: num(row.total_co_target),
    targetPct: numOrNull(row.sp_target_pct),
    customers: num(row.customer_count),
    submitted: num(row.submitted_count),
    reviewed: num(row.reviewed_count),
    pending: num(row.pending_count),
    missing: num(row.missing_count),
    products: BP_PRODUCTS.map((p) => ({
      ...p,
      potential: num(row[p.potentialKey]),
      spTarget: num(row[p.targetKey]),
    })),
  };
};

/** One `query_business_plan` row grouped by product. */
export const normalizeProductRow = (row) => {
  if (!row) return null;
  const rpcLabel = row.grp?.product ?? '';
  const meta = BP_PRODUCT_BY_RPC_LABEL[rpcLabel];
  return {
    code: meta?.code ?? rpcLabel,
    label: meta?.label ?? rpcLabel,
    color: meta?.color ?? '#3b82f6',
    potential: num(row.total_potential),
    spTarget: num(row.total_sp_target),
    targetPct: numOrNull(row.sp_target_pct),
    customers: num(row.customer_count),
    submitted: num(row.submitted_count),
    missing: num(row.missing_count),
  };
};

/** One `query_business_plan_vs_actual` row. */
export const normalizeActualRow = (row, grpKey) => {
  if (!row) return null;
  const grp = row.grp || {};
  const spTarget = num(row.bp_sp_target);
  const bpDealers = num(row.bp_dealers);
  const activeDealers = num(row.active_dealers);
  return {
    key: grp[grpKey] ?? grp.state ?? grp.district ?? grp.dealer ?? null,
    label: grp[grpKey] ?? grp.state ?? grp.district ?? grp.dealer ?? 'Unassigned',
    grp,
    spTarget,
    potential: num(row.bp_potential),
    actual: num(row.actual_despatch),
    variance: num(row.variance),
    // Null whenever there was no target to measure against — an unplanned
    // dealer that billed is not "0% achievement", it has no plan at all.
    achievementPct: numOrNull(row.achievement_pct),
    bpDealers,
    activeDealers,
    // A row joined in from the despatch side only has no plan behind it.
    unplanned: bpDealers === 0,
    coveragePct: bpDealers > 0 ? (activeDealers / bpDealers) * 100 : null,
  };
};

/**
 * Achievement banding, shared by the progress bar and the variance colour.
 * Thresholds mirror the review language the sales team already uses.
 */
export const achievementTone = (pct) => {
  if (pct === null || pct === undefined) return { color: '#6b7280', label: 'No Target' };
  if (pct >= 100) return { color: '#22c55e', label: 'Target Met' };
  if (pct >= 80) return { color: '#84cc16', label: 'On Track' };
  if (pct >= 60) return { color: '#f59e0b', label: 'Behind' };
  return { color: '#ef4444', label: 'Critical Gap' };
};
