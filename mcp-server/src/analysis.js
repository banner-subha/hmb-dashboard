export function calculateMoM(cur, prev) {
  if (!prev || prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export function sortByKey(arr, key, desc = true) {
  return [...arr].sort((a, b) => {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    return desc ? bv - av : av - bv;
  });
}

export function filterByState(arr, state) {
  if (!state) return arr;
  const s = String(state).replace(/\s+/g, '').toUpperCase();
  return arr.filter(item => String(item.state || '').replace(/\s+/g, '').toUpperCase() === s);
}

export function filterByDistrict(arr, district) {
  if (!district) return arr;
  const d = String(district).replace(/\s+/g, '').toUpperCase();
  return arr.filter(item => String(item.district || '').replace(/\s+/g, '').toUpperCase() === d);
}

export function filterByProduct(arr, product) {
  if (!product) return arr;
  const p = String(product).toUpperCase();
  return arr.filter(item => {
    const itemProd = item.product || '';
    return String(itemProd).toUpperCase() === p;
  });
}

export function normalizeState(s) {
  return String(s || '').replace(/\s+/g, '').toUpperCase();
}

export function summarizeState(state) {
  return {
    state: state.state,
    cur: state.cur,
    prev: state.prev,
    mom: state.mom,
    momStr: `${state.mom}%`,
    ytd: state.ytd,
    share: state.share,
    drop: state.drop,
    pendingQty: state.pendingQty,
    dailyAvgQty: state.dailyAvgQty,
    currentDailyRate: state.currentDailyRate,
    expectedMtd: state.expectedMtd,
    lossDelta: state.lossDelta,
    lossDeltaPct: state.lossDeltaPct,
    lossFlag: state.lossFlag,
    impactTier: state.impactTier,
    impactScore: state.impactScore,
    products: (state.products || []).map(p => ({
      product: p.product,
      cur: p.cur,
      prev: p.prev,
      mom: p.mom
    }))
  };
}

export function summarizeDistrict(dist) {
  return {
    state: dist.state,
    district: dist.district,
    cur: dist.cur,
    prev: dist.prev,
    mom: dist.mom,
    momStr: `${dist.mom}%`,
    ytd: dist.ytd,
    drop: dist.drop,
    pendingQty: dist.pendingQty,
    dailyAvgQty: dist.dailyAvgQty,
    currentDailyRate: dist.currentDailyRate,
    expectedMtd: dist.expectedMtd,
    lossFlag: dist.lossFlag,
    impactTier: dist.impactTier,
    impactScore: dist.impactScore,
    products: (dist.products || []).map(p => ({
      product: p.product,
      cur: p.cur,
      prev: p.prev,
      mom: p.mom
    }))
  };
}

export function summarizeDealer(dl) {
  return {
    client: dl.client,
    state: dl.state,
    district: dl.district,
    cur: dl.cur,
    prev: dl.prev,
    mom: dl.mom,
    momStr: `${dl.mom}%`,
    ytd: dl.ytd,
    drop: dl.drop,
    pendingQty: dl.pendingQty,
    dailyAvgQty: dl.dailyAvgQty,
    currentDailyRate: dl.currentDailyRate,
    isInactive: dl.isInactive || false,
    products: (dl.products || []).map(p => ({
      product: p.product,
      cur: p.cur,
      prev: p.prev,
      mom: p.mom
    }))
  };
}

export function summarizeAlert(alert) {
  return {
    severity: alert.severity,
    level: alert.level || alert.category,
    state: alert.state,
    district: alert.district,
    title: alert.title,
    detail: alert.detail || alert.reason,
    period: alert.period,
    impactScore: alert.impactScore
  };
}

export function findProductByName(data, productName) {
  const p = String(productName || '').toUpperCase();
  return (data.products || []).find(prod => String(prod.product || '').toUpperCase() === p);
}
