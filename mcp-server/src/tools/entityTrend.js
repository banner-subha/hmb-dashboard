import { getData } from '../dataLoader.js';
import { sortByKey } from '../analysis.js';

const normName = (name) => String(name || '').replace(/\s+/g, '').toUpperCase();

export function getEntityTrend({ entityType, entityName, months = 6 } = {}, data) {
  const d = data || getData();
  if (!entityType || !entityName) {
    return { error: 'entityType and entityName parameters are required', trend: [] };
  }

  const history = d.monthlyHistory || {};
  const available = d.availableMonths || [];

  const sorted = sortByKey(available, 'month', false)
    .sort((a, b) => b.year - a.year || b.month - a.month);
  const limit = months && months > 0 ? Math.min(months, sorted.length) : sorted.length;
  const selected = sorted.slice(0, limit);

  const type = String(entityType).toLowerCase();
  const want = normName(entityName);

  const findIn = (entry) => {
    const key = want;
    if (type === 'state') {
      return (entry.states || []).find(x => normName(x.state) === key) || null;
    }
    if (type === 'district') {
      return (entry.districts || []).find(x => normName(x.district) === key) || null;
    }
    if (type === 'dealer') {
      return (entry.dealers || []).find(x => normName(x.client) === key) || null;
    }
    if (type === 'product') {
      return (entry.products || []).find(x => normName(x.product) === key) || null;
    }
    return null;
  };

  const rows = [];
  let prevTotal = null;
  for (const m of selected) {
    const entry = history[m.periodKey];
    const total = entry?.overall ?? entry?.total ?? 0;
    const item = entry ? findIn(entry) : null;
    const qty = item?.cur ?? item?.qty ?? 0;
    const mom = prevTotal != null && prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
    prevTotal = total;

    rows.push({
      periodKey: m.periodKey,
      label: m.label,
      year: m.year,
      month: m.month,
      total,
      qty,
      share: total > 0 ? Math.round((qty / total) * 100) : 0,
      mom
    });
  }

  return {
    entityType: type,
    entityName,
    monthsRequested: limit,
    monthsAvailable: sorted.length,
    monthsReturned: rows.length,
    trend: rows
  };
}
