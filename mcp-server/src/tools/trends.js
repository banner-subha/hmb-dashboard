import { getData } from '../dataLoader.js';
import { sortByKey } from '../analysis.js';

export function getSalesTrend({ months } = {}, data) {
  const d = data || getData();
  const history = d.monthlyHistory || {};
  const available = d.availableMonths || [];

  const sorted = sortByKey(available, 'month', false)
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const limit = months && months > 0 ? Math.min(months, sorted.length) : sorted.length;
  const selected = sorted.slice(0, limit);

  const trend = selected.map(m => {
    const key = m.periodKey;
    const entry = history[key];
    return {
      periodKey: key,
      label: m.label,
      year: m.year,
      month: m.month,
      total: entry?.total || 0,
      stateCount: entry?.states?.length || 0,
      districtCount: entry?.districts?.length || 0,
      topStates: (entry?.states || []).slice(0, 5).map(s => ({
        state: s.state,
        qty: s.qty,
        share: s.share
      })),
      products: (entry?.products || []).map(p => ({
        product: p.product,
        label: p.label,
        qty: p.qty,
        share: p.share
      }))
    };
  });

  return {
    monthsAvailable: sorted.length,
    monthsReturned: trend.length,
    trend
  };
}
