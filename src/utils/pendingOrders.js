// Figures for the Pending Orders tab, all from the dashboard file (latest.json)
// after DataContext has applied the login scope and the filters. Pure
// functions only: the page and scripts/test-pending-orders.mjs share them.
//
// States, districts and dealers each carry pendingQty, pendingAge (day-precise
// buckets), pendingHistory (by order month), oldestPendingDate and dailyAvgQty,
// and the three levels add up to the same national total.

import { getEntityAging, agingTotal, emptyAging } from './backlogAging.js';
import { getBacklogClearance } from './pending.js';
import { normalizeDistrict } from './districtNormalizer.js';

const DAY_MS = 86400000;
const round2 = n => Math.round((n || 0) * 100) / 100;

export function daysSince(isoDay, asOf) {
  if (!isoDay) return null;
  const d = new Date(`${isoDay}T00:00:00Z`);
  const ref = asOf ? new Date(`${asOf}T00:00:00Z`) : new Date();
  if (isNaN(d.getTime()) || isNaN(ref.getTime())) return null;
  return Math.max(0, Math.floor((ref - d) / DAY_MS));
}

// With a product filter, DataContext swaps pendingQty for that product's, but
// the ageing and order-month splits stay whole-entity. Those are scaled to the
// product's quantity (an estimate), so every figure on the page adds up.
function scaleFactor(entity) {
  const { aging } = getEntityAging(entity, null);
  const whole = agingTotal(aging);
  const pending = entity.pendingQty || 0;
  if (!whole || Math.abs(whole - pending) < 0.01) return 1;
  return pending / whole;
}

export function agingOf(entity) {
  const { aging } = getEntityAging(entity, null);
  const f = scaleFactor(entity);
  const out = emptyAging();
  Object.keys(out).forEach(k => { out[k] = round2((aging[k] || 0) * f); });
  return out;
}

// Daily despatch pace. For one product, the entity's pace times that
// product's share of its year-to-date despatch.
export function paceOf(entity, product) {
  const pace = entity.dailyAvgQty ?? entity.currentDailyRate ?? 0;
  if (!product) return pace;
  const p = (entity.products || []).find(x => x.product === product);
  if (!p || !entity.ytd) return 0;
  return pace * ((p.ytd || 0) / entity.ytd);
}

const upper = s => String(s || '').replace(/\s+/g, '').toUpperCase();
const districtKey = (state, district) => `${upper(state)}|${normalizeDistrict(district).toUpperCase()}`;

/** One table row per entity with pending, largest first. level: 'state' | 'district' | 'dealer'. */
export function buildPendingRows({ level, states = [], districts = [], dealers = [], product = null, asOf = null }) {
  const waiting = new Map();
  dealers.forEach(dl => {
    if (!(dl.pendingQty > 0)) return;
    const k = level === 'state' ? upper(dl.state) : districtKey(dl.state, dl.district);
    waiting.set(k, (waiting.get(k) || 0) + 1);
  });

  const source = level === 'state' ? states : level === 'district' ? districts : dealers;
  const total = source.reduce((s, e) => s + (e.pendingQty || 0), 0);

  return source
    .filter(e => e.pendingQty > 0)
    .map(e => {
      const pending = e.pendingQty;
      const aging = agingOf(e);
      const pace = paceOf(e, product);
      const clearance = getBacklogClearance(pending, pace);
      const key = level === 'state' ? upper(e.state)
        : level === 'district' ? districtKey(e.state, e.district)
        : `${districtKey(e.state, e.district)}|${upper(e.client)}`;
      return {
        key,
        level,
        name: level === 'state' ? e.state : level === 'district' ? e.district : e.client,
        state: e.state,
        district: e.district || null,
        pending,
        share: total > 0 ? (pending / total) * 100 : 0,
        aging,
        over30: round2(aging.d31_60 + aging.d61_90 + aging.d90plus),
        oldest: e.oldestPendingDate || null,
        oldestDays: daysSince(e.oldestPendingDate, asOf),
        pace,
        daysToClear: clearance.days,
        clearStatus: clearance.status,
        despatchedThisMonth: e.cur || 0,
        dealersWaiting: level === 'dealer' ? 1 : (waiting.get(key) || 0),
      };
    })
    .sort((a, b) => b.pending - a.pending);
}

/** Headline figures, ageing, order months and products for the page. */
export function summarisePending({ dealers = [], products = [], product = null, asOf = null }) {
  const withPending = dealers.filter(dl => dl.pendingQty > 0);
  const total = withPending.reduce((s, dl) => s + dl.pendingQty, 0);
  const pace = dealers.reduce((s, dl) => s + paceOf(dl, product), 0);

  const aging = emptyAging();
  const bucketDealers = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  const byMonth = {};
  withPending.forEach(dl => {
    const a = agingOf(dl);
    Object.keys(aging).forEach(k => { aging[k] += a[k] || 0; });
    Object.keys(bucketDealers).forEach(k => { if (a[k] > 0) bucketDealers[k] += 1; });
    const f = scaleFactor(dl);
    Object.entries(dl.pendingHistory || {}).forEach(([mk, v]) => {
      if (v > 0) byMonth[mk] = (byMonth[mk] || 0) + v * f;
    });
  });
  Object.keys(aging).forEach(k => { aging[k] = round2(aging[k]); });

  const oldest = withPending.map(dl => dl.oldestPendingDate).filter(Boolean).sort()[0] || null;
  const noDespatch = withPending.filter(dl => !(dl.cur > 0));

  // From the dealers' own product lines, not data.products: under a filter
  // DataContext puts the national figure on any product with none pending in
  // scope (West Bengal showed all of India's IGG).
  const labels = new Map((products || []).map(p => [p.product, p.label || p.product]));
  const byProduct = new Map();
  withPending.forEach(dl => (dl.products || []).forEach(p => {
    if (!(p.pendingQty > 0) || (product && p.product !== product)) return;
    byProduct.set(p.product, (byProduct.get(p.product) || 0) + p.pendingQty);
  }));
  const productRows = [...byProduct]
    .map(([code, qty]) => ({ product: code, label: labels.get(code) || code, pending: round2(qty) }))
    .sort((a, b) => b.pending - a.pending);

  return {
    total: round2(total),
    dealerCount: withPending.length,
    pace,
    daysToClear: pace > 0 ? total / pace : null,
    aging,
    bucketDealers,
    over30: round2(aging.d31_60 + aging.d61_90 + aging.d90plus),
    oldest,
    oldestDays: daysSince(oldest, asOf),
    noDespatchCount: noDespatch.length,
    noDespatchQty: round2(noDespatch.reduce((s, dl) => s + dl.pendingQty, 0)),
    byMonth: Object.entries(byMonth)
      .map(([month, qty]) => ({ month, qty: round2(qty) }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    products: productRows,
  };
}
