import { getData } from '../dataLoader.js';

export function getOverview(data) {
  const d = data || getData();
  return {
    meta: d.meta || {},
    totalCur: d.totalCur ?? 0,
    totalPrev: d.totalPrev ?? 0,
    totalMoM: d.totalMoM ?? 0,
    totalMoMDisplay: `${d.totalMoM ?? 0}%`,
    pendingTotal: d.pendingTotal ?? 0,
    dailyAvgQty: d.dailyAvgQty ?? 0,
    currentDailyRate: d.currentDailyRate ?? 0,
    expectedMtd: d.expectedMtd ?? 0,
    lossFlag: d.lossFlag ?? 'NO_DATA',
    alertCount: d.alertCount ?? 0,
    criticalCount: d.criticalCount ?? 0,
    highCount: d.highCount ?? 0,
    mediumCount: d.mediumCount ?? 0,
    products: (d.products || []).map(p => ({
      product: p.product,
      label: p.label,
      cur: p.cur,
      prev: p.prev,
      mom: p.mom,
      share: p.share,
      pendingQty: p.pendingQty,
      lossFlag: p.lossFlag,
      impactTier: p.impactTier,
      impactScore: p.impactScore
    }))
  };
}
