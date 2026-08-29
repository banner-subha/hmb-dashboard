// Display helpers for pending-order backlog ageing.
// Pure functions only — never mutate entity objects.

export const AGING_BUCKETS = [
  { key: 'd0_30',   label: '0–30d',   fullLabel: 'Within 30 days',   colorClass: 'bg-emerald-500',   textClass: 'text-emerald-500' },
  { key: 'd31_60',  label: '31–60d',  fullLabel: '31–60 days old',   colorClass: 'bg-amber-500',     textClass: 'text-amber-500' },
  { key: 'd61_90',  label: '61–90d',  fullLabel: '61–90 days old',   colorClass: 'bg-orange-500',    textClass: 'text-orange-500' },
  { key: 'd90plus', label: '90d+',    fullLabel: 'Over 90 days old', colorClass: 'bg-severity-critical', textClass: 'text-severity-critical' },
];

export function emptyAging() {
  return { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, unknown: 0 };
}

export function bucketForAgeDays(days) {
  if (days == null || isNaN(days)) return 'unknown';
  if (days <= 30) return 'd0_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90plus';
}

// Fallback when backend pendingAge is absent (older payload): derive month-level
// buckets from pendingHistory ({ "YYYY-MM": mt }) measured against dataAsOfDate.
export function agingFromPendingHistory(pendingHistory, dataAsOfDate) {
  const aging = emptyAging();
  if (!pendingHistory || typeof pendingHistory !== 'object') return aging;
  const asOf = dataAsOfDate ? new Date(`${dataAsOfDate}T00:00:00Z`) : new Date();
  if (isNaN(asOf.getTime())) return aging;
  for (const [periodKey, mt] of Object.entries(pendingHistory)) {
    const m = String(periodKey).match(/^(\d{4})-(\d{2})$/);
    if (!m) continue;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    // Age measured from the END of the order month (most conservative, orders
    // placed during that month cannot be older than its last day).
    const monthEnd = new Date(Date.UTC(year, month, 0, 12, 0, 0));
    const ageDays = Math.floor((asOf - monthEnd) / 86400000);
    aging[bucketForAgeDays(ageDays)] += (mt || 0);
  }
  Object.keys(aging).forEach(k => { aging[k] = Math.round(aging[k] * 100) / 100; });
  return aging;
}

// Get an entity's ageing profile: prefer backend-computed pendingAge (day-precise),
// else derive from pendingHistory (month-precision, estimated).
export function getEntityAging(entity, dataAsOfDate) {
  if (!entity) return { aging: emptyAging(), estimated: false };
  if (entity.pendingAge && typeof entity.pendingAge === 'object') {
    return { aging: { ...emptyAging(), ...entity.pendingAge }, estimated: false };
  }
  if (entity.pendingHistory && Object.keys(entity.pendingHistory).length > 0) {
    return { aging: agingFromPendingHistory(entity.pendingHistory, dataAsOfDate), estimated: true };
  }
  return { aging: emptyAging(), estimated: false };
}

export function aggregateAging(list) {
  const total = emptyAging();
  (list || []).forEach(e => {
    const { aging } = getEntityAging(e, null);
    const src = e.pendingAge || aging;
    Object.keys(total).forEach(k => { total[k] += (src[k] || 0); });
  });
  Object.keys(total).forEach(k => { total[k] = Math.round(total[k] * 100) / 100; });
  return total;
}

export function agingTotal(aging) {
  if (!aging) return 0;
  return Object.values(aging).reduce((a, b) => a + (b || 0), 0);
}

export function agingShare(aging, keys) {
  const total = agingTotal(aging);
  if (!total) return 0;
  const sum = keys.reduce((a, k) => a + (aging[k] || 0), 0);
  return Math.round((sum / total) * 100);
}

// "12 Mar 2026 · 5 months" — human age of the oldest open backlog.
export function oldestBacklogLabel(oldestDateStr, dataAsOfDate) {
  if (!oldestDateStr) return null;
  const d = new Date(`${oldestDateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const asOf = dataAsOfDate ? new Date(`${dataAsOfDate}T00:00:00Z`) : new Date();
  const ageDays = isNaN(asOf.getTime()) ? 0 : Math.max(0, Math.floor((asOf - d) / 86400000));
  const months = ageDays < 60 ? null : Math.round(ageDays / 30.4);
  let ageStr;
  if (ageDays <= 1) ageStr = 'placed today';
  else if (ageDays < 60) ageStr = `${ageDays} days ago`;
  else if (ageDays < 365) ageStr = `~${months} months old`;
  else ageStr = `~${(ageDays / 365).toFixed(1)} years old`;
  const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return { label, ageStr, ageDays };
}
