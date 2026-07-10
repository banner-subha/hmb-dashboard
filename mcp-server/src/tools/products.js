import { getData } from '../dataLoader.js';
import { findProductByName } from '../analysis.js';

export function getProductMix({ product } = {}, data) {
  const d = data || getData();
  let products = d.products || [];

  if (product) {
    const found = findProductByName(d, product);
    products = found ? [found] : [];
  }

  return {
    count: products.length,
    products: products.map(p => ({
      product: p.product,
      label: p.label,
      cur: p.cur,
      prev: p.prev,
      ytd: p.ytd,
      mom: p.mom,
      momStr: `${p.mom}%`,
      share: p.share,
      pendingQty: p.pendingQty,
      dailyAvgQty: p.dailyAvgQty,
      currentDailyRate: p.currentDailyRate,
      expectedMtd: p.expectedMtd,
      lossDelta: p.lossDelta,
      lossDeltaPct: p.lossDeltaPct,
      lossFlag: p.lossFlag,
      impactTier: p.impactTier,
      impactScore: p.impactScore
    }))
  };
}
