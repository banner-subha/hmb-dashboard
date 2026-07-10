import { getData } from '../dataLoader.js';
import {
  calculateMoM, sortByKey, filterByState, filterByDistrict,
  findProductByName, normalizeState
} from '../analysis.js';
import { getOverview } from './overview.js';
import { getStates } from './states.js';
import { getDistricts } from './districts.js';
import { getProductMix } from './products.js';
import { getSalesTrend } from './trends.js';
import { getAlerts } from './alerts.js';
import { getTopDealers } from './dealers.js';

function tokenize(q) {
  return q.toLowerCase().replace(/[?.!,]/g, '').split(/\s+/).filter(Boolean);
}

function matchState(tokens, stateNames) {
  for (const name of stateNames) {
    const norm = normalizeState(name);
    const parts = norm.split(/\s+/);
    for (const token of tokens) {
      if (parts.some(p => p === token.toUpperCase()) || norm === token.toUpperCase().replace(/\s+/g, '')) {
        return name;
      }
    }
  }
  return null;
}

function matchProduct(tokens, productCodes) {
  for (const code of productCodes) {
    const cl = code.toLowerCase();
    for (const token of tokens) {
      if (token === cl || token.startsWith(cl) || cl.startsWith(token)) {
        return code;
      }
    }
  }
  return null;
}

export function askSalesQuestion({ question }, data) {
  const d = data || getData();
  const q = question || '';
  const tokens = tokenize(q);
  const stateNames = (d.states || []).map(s => s.state).filter(Boolean);
  const productCodes = (d.products || []).map(p => p.product).filter(Boolean);

  const askedState = matchState(tokens, stateNames);
  const askedProduct = matchProduct(tokens, productCodes);

  const intent = detectIntent(tokens, q);

  return answerIntent(intent, { askedState, askedProduct, question: q }, d);
}

function detectIntent(tokens, q) {
  const lower = q.toLowerCase();

  if (tokens.some(t => ['trend', 'history', 'historical', 'monthly', 'month', 'over_time', 'overtime'].includes(t))) {
    return 'trend';
  }
  if (tokens.some(t => ['alert', 'risk', 'critical', 'warning', 'escalation', 'issue', 'problem'].includes(t))) {
    return 'alerts';
  }
  if (tokens.some(t => ['dealer', 'dealer', 'customer', 'client', 'distributor'].includes(t))) {
    return 'dealers';
  }
  if (tokens.some(t => ['product', 'mix', 'ig', 'gi', 'igg', 'pipe', 'roofing', 'stainless'].includes(t))) {
    return 'products';
  }
  if (tokens.some(t => ['district', 'dist'].includes(t))) {
    return 'districts';
  }
  if (tokens.some(t => ['state', 'region', 'geography'].includes(t))) {
    return 'states';
  }
  if (tokens.some(t => ['worst', 'worst-performing', 'decline', 'dropped', 'declining', 'bottom'].includes(t))) {
    return 'worst_states';
  }
  if (tokens.some(t => ['best', 'best-performing', 'top', 'growth', 'growing', 'improving'].includes(t))) {
    return 'best_states';
  }
  if (tokens.some(t => ['pending', 'outstanding', 'backlog', 'undespatched'].includes(t))) {
    return 'pending';
  }
  if (tokens.some(t => ['overview', 'summary', 'kpi', 'dashboard', 'overall', 'total', 'all'].includes(t))) {
    return 'overview';
  }

  return 'overview';
}

function answerIntent(intent, ctx, d) {
  switch (intent) {
    case 'overview':
      return answerOverview(ctx, d);
    case 'states':
      return answerStates(ctx, d);
    case 'worst_states':
      return answerWorstStates(ctx, d);
    case 'best_states':
      return answerBestStates(ctx, d);
    case 'districts':
      return answerDistricts(ctx, d);
    case 'products':
      return answerProducts(ctx, d);
    case 'trend':
      return answerTrend(ctx, d);
    case 'alerts':
      return answerAlerts(ctx, d);
    case 'dealers':
      return answerDealers(ctx, d);
    case 'pending':
      return answerPending(ctx, d);
    default:
      return answerOverview(ctx, d);
  }
}

function getMetricSummary(d) {
  const meta = d.meta || {};
  return {
    curPeriod: meta.curPeriod || 'N/A',
    prevPeriod: meta.prevPeriod || 'N/A',
    totalCur: d.totalCur ?? 0,
    totalPrev: d.totalPrev ?? 0,
    totalMoM: d.totalMoM ?? 0,
    pendingTotal: d.pendingTotal ?? 0,
    dailyAvgQty: d.dailyAvgQty ?? 0,
    currentDailyRate: d.currentDailyRate ?? 0,
    lossFlag: d.lossFlag ?? 'NO_DATA',
    alertCount: d.alertCount ?? 0,
    criticalCount: d.criticalCount ?? 0,
    dataAsOfDate: meta.dataAsOfDate || meta.generatedAt || 'N/A'
  };
}

function answerOverview(ctx, d) {
  const s = getMetricSummary(d);
  const overview = getOverview({}, d);
  const topStates = overview.products || [];
  const topProduct = topStates[0];

  const lines = [
    `Sales Overview (as of ${s.dataAsOfDate})`,
    `Current Period: ${s.curPeriod}`,
    `Previous Period: ${s.prevPeriod}`,
    ``,
    `Total Current: ${s.totalCur.toFixed(2)} MT`,
    `Total Previous: ${s.totalPrev.toFixed(2)} MT`,
    `MoM Change: ${s.totalMoM}%`,
    `Pending Total: ${s.pendingTotal.toFixed(2)} MT`,
    `Daily Avg: ${s.dailyAvgQty.toFixed(2)} MT/day`,
    `Current Rate: ${s.currentDailyRate.toFixed(2)} MT/day`,
    `Status: ${s.lossFlag}`,
    `Active Alerts: ${s.alertCount} (Critical: ${s.criticalCount}, High: ${s.highCount})`,
  ];

  if (topProduct) {
    lines.push(``, `Top Product: ${topProduct.label} — ${topProduct.cur} MT (${topProduct.mom}% MoM)`);
  }

  return { type: 'overview', summary: s, text: lines.join('\n') };
}

function answerStates(ctx, d) {
  const statesResult = getStates({ state: ctx.askedState || undefined }, d);
  const states = statesResult.states;

  if (states.length === 0) return { type: 'states', text: 'No state data available.' };

  const totalCur = states.reduce((s, st) => s + st.cur, 0);
  const totalPrev = states.reduce((s, st) => s + st.prev, 0);

  const lines = [
    ctx.askedState
      ? `State: ${ctx.askedState}`
      : `All States (${states.length} total)`,
    `Combined: ${totalCur.toFixed(2)} MT current, ${totalPrev.toFixed(2)} MT previous`,
    ``
  ];

  for (const st of states.slice(0, 10)) {
    lines.push(
      `${st.state}: ${st.cur.toFixed(2)} MT (${st.mom}% MoM, ${st.share}% share, pending: ${st.pendingQty} MT)`
    );
  }
  if (states.length > 10) lines.push(`... and ${states.length - 10} more states`);

  return { type: 'states', count: states.length, states: states.slice(0, 50), text: lines.join('\n') };
}

function answerWorstStates(ctx, d) {
  const statesResult = getStates({}, d);
  const sorted = sortByKey(statesResult.states, 'mom', false);
  const worst = sorted.slice(0, 5);

  const lines = ['Worst Performing States (by MoM):', ''];
  for (const st of worst) {
    lines.push(`${st.state}: ${st.cur.toFixed(2)} MT (${st.mom}% MoM, drop of ${st.drop.toFixed(2)} MT)`);
  }

  return { type: 'worst_states', states: worst, text: lines.join('\n') };
}

function answerBestStates(ctx, d) {
  const statesResult = getStates({}, d);
  const sorted = sortByKey(statesResult.states, 'mom', true);
  const best = sorted.slice(0, 5);

  const lines = ['Best Performing States (by MoM):', ''];
  for (const st of best) {
    lines.push(`${st.state}: ${st.cur.toFixed(2)} MT (${st.mom}% MoM, share: ${st.share}%)`);
  }

  return { type: 'best_states', states: best, text: lines.join('\n') };
}

function answerDistricts(ctx, d) {
  const distResult = getDistricts({ state: ctx.askedState || undefined }, d);
  const districts = distResult.districts;

  if (districts.length === 0) {
    return { type: 'districts', text: ctx.askedState ? `No district data for ${ctx.askedState}.` : 'No district data available.' };
  }

  const totalCur = districts.reduce((s, d) => s + d.cur, 0);
  const totalPrev = districts.reduce((s, d) => s + d.prev, 0);

  const lines = [
    ctx.askedState ? `Districts in ${ctx.askedState}` : `All Districts (${districts.length} total, showing top 15)`,
    `Combined: ${totalCur.toFixed(2)} MT current, ${totalPrev.toFixed(2)} MT previous`,
    ``
  ];

  for (const dist of districts.slice(0, 15)) {
    lines.push(
      `${dist.district} (${dist.state}): ${dist.cur.toFixed(2)} MT (${dist.mom}% MoM, pending: ${dist.pendingQty} MT)`
    );
  }

  return { type: 'districts', count: districts.length, districts: districts.slice(0, 50), text: lines.join('\n') };
}

function answerProducts(ctx, d) {
  const prodResult = getProductMix({ product: ctx.askedProduct || undefined }, d);
  const products = prodResult.products;

  if (products.length === 0) {
    return { type: 'products', text: 'No product data available.' };
  }

  const lines = ctx.askedProduct
    ? [`Product: ${ctx.askedProduct}`]
    : [`Product Mix (${products.length} products)`];
  lines.push('');

  for (const p of products) {
    lines.push(
      `${p.label}: ${p.cur.toFixed(2)} MT (${p.mom}% MoM, ${p.share}% share, pending: ${p.pendingQty} MT, ${p.lossFlag})`
    );
  }

  return { type: 'products', products, text: lines.join('\n') };
}

function answerTrend(ctx, d) {
  const trendResult = getSalesTrend({ months: 6 }, d);
  const trend = trendResult.trend;

  if (trend.length === 0) return { type: 'trend', text: 'No trend data available.' };

  const lines = ['Sales Trend (Last 6 Months):', ''];
  for (const m of trend) {
    lines.push(`${m.label}: ${m.total.toFixed(2)} MT (${m.stateCount} states, ${m.districtCount} districts)`);
  }
  if (trend.length >= 2) {
    const change = calculateMoM(trend[0].total, trend[1].total);
    lines.push('', `Current vs Previous Month: ${change}%`);
  }

  return { type: 'trend', trend, text: lines.join('\n') };
}

function answerAlerts(ctx, d) {
  const alertResult = getAlerts({}, d);
  const alerts = alertResult.alerts;

  if (alerts.length === 0) return { type: 'alerts', text: 'No active alerts.' };

  const bySeverity = (sev) => alerts.filter(a => a.severity === sev);

  const lines = [
    `Active Alerts: ${alerts.length}`,
    `Critical: ${alertResult.criticalCount} | High: ${alertResult.highCount} | Medium: ${alertResult.mediumCount}`,
    ``
  ];

  for (const sev of ['CRITICAL', 'HIGH', 'MEDIUM']) {
    const sevAlerts = bySeverity(sev);
    if (sevAlerts.length > 0) {
      lines.push(`--- ${sev} ---`);
      for (const a of sevAlerts.slice(0, 5)) {
        lines.push(`${a.title || a.detail}`);
      }
      if (sevAlerts.length > 5) lines.push(`... and ${sevAlerts.length - 5} more ${sev} alerts`);
      lines.push('');
    }
  }

  return { type: 'alerts', alerts: alerts.slice(0, 50), text: lines.join('\n') };
}

function answerDealers(ctx, d) {
  const dealerResult = getTopDealers({
    limit: 15,
    state: ctx.askedState || undefined
  }, d);
  const dealers = dealerResult.dealers;

  if (dealers.length === 0) {
    return { type: 'dealers', text: 'No dealer data available.' };
  }

  const lines = [
    ctx.askedState ? `Top Dealers in ${ctx.askedState}` : `Top Dealers (showing ${dealers.length})`,
    ``
  ];

  for (const dl of dealers) {
    const inactive = dl.isInactive ? ' [INACTIVE]' : '';
    lines.push(
      `${dl.client} (${dl.district}, ${dl.state}): ${dl.cur.toFixed(2)} MT${inactive}`
    );
  }

  return { type: 'dealers', dealers, text: lines.join('\n') };
}

function answerPending(ctx, d) {
  const statesResult = getStates({}, d);
  const states = statesResult.states;
  const totalPending = d.pendingTotal ?? 0;

  if (states.length === 0) return { type: 'pending', text: 'No pending data available.' };

  const sorted = sortByKey(states, 'pendingQty', true);
  const lines = [
    `Total Pending: ${totalPending.toFixed(2)} MT`,
    `Top States by Pending:`,
    ``
  ];

  for (const st of sorted.slice(0, 10)) {
    lines.push(`${st.state}: ${st.pendingQty.toFixed(2)} MT`);
  }

  return { type: 'pending', totalPending, states: sorted.slice(0, 50), text: lines.join('\n') };
}
