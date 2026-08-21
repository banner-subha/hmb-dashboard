import { calculateMoM, getBusinessImpact } from './trendEngine.js';
import { isRealState } from './constants.js';
import { normalizeDistrict } from './districtNormalizer.js';

/**
 * Returns the active current month's key (e.g. "2026-07").
 * Derived by looking at the month following the first element of availableMonths
 * or defaulting to July 2026.
 */
export function getCurMonthKey(rawData) {
  if (rawData?.availableMonths?.length > 0) {
    const first = rawData.availableMonths[0];
    return first.key || first.periodKey || '2026-07';
  }
  return '2026-07';
}

/**
 * Compiles the list of available dispatch months.
 */
export function getDespatchAvailableMonths(rawData) {
  if (!rawData) return [];
  return (rawData.availableMonths || []).map(m => ({
    ...m,
    key: m.key || m.periodKey,
    periodKey: m.key || m.periodKey
  }));
}

/**
 * Returns the previous month's period key.
 */
export function getPrevPeriodKey(pKey) {
  if (!pKey) return null;
  const [year, month] = pKey.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Loads and filters states for a given historical month.
 */
export function getHistoricalStates(rawData, filters, periodKey) {
  if (!rawData || !periodKey) return [];
  const historySlice = rawData.monthlyHistory?.[periodKey];
  if (!historySlice) return [];
  
  const prevPeriodKey = getPrevPeriodKey(periodKey);
  const prevHistorySlice = rawData.monthlyHistory?.[prevPeriodKey];
  
  let states = (historySlice.states || []).filter(st => st.state && isRealState(st.state));
  
  // 1. Filter by selectedState
  if (filters?.selectedState) {
    const s = filters.selectedState.replace(/\s+/g, '').toUpperCase();
    states = states.filter(st => st.state && st.state.replace(/\s+/g, '').toUpperCase() === s);
  }
  
  // 2. Map and compute cur/prev/mom/share/etc.
  let mapped = states.map(hs => {
    const stateName = hs.state;
    const prevState = prevHistorySlice?.states?.find(ps => ps.state?.toLowerCase() === stateName?.toLowerCase());
    const mainState = rawData.states?.find(s => s.state?.toLowerCase() === stateName?.toLowerCase());
    
    let cur = hs.cur ?? hs.qty ?? 0;
    let prev = prevState ? (prevState.cur ?? prevState.qty ?? 0) : 0;
    
    // Handle product filter
    if (filters?.selectedProduct) {
      const p = filters.selectedProduct;
      cur = hs.products?.find(pr => pr.product === p)?.cur ?? hs.products?.find(pr => pr.product === p)?.qty ?? 0;
      prev = prevState?.products?.find(pr => pr.product === p)?.cur ?? prevState?.products?.find(pr => pr.product === p)?.qty ?? 0;
    }
    
    const mom = calculateMoM(cur, prev);
    const drop = prev - cur;
    
    return {
      ...hs,
      // order-to-despatch lead time from backend (DESPATCH_DATE - ORDER_DATE)
      avgPeriod: mainState?.avgPeriod ?? hs.avgPeriod ?? null,
      cur,
      prev,
      mom,
      drop,
      expectedMtd: mainState?.expectedMtd ?? 0,
      dailyAvgQty: mainState?.dailyAvgQty ?? 0,
      currentDailyRate: mainState?.currentDailyRate ?? 0,
    };
  });
  
  // If product filter is active, filter out states with 0 cur and 0 prev
  if (filters?.selectedProduct) {
    mapped = mapped.filter(st => st.cur > 0 || st.prev > 0);
  }
  
  // Compute share % based on the sum of all states' cur volumes in the filtered dataset
  const totalCur = mapped.reduce((sum, s) => sum + s.cur, 0);
  mapped = mapped.map(st => {
    const share = totalCur > 0 ? Math.round((st.cur / totalCur) * 100) : 0;
    const { severity, impactScore } = getBusinessImpact(st.cur, st.prev, share, 'STATE', st.state, st.expectedMtd);
    return {
      ...st,
      share,
      impactScore,
      severity,
      impactTier: severity,
      healthStatus: severity,
    };
  });
  
  return mapped;
}

/**
 * Loads and filters districts for a given historical month.
 */
export function getHistoricalDistricts(rawData, filters, periodKey) {
  if (!rawData || !periodKey) return [];
  const historySlice = rawData.monthlyHistory?.[periodKey];
  if (!historySlice) return [];
  
  const prevPeriodKey = getPrevPeriodKey(periodKey);
  const prevHistorySlice = rawData.monthlyHistory?.[prevPeriodKey];
  
  let districts = historySlice.districts || [];
  
  // 1. Filter by selectedState
  if (filters?.selectedState) {
    const s = filters.selectedState.replace(/\s+/g, '').toUpperCase();
    districts = districts.filter(d => d.state && d.state.replace(/\s+/g, '').toUpperCase() === s);
  }
  
  // 2. Filter by selectedDistrict
  if (filters?.selectedDistrict) {
    const d = normalizeDistrict(filters.selectedDistrict).toUpperCase();
    districts = districts.filter(dist => normalizeDistrict(dist.district).toUpperCase() === d);
  }
  
  // 3. Map and compute
  let mapped = districts.map(hd => {
    const normDist = normalizeDistrict(hd.district, hd.state);
    const key = (hd.state + '_' + normDist).toLowerCase();
    const prevDist = prevHistorySlice?.districts?.find(pd => (pd.state + '_' + normalizeDistrict(pd.district, pd.state)).toLowerCase() === key);
    const mainDist = rawData.districts?.find(pd => (pd.state + '_' + normalizeDistrict(pd.district, pd.state)).toLowerCase() === key);
    
    let cur = hd.cur ?? hd.qty ?? 0;
    let prev = prevDist ? (prevDist.cur ?? prevDist.qty ?? 0) : 0;
    
    if (filters?.selectedProduct) {
      const p = filters.selectedProduct;
      cur = hd.products?.find(pr => pr.product === p)?.cur ?? hd.products?.find(pr => pr.product === p)?.qty ?? 0;
      prev = prevDist?.products?.find(pr => pr.product === p)?.cur ?? prevDist?.products?.find(pr => pr.product === p)?.qty ?? 0;
    }
    
    const mom = calculateMoM(cur, prev);
    const drop = prev - cur;
    
    return {
      ...hd,
      district: normDist,
      avgPeriod: mainDist?.avgPeriod ?? hd.avgPeriod ?? null,
      cur,
      prev,
      mom,
      drop,
      expectedMtd: mainDist?.expectedMtd ?? 0,
      dailyAvgQty: mainDist?.dailyAvgQty ?? 0,
      currentDailyRate: mainDist?.currentDailyRate ?? 0,
    };
  });
  
  if (filters?.selectedProduct) {
    mapped = mapped.filter(d => d.cur > 0 || d.prev > 0);
  }
  
  const totalCur = mapped.reduce((sum, d) => sum + d.cur, 0);
  mapped = mapped.map(dist => {
    const share = totalCur > 0 ? Math.round((dist.cur / totalCur) * 100) : 0;
    const { severity, impactScore } = getBusinessImpact(dist.cur, dist.prev, share, 'DISTRICT', dist.state, dist.expectedMtd);
    return {
      ...dist,
      share,
      impactScore,
      severity,
      impactTier: severity,
      healthStatus: severity,
    };
  });
  
  return mapped;
}

/**
 * Loads and filters dealers for a given historical month.
 */
export function getHistoricalDealers(rawData, filters, periodKey) {
  if (!rawData || !periodKey) return [];
  const historySlice = rawData.monthlyHistory?.[periodKey];
  if (!historySlice) return [];
  
  const prevPeriodKey = getPrevPeriodKey(periodKey);
  const prevHistorySlice = rawData.monthlyHistory?.[prevPeriodKey];
  
  let dealers = historySlice.dealers || [];
  
  // 1. Filter by selectedState
  if (filters?.selectedState) {
    const s = filters.selectedState.replace(/\s+/g, '').toUpperCase();
    dealers = dealers.filter(dl => dl.state && dl.state.replace(/\s+/g, '').toUpperCase() === s);
  }
  
  // 2. Filter by selectedDistrict
  if (filters?.selectedDistrict) {
    const d = normalizeDistrict(filters.selectedDistrict).toUpperCase();
    dealers = dealers.filter(dl => normalizeDistrict(dl.district).toUpperCase() === d);
  }
  
  // 3. Filter by search query
  if (filters?.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    dealers = dealers.filter(dl =>
      dl.client?.toLowerCase().includes(q) ||
      dl.district?.toLowerCase().includes(q) ||
      dl.state?.toLowerCase().includes(q)
    );
  }
  
  // 4. Map and compute
  let mapped = dealers.map(hd => {
    const key = hd.state + '_' + hd.district + '_' + hd.client;
    const prevDl = prevHistorySlice?.dealers?.find(pd => (pd.state + '_' + pd.district + '_' + pd.client).toLowerCase() === key.toLowerCase());
    const mainDl = rawData.dealers?.find(pd => (pd.state + '_' + pd.district + '_' + pd.client).toLowerCase() === key.toLowerCase());
    
    let cur = hd.cur ?? hd.qty ?? 0;
    let prev = prevDl ? (prevDl.cur ?? prevDl.qty ?? 0) : 0;
    
    if (filters?.selectedProduct) {
      const p = filters.selectedProduct;
      cur = hd.products?.find(pr => pr.product === p)?.cur ?? hd.products?.find(pr => pr.product === p)?.qty ?? 0;
      prev = prevDl?.products?.find(pr => pr.product === p)?.cur ?? prevDl?.products?.find(pr => pr.product === p)?.qty ?? 0;
    }
    
    const mom = calculateMoM(cur, prev);
    const drop = prev - cur;
    
    // Ensure products array has cur and prev properties for Product Contribution component
    const products = (hd.products || []).map(p => ({
      ...p,
      cur: p.cur ?? p.qty ?? 0,
      prev: prevDl?.products?.find(pr => pr.product === p.product)?.cur ?? prevDl?.products?.find(pr => pr.product === p.product)?.qty ?? 0
    }));

    // Carry over pendingQty and pace fields from main data (these don't exist in monthlyHistory)
    const pendingQty = mainDl?.pendingQty ?? 0;
    const pendingHistory = mainDl?.pendingHistory ?? {};

    return {
      ...hd,
      products,
      avgPeriod: mainDl?.avgPeriod ?? hd.avgPeriod ?? null,
      cur,
      prev,
      mom,
      drop,
      pendingQty,
      pendingHistory,
      dailyAvgQty: mainDl?.dailyAvgQty ?? 0,
      currentDailyRate: mainDl?.currentDailyRate ?? 0,
      expectedMtd: mainDl?.expectedMtd ?? 0,
      lossFlag: mainDl?.lossFlag ?? 'NO_DATA',
      lossDeltaPct: mainDl?.lossDeltaPct ?? 0,
    };
  });
  
  if (filters?.selectedProduct) {
    mapped = mapped.filter(d => d.cur > 0 || d.prev > 0);
  }

  // Compute share % based on the sum of all dealers' cur volumes in the filtered dataset
  const totalCur = mapped.reduce((sum, d) => sum + d.cur, 0);
  mapped = mapped.map(dl => {
    const share = totalCur > 0 ? Math.round((dl.cur / totalCur) * 100) : 0;
    const { severity, impactScore } = getBusinessImpact(dl.cur, dl.prev, share, 'DEALER', dl.client, dl.expectedMtd);
    const isInactive = dl.cur === 0;
    let operationalStatus = 'Growing';
    if (isInactive) {
      operationalStatus = 'Inactive';
    } else if (dl.mom > 0 || dl.cur > dl.prev) {
      operationalStatus = 'Growing';
    } else if (dl.mom === 0 && dl.cur === dl.prev) {
      operationalStatus = 'Stable';
    } else {
      operationalStatus = 'Declining';
    }
    return {
      ...dl,
      share,
      impactScore,
      severity,
      impactTier: severity,
      healthStatus: severity,
      operationalStatus,
      isInactive
    };
  });
  
  return mapped;
}
