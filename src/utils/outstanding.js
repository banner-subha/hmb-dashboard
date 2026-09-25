// ─────────────────────────────────────────────────────────────────────────────
// Outstanding Receivables: formatting, state names, aging buckets, filtering.
//
// Pure functions only, so scripts/test-outstanding.mjs can run them under node.
// Money is summed in whole paise: the ledger reconciles to the paisa against
// the ERP export, and float addition over ~1,000 accounts would not.
// ─────────────────────────────────────────────────────────────────────────────

import { getExpandedStatesSet } from './constants.js';
import { getNormalizedDistrictSet, matchesAssignedDistrict, normalizeDistrict } from './districtNormalizer.js';

const CRORE = 10000000;
const LAKH = 100000;

/** Rupees in Indian short form: ₹53.49 Cr, ₹16.18 L, ₹4.5 K, ₹812.00. */
export function formatINR(val, includeSymbol = true) {
  if (val == null || val === '' || Number.isNaN(Number(val))) return 'n/a';
  const num = Number(val);
  const prefix = includeSymbol ? '₹' : '';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  if (abs >= CRORE) return `${sign}${prefix}${(abs / CRORE).toFixed(2)} Cr`;
  if (abs >= LAKH) return `${sign}${prefix}${(abs / LAKH).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}${prefix}${(abs / 1000).toFixed(1)} K`;
  return `${sign}${prefix}${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Full rupee amount with Indian digit grouping, for tooltips and the drawer. */
export function formatINRFull(val) {
  if (val == null || Number.isNaN(Number(val))) return 'n/a';
  const num = Number(val);
  const abs = Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${num < 0 ? '-' : ''}₹${abs}`;
}

/** '2025-03-31' -> '31 Mar 2025'. Parsed as a calendar date, never through a timezone. */
export function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

export const toPaise = (v) => Math.round((Number(v) || 0) * 100);
export const fromPaise = (p) => p / 100;

/**
 * How late a bill is. Classes, not inline colours: the light theme remaps
 * these text classes to darker shades (index.css), which inline styles skip.
 */
export function getOverdueSeverity(overdueDays) {
  const days = Number(overdueDays) || 0;
  if (days <= 0) return { key: 'current', label: 'Not due', text: 'text-emerald-400' };
  if (days <= 30) return { key: 'b0_30', label: '1 to 30 days', text: 'text-amber-400' };
  if (days <= 60) return { key: 'b31_60', label: '31 to 60 days', text: 'text-orange-400' };
  if (days <= 90) return { key: 'b61_90', label: '61 to 90 days', text: 'text-red-400' };
  return { key: 'b90_plus', label: 'Over 90 days', text: 'text-red-400' };
}

/**
 * Aging buckets, oldest last. `net` and `credit` name the book RPC's columns;
 * the bills in a bucket are net minus credit. `fill` is the bar colour.
 */
export const AGING_BUCKETS = [
  { key: 'current', label: 'Not yet due', net: 'current_amount', credit: 'credit_current', fill: 'var(--color-severity-none)' },
  { key: 'b0_30', label: '1-30 days overdue', net: 'bucket_0_30', credit: 'credit_0_30', fill: 'var(--color-severity-medium)' },
  { key: 'b31_60', label: '31-60 days overdue', net: 'bucket_31_60', credit: 'credit_31_60', fill: 'var(--color-severity-high)' },
  { key: 'b61_90', label: '61-90 days overdue', net: 'bucket_61_90', credit: 'credit_61_90', fill: 'color-mix(in srgb, var(--color-severity-critical) 72%, var(--color-severity-high))' },
  { key: 'b90_plus', label: '90+ days overdue', net: 'bucket_90_plus', credit: 'credit_90_plus', fill: 'var(--color-severity-critical)' },
];

export const bucketByKey = (key) => AGING_BUCKETS.find((b) => b.key === key) || null;

/** Unpaid bills (positive entries) in one bucket of one account, in paise. */
export const bucketBillsPaise = (row, bucket) => toPaise(row[bucket.net]) - toPaise(row[bucket.credit]);

// ── State names ──────────────────────────────────────────────────────────────

// The ledger carries the same state three ways: 'WB', 'West Bengal', 'BIHAR'.
const STATE_ALIASES = {
  WB: 'West Bengal',
  UTTARPRADESH: 'Uttar Pradesh',
  UNKNOWN: 'State not recorded',
};
const LOWER_WORDS = new Set(['and', 'of']);

export function normalizeState(raw) {
  const s = String(raw || '').trim();
  if (!s) return STATE_ALIASES.UNKNOWN;
  const alias = STATE_ALIASES[s.toUpperCase().replace(/\s+/g, '')];
  if (alias) return alias;
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// ── Match source ─────────────────────────────────────────────────────────────

const MATCH_SOURCES = {
  VOUCHER_DESPATCH: { label: 'Despatch invoice', title: 'Bill number found in the despatch register' },
  VOUCHER_DIA: { label: 'DIA despatch', title: 'Bill number found in the DIA-wise despatch register' },
  PARTY_INFERRED: { label: 'Party\'s other bills', title: 'Dealer taken from this party\'s other matched bills' },
  CUSTOMER_CODE: { label: 'Customer code', title: 'Party code matched to a customer code' },
  CANONICAL_MAP: { label: 'Dealer name list', title: 'Ledger name matched through the dealer alias list' },
  PARTY_NAME: { label: 'ERP party name', title: 'Dealer taken from the ERP ledger name' },
};

export const matchSourceInfo = (src) => MATCH_SOURCES[src] || { label: src || 'Unmatched', title: 'No match recorded' };

// ── Book rows ────────────────────────────────────────────────────────────────

/** Stable key for one account group; the drilldown RPC matches the same three fields. */
export const accountKey = (row) => `${row.dealer_name}|${row.state}|${row.district ?? ''}`;

/** Adds display fields to each book row. Returns new objects; RPC rows are left alone. */
export function prepareBook(rows) {
  return (rows || []).map((r) => {
    const credit = toPaise(r.credit_total);
    return {
      ...r,
      key: accountKey(r),
      stateLabel: normalizeState(r.state),
      // 'BALASORE', 'BALESWAR' and 'BALESHWAR' are one district; the shared
      // normalizer folds them. The raw value stays on the row for the drilldown.
      districtLabel: r.district ? normalizeDistrict(r.district) : null,
      billsTotal: fromPaise(toPaise(r.total_outstanding) - credit),
      searchIndex: searchIndex([r.dealer_name, r.party_names, r.party_codes].filter(Boolean).join(' ')),
    };
  });
}

/** State and district choices, each state listed by its net balance. */
export function buildGeoOptions(rows) {
  const byState = new Map();
  rows.forEach((r) => {
    const entry = byState.get(r.stateLabel) || { value: r.stateLabel, paise: 0, districts: new Set() };
    entry.paise += toPaise(r.total_outstanding);
    if (r.districtLabel) entry.districts.add(r.districtLabel);
    byState.set(r.stateLabel, entry);
  });
  const states = [...byState.values()]
    .sort((a, b) => b.paise - a.paise || a.value.localeCompare(b.value))
    .map((s) => ({ value: s.value, districts: [...s.districts].sort((a, b) => a.localeCompare(b)) }));
  return states;
}

/**
 * Words of letters and digits, punctuation dropped. Single letters in a row
 * are initials and join into one word, so "A.K. HARDWARE", "AK Hardware" and
 * "a k hardware" all give ["ak", "hardware"].
 */
function searchWords(s) {
  const words = [];
  let prevSingle = false;
  for (const w of s.normalize('NFKD').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    if (w.length === 1 && prevSingle) words[words.length - 1] += w;
    else words.push(w);
    prevSingle = w.length === 1;
  }
  return words;
}

/** Row side of the search: " ak hardware cust00009" for word-start matching, plus the words run together. */
function searchIndex(s) {
  const words = searchWords(s);
  return { text: ` ${words.join(' ')}`, compact: words.join('') };
}

/**
 * Each typed word must start a word in the dealer name, party name or party
 * code, in any order: "hardware ak" finds A.K. Hardware but "ak" does not find
 * Shakti. A word with digits may sit anywhere ("00009" finds CUST00009), and a
 * long word typed with no spaces ("akhardware") matches the name run together.
 */
function matchesSearch(index, words) {
  if (words.length === 1 && words[0].length >= 6 && index.compact.includes(words[0])) return true;
  return words.every((w) => index.text.includes(` ${w}`) || (/\d/.test(w) && index.compact.includes(w)));
}

/**
 * Scopes book rows to a client user's assigned states and districts.
 * Returns all rows for admins or unscoped users.
 */
export function scopeBookForUser(rows, user) {
  if (!user || user.role !== 'client') return rows;

  const rawUserStates = Array.isArray(user.states)
    ? user.states
    : (typeof user.states === 'string' ? user.states.split(',') : []);
  const allowedStatesSet = getExpandedStatesSet(rawUserStates);
  const assignedDistricts = user.districts || [];
  const assignedSet = getNormalizedDistrictSet(assignedDistricts);

  if (allowedStatesSet.size === 0 && assignedSet.size === 0) return rows;

  return rows.filter((r) => {
    const rawStateNorm = (r.state || '').replace(/\s+/g, '').toUpperCase();
    const labelStateNorm = (r.stateLabel || '').replace(/\s+/g, '').toUpperCase();

    if (allowedStatesSet.size > 0) {
      if (!allowedStatesSet.has(rawStateNorm) && !allowedStatesSet.has(labelStateNorm)) {
        return false;
      }
    }

    if (assignedSet.size > 0) {
      if (!r.district && !r.districtLabel) return false;
      const matches = (r.district && matchesAssignedDistrict(r.district, assignedSet)) ||
                      (r.districtLabel && matchesAssignedDistrict(r.districtLabel, assignedSet));
      if (!matches) return false;
    }

    return true;
  });
}

export function filterBook(rows, { search = '', state = '', district = '', overdueOnly = false, bucket = '' } = {}) {
  const words = searchWords(search);
  const b = bucketByKey(bucket);
  return rows.filter((r) => {
    if (state && r.stateLabel !== state) return false;
    if (district && r.districtLabel !== district) return false;
    if (overdueOnly && !(toPaise(r.overdue_amount) > 0)) return false;
    if (b && !(bucketBillsPaise(r, b) > 0)) return false;
    if (words.length && !matchesSearch(r.searchIndex, words)) return false;
    return true;
  });
}

/** Totals over a set of book rows, in rupees, exact to the paisa. */
export function summarizeBook(rows) {
  const p = { total: 0, overdue: 0, current: 0, credit: 0, bills90: 0 };
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, { net: 0, credit: 0, accounts: 0 }]));
  const dealers = new Set();
  let vouchers = 0;
  let bills = 0;
  let credits = 0;
  let bills90Accounts = 0;
  let asOn = null;

  rows.forEach((r) => {
    p.total += toPaise(r.total_outstanding);
    p.overdue += toPaise(r.overdue_amount);
    p.current += toPaise(r.current_amount);
    p.credit += toPaise(r.credit_total);
    AGING_BUCKETS.forEach((b) => {
      buckets[b.key].net += toPaise(r[b.net]);
      buckets[b.key].credit += toPaise(r[b.credit]);
      if (bucketBillsPaise(r, b) > 0) buckets[b.key].accounts += 1;
    });
    const b90 = bucketBillsPaise(r, AGING_BUCKETS[4]);
    if (b90 > 0) bills90Accounts += 1;
    p.bills90 += b90;
    dealers.add(r.dealer_name);
    vouchers += r.voucher_count || 0;
    bills += r.bill_count || 0;
    credits += r.credit_count || 0;
    if (r.as_on_date && (!asOn || r.as_on_date > asOn)) asOn = r.as_on_date;
  });

  return {
    total: fromPaise(p.total),
    overdue: fromPaise(p.overdue),
    current: fromPaise(p.current),
    credit: fromPaise(p.credit),
    bills: fromPaise(p.total - p.credit),
    bills90: fromPaise(p.bills90),
    bills90Accounts,
    buckets: AGING_BUCKETS.map((b) => ({
      ...b,
      net: fromPaise(buckets[b.key].net),
      credit: fromPaise(buckets[b.key].credit),
      bills: fromPaise(buckets[b.key].net - buckets[b.key].credit),
      accounts: buckets[b.key].accounts,
    })),
    accountCount: rows.length,
    dealerCount: dealers.size,
    voucherCount: vouchers,
    billCount: bills,
    creditCount: credits,
    asOn,
  };
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export const SORT_FIELDS = {
  total: (r) => Number(r.total_outstanding) || 0,
  overdue: (r) => Number(r.overdue_amount) || 0,
  days: (r) => (r.max_bill_overdue_days == null ? -Infinity : Number(r.max_bill_overdue_days)),
  oldest: (r) => r.oldest_bill_due_date || null,
  entries: (r) => r.voucher_count || 0,
};

/** Sorted copy. Accounts with no open bill always sort last on the date column. */
export function sortBook(rows, { id = 'total', desc = true } = {}) {
  const get = SORT_FIELDS[id] || SORT_FIELDS.total;
  const dir = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va === vb) return a.dealer_name.localeCompare(b.dealer_name);
    if (va == null) return 1;
    if (vb == null) return -1;
    return va < vb ? -dir : dir;
  });
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const amount = (key) => (r) => Number(r[key] ?? 0).toFixed(2);

export const ACCOUNT_CSV_COLUMNS = [
  { label: 'Dealer', key: 'dealer_name' },
  { label: 'Party Code', key: 'party_codes' },
  { label: 'ERP Party Name', key: 'party_names' },
  { label: 'State', key: 'stateLabel' },
  { label: 'District', key: 'districtLabel' },
  { label: 'Salesperson', key: 'employee_names' },
  { label: 'Net Outstanding (Rs)', getValue: amount('total_outstanding') },
  { label: 'Overdue (Rs)', getValue: amount('overdue_amount') },
  { label: 'Not Yet Due (Rs)', getValue: amount('current_amount') },
  { label: '1-30 Days Net (Rs)', getValue: amount('bucket_0_30') },
  { label: '31-60 Days Net (Rs)', getValue: amount('bucket_31_60') },
  { label: '61-90 Days Net (Rs)', getValue: amount('bucket_61_90') },
  { label: 'Over 90 Days Net (Rs)', getValue: amount('bucket_90_plus') },
  { label: 'Open Bills (Rs)', getValue: amount('billsTotal') },
  { label: 'Credits (Rs)', getValue: amount('credit_total') },
  { label: 'Bills', key: 'bill_count' },
  { label: 'Credit Entries', key: 'credit_count' },
  { label: 'Oldest Bill Days Overdue', key: 'max_bill_overdue_days' },
  { label: 'Oldest Bill Due Date', key: 'oldest_bill_due_date' },
  { label: 'Ledger As On', key: 'as_on_date' },
];

export const VOUCHER_CSV_COLUMNS = [
  { label: 'Voucher No', key: 'voucher_no' },
  { label: 'Type', getValue: (v) => (Number(v.outstanding_amount) < 0 ? 'Credit' : 'Bill') },
  { label: 'Voucher Date', key: 'voucher_date' },
  { label: 'Order No', key: 'order_no' },
  { label: 'Due Date', key: 'due_date' },
  { label: 'Days Overdue', key: 'overdue_days' },
  { label: 'Payment Terms (Days)', key: 'payment_term_days' },
  { label: 'Amount (Rs)', getValue: amount('outstanding_amount') },
  { label: 'ERP Party Name', key: 'party_name' },
  { label: 'Party Code', key: 'party_code' },
  { label: 'Salesperson', key: 'employee_name' },
  { label: 'Matched By', getValue: (v) => matchSourceInfo(v.match_source).label },
];
