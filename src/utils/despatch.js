import { calculateMoM } from './trendEngine';
import { isRealState } from './constants';

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
    };
  });
  
  // If product filter is active, filter out states with 0 cur and 0 prev
  if (filters?.selectedProduct) {
    mapped = mapped.filter(st => st.cur > 0 || st.prev > 0);
  }
  
  // Compute share % based on the sum of all states' cur volumes in the filtered dataset
  const totalCur = mapped.reduce((sum, s) => sum + s.cur, 0);
  mapped = mapped.map(st => ({
    ...st,
    share: totalCur > 0 ? Math.round((st.cur / totalCur) * 100) : 0
  }));
  
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
    const d = filters.selectedDistrict;
    districts = districts.filter(dist => dist.district === d);
  }
  
  // 3. Map and compute
  let mapped = districts.map(hd => {
    const key = hd.state + '_' + hd.district;
    const prevDist = prevHistorySlice?.districts?.find(pd => (pd.state + '_' + pd.district).toLowerCase() === key.toLowerCase());
    const mainDist = rawData.districts?.find(pd => (pd.state + '_' + pd.district).toLowerCase() === key.toLowerCase());
    
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
      avgPeriod: mainDist?.avgPeriod ?? hd.avgPeriod ?? null,
      cur,
      prev,
      mom,
      drop
    };
  });
  
  if (filters?.selectedProduct) {
    mapped = mapped.filter(d => d.cur > 0 || d.prev > 0);
  }
  
  const totalCur = mapped.reduce((sum, d) => sum + d.cur, 0);
  mapped = mapped.map(d => ({
    ...d,
    share: totalCur > 0 ? Math.round((d.cur / totalCur) * 100) : 0
  }));
  
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
    const d = filters.selectedDistrict;
    dealers = dealers.filter(dl => dl.district === d);
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
    
    return {
      ...hd,
      avgPeriod: mainDl?.avgPeriod ?? hd.avgPeriod ?? null,
      cur,
      prev,
      mom,
      drop
    };
  });
  
  if (filters?.selectedProduct) {
    mapped = mapped.filter(d => d.cur > 0 || d.prev > 0);
  }
  
  return mapped;
}
