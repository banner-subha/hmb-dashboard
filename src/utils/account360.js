// Account 360: one record per state, district and dealer that puts despatch,
// pending orders, outstanding, the business plan and field visits side by side,
// plus one Signal saying what the combination asks for.
//
// Pure functions only, so scripts/test-account360.mjs can run them under node.
//
// Each source keeps its own period. Despatch and pending come from latest.json
// (running month), the ledger has its own as-on date, the plan is the latest
// filed month and visits are month to date. The record carries those labels so
// the panel never sets two different months against each other unannounced.
//
// A source with no row for an account is `null`, never zero: "no ledger
// balance found" and "owes nothing" are different statements, and the Signal
// rules only fire on figures that were actually found.

import { normalizeStateName } from './constants.js';
import { salesKey, dealerKey, dealerStateKey } from './visits.js';
import { agingOf, daysSince } from './pendingOrders.js';
import { toPaise, fromPaise, formatINR, summarizeBook } from './outstanding.js';
import { formatMT } from './formatters.js';

// ── Keys ─────────────────────────────────────────────────────────────────────

export const stateKey = state => {
  const n = normalizeStateName(state || '');
  return n ? String(n).toUpperCase().replace(/\s+/g, '') : null;
};

/** Same district key the Visits tab joins despatch on. */
export const districtKey = salesKey;

/**
 * Exact identity of one despatch dealer row. The loose key cannot be used:
 * Murshidabad has a "KALIMATA HARDWARE" and a "Kalimata Hardware" on separate
 * rows, and they must not share a record.
 */
export const dealerRowKey = d => `${d.state}|${d.district}|${d.client}`;

// ── Signals ──────────────────────────────────────────────────────────────────

export const SIGNAL_LIMITS = {
  overdueDays: 60,   // a bill this far past due makes the next despatch a credit risk
  stuckShare: 0.3,   // share of pending older than 30 days that means orders are stuck
  behindPace: 0.7,   // under 70% of the plan target for the days gone
  convertPace: 0.5,  // visited as usual yet under half the plan target for the days gone
  untappedRatio: 3,  // market potential at least 3 times the target
  onTrackPace: 0.9,
};

/** In priority order: the first rule that matches is the row's Signal. `tone` names a .badge-theme-* class; `color` is the chart fill. */
export const SIGNALS = [
  { key: 'COLLECT_FIRST', label: 'Credit risk', tone: 'red', color: '#ef4444',
    action: 'Bills over 60 days late while orders wait. Collect before the next despatch.' },
  { key: 'ORDERS_STUCK', label: 'Delayed orders', tone: 'amber', color: '#f59e0b',
    action: 'Orders waiting over 30 days with no long-overdue bills. Chase plant and logistics.' },
  { key: 'VISIT_GAP', label: 'Low coverage', tone: 'amber', color: '#eab308',
    action: 'Behind plan and visited less than usual. Send the rep.' },
  { key: 'NOT_CONVERTING', label: 'Low conversion', tone: 'blue', color: '#4E8FF7',
    action: 'Visited as usual but buying well under plan. Check price, stock and the pitch.' },
  { key: 'UNTAPPED', label: 'Growth headroom', tone: 'cyan', color: '#06b6d4',
    action: 'Market potential far above the target. Raise the target next cycle.' },
  { key: 'ON_TRACK', label: 'On plan', tone: 'green', color: '#22c55e',
    action: 'At or ahead of plan with no long-overdue bills.' },
];

const PRIORITY = Object.fromEntries(SIGNALS.map((s, i) => [s.key, i]));
export const signalByKey = key => SIGNALS.find(s => s.key === key) || null;

const mt = n => formatMT(n, 1);

/**
 * The Signal for one dealer record, or null when nothing applies or there is
 * too little linked data to judge (despatch alone says nothing new).
 */
export function computeSignal(rec, limits = SIGNAL_LIMITS) {
  const { despatch, pending, outstanding: out, plan, visits, pace } = rec;
  if (![out, plan, visits].some(Boolean)) return null;

  const hit = (key, reason) => ({ ...signalByKey(key), reason });
  const lateBills = Boolean(out && out.overdue > 0 && (out.maxOverdueDays ?? 0) > limits.overdueDays);
  const waiting = pending.qty > 0;
  const visitedAsUsual = Boolean(visits && visits.cur >= Math.max(1, visits.usual));
  // Said in tonnes, not as a ratio: what was despatched against what the plan expected by now.
  const paceText = pace != null ? `${mt(despatch.cur)} despatched of ${mt(rec.planDue)} due by now` : null;

  if (lateBills && waiting) {
    return hit('COLLECT_FIRST',
      `${formatINR(out.overdue)} overdue, oldest bill ${Math.round(out.maxOverdueDays)} days late, ${mt(pending.qty)} waiting`);
  }
  if (waiting && pending.over30 >= limits.stuckShare * pending.qty) {
    return hit('ORDERS_STUCK', `${mt(pending.over30)} of ${mt(pending.qty)} pending is over 30 days old`);
  }
  if (pace != null && pace < limits.behindPace && visits && !visitedAsUsual) {
    return hit('VISIT_GAP', `${paceText}, ${visits.cur} visits against a usual ${visits.usual.toFixed(1)}`);
  }
  if (visitedAsUsual && (pace != null ? pace < limits.convertPace : !(despatch.cur > 0) && !(plan?.target > 0))) {
    return hit('NOT_CONVERTING', pace != null
      ? `${visits.cur} visits, ${paceText}`
      : `${visits.cur} visits this month, nothing despatched`);
  }
  if (plan && plan.potential > 0 && (pace == null || pace >= limits.onTrackPace) &&
      (plan.target > 0 ? plan.potential >= limits.untappedRatio * plan.target : true)) {
    return hit('UNTAPPED', plan.target > 0
      ? `Potential ${mt(plan.potential)} against a target of ${mt(plan.target)}`
      : `Potential ${mt(plan.potential)} with no target set`);
  }
  if (pace != null && pace >= limits.onTrackPace && !lateBills) {
    return hit('ON_TRACK', paceText);
  }
  return null;
}

/**
 * The Signal a state or district row shows. Normally its most urgent one; with
 * a Signal filter on, the filtered one, so a row listed under "Orders stuck"
 * does not display "Collect first".
 */
export function rollupSignal(rec, filterKey = 'ALL') {
  if (!rec) return null;
  if (filterKey === 'ALL') return rec.signal;
  const n = rec.signalCounts?.[filterKey];
  return n ? { ...signalByKey(filterKey), count: n } : null;
}

/** Sort value for a Signal cell: urgent first, then by how many dealers it covers. */
export function signalRank(sig) {
  if (!sig) return -1;
  return (SIGNALS.length - PRIORITY[sig.key]) * 100000 + (sig.count || 0);
}

// ── Source summaries ─────────────────────────────────────────────────────────

function group(rows, keyFn) {
  const m = new Map();
  rows.forEach(r => {
    const k = keyFn(r);
    if (!k) return;
    const a = m.get(k);
    if (a) a.push(r); else m.set(k, [r]);
  });
  return m;
}

/** The source's own spelling of the place, when every row agrees, for deep links. */
function placeOf(rows, stateField, districtField) {
  const one = field => {
    const vals = new Set(rows.map(r => r[field]).filter(Boolean));
    return vals.size === 1 ? [...vals][0] : null;
  };
  return { state: one(stateField), district: one(districtField) };
}

/**
 * A dealer shows its ledger rows' own overdue, as the Outstanding table does.
 * A state or district shows the Outstanding tab's headline figure, which nets
 * unadjusted credits off overdue bills; summing the rows instead overstates it.
 */
function sumOutstanding(rows, rollup = false) {
  if (!rows?.length) return null;
  const book = summarizeBook(rows);
  let maxOverdueDays = null;
  rows.forEach(r => {
    const d = r.max_bill_overdue_days;
    if (d != null && (maxOverdueDays == null || Number(d) > maxOverdueDays)) maxOverdueDays = Number(d);
  });
  const overdue = rollup ? book.overdue : fromPaise(rows.reduce((p, r) => p + toPaise(r.overdue_amount), 0));
  return {
    total: book.total,
    overdue,
    notDue: Math.max(0, book.total - overdue),
    maxOverdueDays,
    dealers: book.dealerCount,
    accountKey: rows.length === 1 ? rows[0].key : null,
    place: placeOf(rows, 'stateLabel', 'districtLabel'),
  };
}

function sumPlan(records) {
  if (!records?.length) return null;
  const s = { target: 0, potential: 0, accounts: records.length, filed: 0 };
  records.forEach(r => {
    s.target += Number(r.total_sp_target) || 0;
    s.potential += Number(r.total_potential) || 0;
    if (r.plan_status === 'submitted') s.filed += 1;
  });
  s.customer = records.length === 1 ? records[0].customer_name : null;
  s.place = placeOf(records, 'state', 'district');
  return s;
}

/**
 * Visits for the despatch month. The visit feed rolls over first (on 2 Oct it
 * is already "MTD 2026-10" while despatch still reads September), so when the
 * months differ the previous full month is used against the usual full month,
 * not two days of October against a September of despatch.
 */
const VISIT_FIELDS = {
  mtd: ['curVisits', 'histAvgVisitsMtd', 'curFabricatorVisits', 'histAvgFabricatorVisitsMtd'],
  prevMonth: ['prevVisits', 'histAvgVisits', 'prevFabricatorVisits', 'histAvgFabricatorVisits'],
};

function sumVisits(dealerRows, districtRows = [], mode = 'mtd') {
  if (!dealerRows?.length && !districtRows?.length) return null;
  const [cur, usual, fabCur, fabUsual] = VISIT_FIELDS[mode];
  const s = { cur: 0, usual: 0, fabricatorCur: 0, fabricatorUsual: 0 };
  (dealerRows || []).forEach(r => {
    s.cur += Number(r[cur]) || 0;
    s.usual += Number(r[usual]) || 0;
  });
  districtRows.forEach(r => {
    s.fabricatorCur += Number(r[fabCur]) || 0;
    s.fabricatorUsual += Number(r[fabUsual]) || 0;
  });
  s.usual = Math.round(s.usual * 10) / 10;
  s.fabricatorUsual = Math.round(s.fabricatorUsual * 10) / 10;
  s.place = placeOf([...(dealerRows || []), ...districtRows], 'state', 'district');
  const one = dealerRows?.length === 1 ? dealerRows[0] : null;
  s.dealer = one?.dealer ?? null;
  s.rep = one?.primaryRep ?? null;
  s.kro = one?.assignedKro ?? null;
  s.krm = one?.assignedKrm ?? null;
  return s;
}

function despatchAndPending(row, asOf) {
  const a = agingOf(row);
  return {
    despatch: { cur: Number(row.cur) || 0, prev: Number(row.prev) || 0 },
    products: (row.products || [])
      .map(p => ({ product: p.product, cur: Number(p.cur) || 0, prev: Number(p.prev) || 0, pending: Number(p.pendingQty) || 0 }))
      .filter(p => p.cur > 0 || p.prev > 0 || p.pending > 0)
      .sort((a, b) => b.cur - a.cur || b.prev - a.prev),
    pending: {
      qty: Number(row.pendingQty) || 0,
      aging: { d0_30: a.d0_30, d31_60: a.d31_60, d61_90: a.d61_90, d90plus: a.d90plus },
      over30: Math.round((a.d31_60 + a.d61_90 + a.d90plus) * 100) / 100,
      oldestDays: daysSince(row.oldestPendingDate, asOf),
    },
  };
}

const paceOf = (cur, plan, elapsedFraction) =>
  plan && plan.target > 0 && elapsedFraction > 0 ? cur / (plan.target * elapsedFraction) : null;

// ── Dealer matching ──────────────────────────────────────────────────────────

/**
 * Full key first (state, district, canonical name). Failing that, the state and
 * name, but only when that name is one dealer on both sides: one despatch row
 * in the state, and source rows that all sit in a single district (or none,
 * as on 442 ledger rows). That recovers district spellings the normaliser does
 * not fold without ever merging two traders who share a name.
 */
function makeDealerLookup(rows, pick, despatchNameCount) {
  const full = group(rows, r => { const p = pick(r); return dealerKey(p.state, p.district, p.name); });
  const byState = group(rows, r => { const p = pick(r); return dealerStateKey(p.state, p.name); });
  return d => {
    const f = full.get(dealerKey(d.state, d.district, d.client));
    if (f) return f;
    const sk = dealerStateKey(d.state, d.client);
    const cand = sk && despatchNameCount.get(sk) === 1 ? byState.get(sk) : null;
    if (!cand) return null;
    const districts = new Set(cand.map(r => { const p = pick(r); return districtKey(p.state, p.district); }).filter(Boolean));
    return districts.size <= 1 ? cand : null;
  };
}

// ── Model ────────────────────────────────────────────────────────────────────

/**
 * @param latest    { states, districts, dealers, meta } scoped, unfiltered (DataContext overallData + meta)
 * @param ledger    prepareBook() rows, or undefined while loading
 * @param plan      business_plan.json dataset, or undefined while loading
 * @param visits    visits_intelligence.json (scoped), or undefined while loading
 * @param despatchMonth 'YYYY-MM' of the running despatch cycle (getCurMonthKey)
 * @param allow     optional (state, district) => bool for client scope on the non-despatch sources
 */
export function buildAccount360({ latest, ledger, plan, visits, despatchMonth = null, allow = null }) {
  const meta = latest?.meta || {};
  const asOf = meta.dataAsOfDate || null;
  const elapsedFraction = Number(meta.elapsedFraction) ||
    (meta.daysInCurMonth ? Number(meta.curElapsedDays || 0) / Number(meta.daysInCurMonth) : 0);

  const keep = (state, district) => !allow || allow(state, district);
  const ledgerRows = ledger === undefined ? undefined
    : (ledger || []).filter(r => keep(r.stateLabel, r.districtLabel));
  const planRows = plan === undefined ? undefined
    : (plan?.records || []).filter(r => keep(r.state, r.district));
  const visitDealers = visits === undefined ? undefined : (visits?.dealers || []);
  const visitDistricts = visits === undefined ? undefined : (visits?.districts || []);
  const visitsMonth = String(visits?.meta?.curPeriod || '').match(/\d{4}-\d{2}/)?.[0] || null;
  const visitMode = visitsMonth && despatchMonth && visitsMonth > despatchMonth ? 'prevMonth' : 'mtd';
  const visitsPeriod = visitMode === 'prevMonth'
    ? String(visits?.meta?.prevPeriod || '').match(/\d{4}-\d{2}/)?.[0] || despatchMonth
    : visitsMonth;

  const dealers = latest?.dealers || [];
  const despatchNameCount = new Map();
  dealers.forEach(d => {
    const k = dealerStateKey(d.state, d.client);
    if (k) despatchNameCount.set(k, (despatchNameCount.get(k) || 0) + 1);
  });

  // undefined = still loading, so the lookup answers undefined too.
  const lookup = (rows, pick) => {
    if (rows === undefined) return () => undefined;
    const fn = makeDealerLookup(rows, pick, despatchNameCount);
    return d => fn(d);
  };
  const ledgerFor = lookup(ledgerRows, r => ({ state: r.stateLabel, district: r.districtLabel, name: r.dealer_name }));
  const planFor = lookup(planRows, r => ({ state: r.state, district: r.district, name: r.customer_name }));
  const visitsFor = lookup(visitDealers, r => ({ state: r.state, district: r.district, name: r.dealer }));
  const settle = (rows, fn) => (rows === undefined ? undefined : fn(rows));

  const dealerMap = new Map();
  dealers.forEach(d => {
    const base = despatchAndPending(d, asOf);
    const planSum = settle(planFor(d), sumPlan);
    const rec = {
      level: 'dealer',
      name: d.client,
      state: d.state,
      district: d.district,
      ...base,
      outstanding: settle(ledgerFor(d), sumOutstanding),
      plan: planSum,
      visits: settle(visitsFor(d), rows => sumVisits(rows, [], visitMode)),
      pace: paceOf(base.despatch.cur, planSum, elapsedFraction),
      planDue: planSum?.target > 0 ? planSum.target * elapsedFraction : null,
    };
    rec.signal = computeSignal(rec);
    dealerMap.set(dealerRowKey(d), rec);
  });

  const rollupLevel = (level, rows, keyOf, nameOf, srcKeyOf) => {
    const ledgerBy = ledgerRows && group(ledgerRows, r => srcKeyOf(r.stateLabel, r.districtLabel));
    const planBy = planRows && group(planRows, r => srcKeyOf(r.state, r.district));
    const visitBy = visitDealers && group(visitDealers, r => srcKeyOf(r.state, r.district));
    const fabBy = visitDistricts && group(visitDistricts, r => srcKeyOf(r.state, r.district));
    const dealersBy = group([...dealerMap.values()], r => srcKeyOf(r.state, r.district));

    const out = new Map();
    rows.forEach(row => {
      const k = keyOf(row);
      if (!k || out.has(k)) return;
      const base = despatchAndPending(row, asOf);
      const planSum = planBy ? sumPlan(planBy.get(k)) : undefined;
      const members = dealersBy.get(k) || [];
      const counts = {};
      members.forEach(m => { if (m.signal) counts[m.signal.key] = (counts[m.signal.key] || 0) + 1; });
      const topKey = SIGNALS.find(s => counts[s.key] > 0)?.key;
      // Rough size of what is at stake: overdue in lakh plus tonnes waiting.
      const stake = m => (m.outstanding?.overdue || 0) / 1e5 + m.pending.qty;
      out.set(k, {
        level,
        name: nameOf(row),
        state: row.state,
        district: level === 'district' ? row.district : null,
        ...base,
        outstanding: ledgerBy ? sumOutstanding(ledgerBy.get(k), true) : undefined,
        plan: planSum,
        visits: visitBy ? sumVisits(visitBy.get(k) || [], fabBy?.get(k) || [], visitMode) : undefined,
        pace: paceOf(base.despatch.cur, planSum, elapsedFraction),
        planDue: planSum?.target > 0 ? planSum.target * elapsedFraction : null,
        signal: topKey ? { ...signalByKey(topKey), count: counts[topKey] } : null,
        signalCounts: counts,
        dealerCount: members.length,
        topDealers: members
          .filter(m => m.signal && m.signal.key !== 'ON_TRACK')
          .sort((a, b) => PRIORITY[a.signal.key] - PRIORITY[b.signal.key] || stake(b) - stake(a))
          .slice(0, 8),
      });
    });
    return out;
  };

  const districts = rollupLevel('district', latest?.districts || [],
    r => districtKey(r.state, r.district), r => r.district, districtKey);
  const states = rollupLevel('state', latest?.states || [],
    r => stateKey(r.state), r => r.state, s => stateKey(s));

  // How much of the active book each source could be linked to.
  const active = [...dealerMap.values()].filter(r => r.despatch.cur > 0 || r.pending.qty > 0);
  const rate = field => (active.length && active.every(r => r[field] !== undefined)
    ? Math.round((active.filter(r => r[field]).length / active.length) * 1000) / 10
    : null);

  return {
    dealers: dealerMap,
    districts,
    states,
    meta: {
      despatchMonth,
      despatchPeriod: meta.curPeriod || null,
      asOf,
      elapsedFraction,
      planMonth: plan?.meta?.latestMonth || null,
      visitsPeriod,
      visitsFullMonth: visitMode === 'prevMonth',
      ledgerAsOn: (ledgerRows || []).reduce((m, r) => (r.as_on_date && r.as_on_date > m ? r.as_on_date : m), '') || null,
      activeDealers: active.length,
      matchRate: { outstanding: rate('outstanding'), plan: rate('plan'), visits: rate('visits') },
    },
  };
}
