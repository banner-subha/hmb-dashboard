import { isRealState, normalizeStateName } from '../utils/constants.js';
import { normalizeDistrict } from '../utils/districtNormalizer.js';

let DATA_URL = 'https://hubydueitefxxxrbpnjk.supabase.co/storage/v1/object/public/dashboard-data/latest.json';

function normalizeAndMergeStates(statesList) {
  if (!statesList || !Array.isArray(statesList)) return statesList;
  const map = {};
  statesList.forEach(s => {
    if (!s) return;
    const rawName = s.state || s.geoKey || (s.geoSlug ? normalizeStateName(s.geoSlug) : null);
    if (!rawName) return;
    const normState = normalizeStateName(rawName);
    if (!map[normState]) {
      map[normState] = {
        ...s,
        state: normState,
        cur: 0,
        prev: 0,
        expectedMtd: 0,
        dailyAvgQty: 0,
        pendingAge: s.pendingAge ? { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, unknown: 0 } : undefined,
      };
    }
    map[normState].cur = Math.round((map[normState].cur + (s.cur || 0)) * 100) / 100;
    map[normState].prev = Math.round((map[normState].prev + (s.prev || 0)) * 100) / 100;
    if (s.pendingAge && map[normState].pendingAge) {
      Object.keys(s.pendingAge).forEach(k => { map[normState].pendingAge[k] = Math.round(((map[normState].pendingAge[k] || 0) + (s.pendingAge[k] || 0)) * 100) / 100; });
    }
    if (s.oldestPendingDate && (!map[normState].oldestPendingDate || s.oldestPendingDate < map[normState].oldestPendingDate)) {
      map[normState].oldestPendingDate = s.oldestPendingDate;
    }
    if (s.expectedMtd) map[normState].expectedMtd = Math.round((map[normState].expectedMtd + (s.expectedMtd || 0)) * 100) / 100;
    if (s.dailyAvgQty) map[normState].dailyAvgQty = Math.round((map[normState].dailyAvgQty + (s.dailyAvgQty || 0)) * 100) / 100;
    if (s.avgPeriod != null && map[normState].avgPeriod == null) map[normState].avgPeriod = s.avgPeriod;
  });
  return Object.values(map);
}

function normalizeAndMergeDistricts(districtsList) {
  if (!districtsList || !Array.isArray(districtsList)) return districtsList;
  const map = {};

  districtsList.forEach(d => {
    if (!d || d.district == null || String(d.district).trim() === '' || !d.state) return;

    const normState = normalizeStateName(d.state);
    const normDistrict = normalizeDistrict(d.district, normState);
    if (!normDistrict) return;

    // Skip data entry errors where state name was entered into district column (e.g. UTTARPRADESH, ASSAM)
    // Never skip valid placeholders '0' and 'VERBAL'
    if (normDistrict !== '0' && normDistrict !== 'VERBAL' && isRealState(normDistrict)) return;

    const key = `${normState}||${normDistrict}`;

    if (!map[key]) {
      map[key] = {
        ...d,
        state: normState,
        district: normDistrict,
        cur: 0,
        prev: 0,
        expectedMtd: 0,
        dailyAvgQty: 0,
        currentDailyRate: 0,
        pendingQty: 0,
        pendingAge: d.pendingAge ? { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, unknown: 0 } : undefined,
        products: [],
      };
    }

    const existing = map[key];
    existing.cur = Math.round((existing.cur + (d.cur || 0)) * 100) / 100;
    existing.prev = Math.round((existing.prev + (d.prev || 0)) * 100) / 100;
    if (d.pendingAge && existing.pendingAge) {
      Object.keys(d.pendingAge).forEach(k => { existing.pendingAge[k] = Math.round(((existing.pendingAge[k] || 0) + (d.pendingAge[k] || 0)) * 100) / 100; });
    }
    if (d.oldestPendingDate && (!existing.oldestPendingDate || d.oldestPendingDate < existing.oldestPendingDate)) {
      existing.oldestPendingDate = d.oldestPendingDate;
    }
    if (d.expectedMtd) existing.expectedMtd = Math.round((existing.expectedMtd + (d.expectedMtd || 0)) * 100) / 100;
    if (d.dailyAvgQty) existing.dailyAvgQty = Math.round((existing.dailyAvgQty + (d.dailyAvgQty || 0)) * 100) / 100;
    if (d.currentDailyRate) existing.currentDailyRate = Math.round((existing.currentDailyRate + (d.currentDailyRate || 0)) * 100) / 100;
    if (d.pendingQty) existing.pendingQty = Math.round((existing.pendingQty + (d.pendingQty || 0)) * 100) / 100;

    // Preserve non-null avgPeriod
    if (d.avgPeriod != null && !isNaN(d.avgPeriod) && d.avgPeriod > 0) {
      if (existing.avgPeriod == null || existing.avgPeriod === 0) {
        existing.avgPeriod = d.avgPeriod;
      } else {
        const w1 = existing.cur || 1;
        const w2 = d.cur || 1;
        existing.avgPeriod = Math.round(((existing.avgPeriod * w1 + d.avgPeriod * w2) / (w1 + w2)) * 10) / 10;
      }
    }

    // Preserve valid pace flag if available
    if (d.lossFlag === 'AHEAD' || d.lossFlag === 'BEHIND') {
      existing.lossFlag = d.lossFlag;
      if (d.lossDeltaPct != null) existing.lossDeltaPct = d.lossDeltaPct;
      if (d.lossDelta != null) existing.lossDelta = d.lossDelta;
    }

    // Merge products
    if (Array.isArray(d.products)) {
      d.products.forEach(p => {
        if (!p || !p.product) return;
        const existingP = existing.products.find(item => item.product === p.product);
        if (!existingP) {
          existing.products.push({ ...p });
        } else {
          existingP.cur = Math.round(((existingP.cur || 0) + (p.cur || 0)) * 100) / 100;
          existingP.prev = Math.round(((existingP.prev || 0) + (p.prev || 0)) * 100) / 100;
        }
      });
    }
  });

  return Object.values(map).map(d => {
    const cur = d.cur || 0;
    const prev = d.prev || 0;
    const mom = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? 100 : 0);
    const drop = Math.max(0, prev - cur);

    // Derive pace fields if currentDailyRate & dailyAvgQty exist or can be calculated
    let lossFlag = d.lossFlag;
    let lossDeltaPct = d.lossDeltaPct;
    let lossDelta = d.lossDelta;

    if (d.currentDailyRate > 0 && d.dailyAvgQty > 0) {
      const diff = d.currentDailyRate - d.dailyAvgQty;
      lossDelta = Math.round(diff * 100) / 100;
      lossDeltaPct = Math.round((Math.abs(diff) / d.dailyAvgQty) * 1000) / 10;
      lossFlag = diff >= 0 ? 'AHEAD' : 'BEHIND';
    } else if (d.ytd > 0 || prev > 0) {
      // Fallback: estimate dailyAvgQty from YTD historical closed months (ytd / ytdTotalDays)
      const ytdDays = (d.ytdTotalDays || 212);
      const ytdQty = d.ytd || prev;
      const estDailyAvg = Math.round((ytdQty / ytdDays) * 100) / 100;
      if (estDailyAvg > 0) {
        const curRate = d.currentDailyRate || 0;
        const diff = curRate - estDailyAvg;
        lossDelta = Math.round(diff * 100) / 100;
        lossDeltaPct = Math.round((Math.abs(diff) / estDailyAvg) * 1000) / 10;
        lossFlag = diff >= 0 ? 'AHEAD' : 'BEHIND';
        if (!d.dailyAvgQty) d.dailyAvgQty = estDailyAvg;
      }
    }

    return {
      ...d,
      cur,
      prev,
      mom,
      drop,
      lossFlag: lossFlag || (cur < prev ? 'BEHIND' : 'AHEAD'),
      lossDeltaPct: lossDeltaPct != null ? lossDeltaPct : Math.abs(mom),
      lossDelta: lossDelta || (cur - prev),
    };
  });
}

export function cleanData(data) {
  if (!data) return data;
  const isKnown = (name) => name != null && String(name).trim() !== '' && String(name).toLowerCase() !== 'unknown' && String(name).toLowerCase() !== 'nan';

  // Normalize state and district/dealer names across entities
  if (data.districts) {
    data.districts.forEach(d => {
      if (d && d.state) d.state = normalizeStateName(d.state);
      if (d && d.district != null) d.district = normalizeDistrict(d.district, d.state);
    });
  }
  if (data.dealers) {
    data.dealers.forEach(dl => {
      if (dl && dl.state) dl.state = normalizeStateName(dl.state);
      if (dl && dl.district != null) dl.district = normalizeDistrict(dl.district, dl.state);
      if (dl && dl.client != null) dl.client = String(dl.client).trim() === '0.0' ? '0' : String(dl.client).trim();
    });
  }

  if (data.states) {
    data.states.forEach(s => {
      if (s) {
        const rawState = s.state || s.geoKey || (s.geoSlug ? normalizeStateName(s.geoSlug) : null);
        if (rawState) s.state = normalizeStateName(rawState);
      }
    });
    data.states = normalizeAndMergeStates(data.states).filter(s => isKnown(s.state) && isRealState(s.state));
  }
  if (data.districts) {
    data.districts = normalizeAndMergeDistricts(data.districts).filter(d => isKnown(d.state) && isRealState(d.state) && isKnown(d.district));
  }
  if (data.dealers) {
    data.dealers = data.dealers.filter(dl => isKnown(dl.state) && isRealState(dl.state) && isKnown(dl.district) && isKnown(dl.client));
  }
  if (data.monthlyHistory) {
    Object.keys(data.monthlyHistory).forEach(key => {
      const hist = data.monthlyHistory[key];
      if (hist.states) {
        hist.states.forEach(s => { if (s && s.state) s.state = normalizeStateName(s.state); });
        hist.states = normalizeAndMergeStates(hist.states).filter(s => isKnown(s.state) && isRealState(s.state));
      }
      if (hist.districts) {
        hist.districts.forEach(d => {
          if (d && d.state) d.state = normalizeStateName(d.state);
          if (d && d.district != null) d.district = normalizeDistrict(d.district, d.state);
        });
        hist.districts = normalizeAndMergeDistricts(hist.districts).filter(d => isKnown(d.state) && isRealState(d.state) && isKnown(d.district));      }
      if (hist.dealers) {
        hist.dealers.forEach(dl => {
          if (dl && dl.state) dl.state = normalizeStateName(dl.state);
          if (dl && dl.district != null) dl.district = normalizeDistrict(dl.district, dl.state);
          if (dl && dl.client != null) dl.client = String(dl.client).trim() === '0.0' ? '0' : String(dl.client).trim();
        });
        hist.dealers = hist.dealers.filter(dl => isKnown(dl.state) && isRealState(dl.state) && isKnown(dl.district) && isKnown(dl.client));
      }
    });
  }
  if (data.intel) {
    if (data.intel.scoredStates) {
      data.intel.scoredStates.forEach(s => { if (s && s.state) s.state = normalizeStateName(s.state); });
      data.intel.scoredStates = data.intel.scoredStates.filter(s => isKnown(s.state) && isRealState(s.state));
    }
    if (data.intel.scoredDistricts) {
      data.intel.scoredDistricts.forEach(d => {
        if (d && d.state) d.state = normalizeStateName(d.state);
        if (d && d.district != null) d.district = normalizeDistrict(d.district, d.state);
      });
      data.intel.scoredDistricts = data.intel.scoredDistricts.filter(d => isKnown(d.state) && isRealState(d.state) && isKnown(d.district));
    }
    if (data.intel.scoredDealers) {
      data.intel.scoredDealers.forEach(dl => {
        if (dl && dl.state) dl.state = normalizeStateName(dl.state);
        if (dl && dl.district != null) dl.district = normalizeDistrict(dl.district, dl.state);
      });
      data.intel.scoredDealers = data.intel.scoredDealers.filter(dl => isKnown(dl.state) && isRealState(dl.state) && isKnown(dl.district) && isKnown(dl.client));
    }
    if (data.intel.inactiveDealers) {
      data.intel.inactiveDealers.forEach(dl => {
        if (dl && dl.state) dl.state = normalizeStateName(dl.state);
        if (dl && dl.district != null) dl.district = normalizeDistrict(dl.district, dl.state);
      });
      data.intel.inactiveDealers = data.intel.inactiveDealers.filter(dl => isKnown(dl.state) && isRealState(dl.state) && isKnown(dl.district) && isKnown(dl.client));
    }
  }

  // ── Recalculate totals dynamically from valid states to exclude error districts ──
  if (data.states && data.states.length > 0) {
    const validTotalCur = Math.round(data.states.reduce((sum, s) => sum + (s.cur || 0), 0) * 100) / 100;
    const validTotalPrev = Math.round(data.states.reduce((sum, s) => sum + (s.prev || 0), 0) * 100) / 100;
    data.totalCur = validTotalCur;
    data.totalPrev = validTotalPrev;
    if (validTotalPrev > 0) {
      data.totalMoM = Math.round(((validTotalCur - validTotalPrev) / validTotalPrev) * 1000) / 10;
    }

    // National order-to-despatch avg: volume-weighted mean of state lead times
    // (backend calcAvgPeriod is preferred; this fills when top-level is null)
    if (data.avgPeriod == null) {
      const statesWithAvg = data.states.filter(
        s => s.avgPeriod != null && !isNaN(s.avgPeriod) && (s.cur || 0) > 0
      );
      if (statesWithAvg.length > 0) {
        const totalVol = statesWithAvg.reduce((acc, s) => acc + (s.cur || 0), 0);
        if (totalVol > 0) {
          const weighted = statesWithAvg.reduce((acc, s) => acc + s.avgPeriod * (s.cur || 0), 0);
          data.avgPeriod = Math.round((weighted / totalVol) * 10) / 10;
        }
      }
    }
  }

  // ── Recalculate products from valid dealers to exclude error districts ──
  if (data.dealers && data.dealers.length > 0 && data.products) {
    const prodMap = {};
    data.dealers.forEach(dl => {
      (dl.products || []).forEach(p => {
        if (!p.product) return;
        if (!prodMap[p.product]) {
          prodMap[p.product] = { cur: 0, prev: 0, pending: 0 };
        }
        prodMap[p.product].cur += (p.cur || 0);
        prodMap[p.product].prev += (p.prev || 0);
        prodMap[p.product].pending += (p.pendingQty || p.pending || 0);
      });
    });

    const totCur = data.totalCur || 1;
    data.products = data.products.map(p => {
      const pData = prodMap[p.product];
      const cur_mt = pData ? Math.round(pData.cur * 100) / 100 : (p.cur || 0);
      const prev_mt = pData ? Math.round(pData.prev * 100) / 100 : (p.prev || 0);
      const pending_qty = (p.pendingQty && p.pendingQty > 0)
        ? p.pendingQty
        : (pData && pData.pending > 0 ? Math.round(pData.pending * 100) / 100 : (p.pending_qty || 0));
      const mom = prev_mt > 0 ? Math.round(((cur_mt - prev_mt) / prev_mt) * 100) : 0;
      const share = totCur > 0 ? Math.round((cur_mt / totCur) * 100) : 0;
      return {
        ...p,
        cur: cur_mt,
        cur_mt: cur_mt,
        prev: prev_mt,
        prev_mt: prev_mt,
        pendingQty: pending_qty,
        pending_qty: pending_qty,
        mom: mom,
        share: share,
        volumeLabel: `${cur_mt} MT`
      };
    });
  }

  // ── Ensure every entity has pending and pace fields ──
  const defaultFields = {
    pendingQty: 0,
    pendingHistory: {},
    dailyAvgQty: 0,
    currentDailyRate: 0,
    expectedMtd: 0,
    lossDelta: 0,
    lossDeltaPct: 0,
    lossFlag: 'NO_DATA',
  };
  [data.states, data.districts, data.dealers].forEach(arr => {
    if (!arr) return;
    arr.forEach(entity => {
      Object.entries(defaultFields).forEach(([key, val]) => {
        if (entity[key] === undefined || entity[key] === null) {
          entity[key] = typeof val === 'object' ? { ...val } : val;
        }
      });
      // avgPeriod = order-to-despatch lead time (days), computed in n8n from
      // DESPATCH_DATE - ORDER_DATE. Never invent it from cur/dailyAvgQty.
    });
  });

  // ── Fallback avgPeriod and pace fields for districts ──
  if (data.states && data.districts) {
    const stateAvgMap = new Map(data.states.map(s => [s.state, s.avgPeriod]));

    data.districts.forEach(d => {
      // 1. Lead time fallback from state if missing
      if ((d.avgPeriod == null || d.avgPeriod === 0) && stateAvgMap.has(d.state)) {
        const sAvg = stateAvgMap.get(d.state);
        if (sAvg != null && sAvg > 0) {
          d.avgPeriod = sAvg;
        }
      }

      // 2. Derive prev from dealers if prev is 0
      if ((!d.prev || d.prev === 0) && data.dealers) {
        const dUpper = (d.district || '').toUpperCase();
        const sUpper = (d.state || '').toUpperCase();
        const dealerPrevSum = data.dealers
          .filter(dl => (dl.state || '').toUpperCase() === sUpper && (dl.district || '').toUpperCase() === dUpper)
          .reduce((sum, dl) => sum + (dl.prev || 0), 0);
        if (dealerPrevSum > 0) {
          d.prev = Math.round(dealerPrevSum * 100) / 100;
        }

        // Derive pendingQty from dealers if pendingQty is 0
        if (!d.pendingQty || d.pendingQty === 0) {
          const dealerPendingSum = data.dealers
            .filter(dl => (dl.state || '').toUpperCase() === sUpper && (dl.district || '').toUpperCase() === dUpper)
            .reduce((sum, dl) => sum + (dl.pendingQty || 0), 0);
          if (dealerPendingSum > 0) {
            d.pendingQty = Math.round(dealerPendingSum * 100) / 100;
          }
        }
      }

      // 3. Derive dailyAvgQty if 0
      // Calculate from YTD historical closed months (ytd / ytdTotalDays)
      if (!d.dailyAvgQty || d.dailyAvgQty === 0) {
        const ytdDays = (data.meta?.ytdTotalDays) || 212;
        if (d.ytd > 0) {
          d.dailyAvgQty = Math.round((d.ytd / ytdDays) * 100) / 100;
        } else if (d.prev > 0) {
          const elapsedDays = (data.meta?.curElapsedDays) || 30;
          d.dailyAvgQty = Math.round((d.prev / elapsedDays) * 100) / 100;
        }
      }

      // 4. Set lossFlag and lossDelta/lossDeltaPct for pace display
      if (d.dailyAvgQty > 0) {
        const curRate = d.currentDailyRate || 0;
        const diff = curRate - d.dailyAvgQty;
        d.lossDelta = Math.round(diff * 100) / 100;
        d.lossDeltaPct = curRate === 0 ? -100 : Math.round((diff / d.dailyAvgQty) * 1000) / 10;
        d.lossFlag = diff >= 0 ? 'AHEAD' : 'BEHIND';
      }
    });
  }

  // ── Normalize availableMonths and pendingAvailableMonths ──
  if (data.availableMonths && Array.isArray(data.availableMonths)) {
    data.availableMonths = data.availableMonths.map(m => {
      const k = m.key || m.periodKey || `${m.year}-${String(m.month).padStart(2, '0')}`;
      return { ...m, key: k, periodKey: k };
    });
  }

  const pendingMonthsMap = new Map();
  const shortMonthsList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const addPendingMonthKey = (pk, year, month, label) => {
    if (!pk || pendingMonthsMap.has(pk)) return;
    let y = year, m = month;
    if (!y || !m) {
      const parts = String(pk).split('-');
      if (parts.length === 2) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
      }
    }
    if (y && m && m >= 1 && m <= 12) {
      const displayLabel = label || `${shortMonthsList[m - 1]} ${y}`;
      pendingMonthsMap.set(pk, { key: pk, periodKey: pk, year: y, month: m, label: displayLabel });
    }
  };

  if (Array.isArray(data.availableMonths)) {
    data.availableMonths.forEach(m => addPendingMonthKey(m.periodKey || m.key, m.year, m.month, m.label));
  }
  if (Array.isArray(data.pendingAvailableMonths)) {
    data.pendingAvailableMonths.forEach(m => addPendingMonthKey(m.periodKey || m.key, m.year, m.month, m.label));
  }
  ['states', 'districts', 'dealers'].forEach(group => {
    (data[group] || []).forEach(e => {
      if (e.pendingHistory) {
        Object.keys(e.pendingHistory).forEach(pk => addPendingMonthKey(pk));
      }
    });
  });

  if (pendingMonthsMap.size > 0) {
    data.pendingAvailableMonths = Array.from(pendingMonthsMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }

  // ── Derive availableMonths from generatedAt if missing ──
  if (!data.availableMonths && data.meta?.generatedAt) {
    const genDate = new Date(data.meta.generatedAt);
    if (!isNaN(genDate.getTime())) {
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const year = genDate.getUTCFullYear();
      const month = genDate.getUTCMonth() + 1;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      data.availableMonths = [
        { periodKey: `${year}-${String(month).padStart(2, '0')}`, year, month, label: `${months[month - 1]} ${year}` },
        { periodKey: `${prevYear}-${String(prevMonth).padStart(2, '0')}`, year: prevYear, month: prevMonth, label: `${months[prevMonth - 1]} ${prevYear}` },
      ];
    }
  }

  if (data.alerts && Array.isArray(data.alerts)) {
    // Exclude OVERALL level alerts to focus strictly on STATE and DISTRICT
    data.alerts = data.alerts.filter(alert => {
      const level = (alert.level || alert.category || '').toUpperCase();
      return level !== 'OVERALL';
    });

    // Recalculate root counts directly from the backend-provided alert severities
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let realAlertsCount = 0;

    data.alerts.forEach(alert => {
      if (alert.severity === 'CRITICAL') {
        criticalCount++;
        realAlertsCount++;
      } else if (alert.severity === 'HIGH') {
        highCount++;
        realAlertsCount++;
      } else if (alert.severity === 'MEDIUM') {
        mediumCount++;
        realAlertsCount++;
      }
    });

    data.alertCount = realAlertsCount;
    data.criticalCount = criticalCount;
    data.highCount = highCount;
    data.mediumCount = mediumCount;
    data.hasAlert = realAlertsCount > 0;
  }

  return data;
}

class DataService {
  constructor() {
    this._cache = null;
    this._lastFetch = 0;
    this._cacheTTL = 60000; // 1 minute cache
  }

  /** Fetch the latest dashboard data */
  async fetchDashboardData() {
    const now = Date.now();
    if (this._cache && (now - this._lastFetch) < this._cacheTTL) {
      return this._cache;
    }

    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Received HTML instead of JSON. Fallback to sample data.");
      }

      const data = await res.json();
      const cleanedData = cleanData(data);

      if (!cleanedData.meta) cleanedData.meta = {};
      if (!cleanedData.meta.curPeriod && cleanedData.curPeriod) {
        cleanedData.meta.curPeriod = cleanedData.curPeriod;
      }
      if (!cleanedData.meta.prevPeriod && cleanedData.prevPeriod) {
        cleanedData.meta.prevPeriod = cleanedData.prevPeriod;
      }

      // Ensure curPeriod and prevPeriod reflect actual fetched data end date
      // Only rewrite if labels are missing or use the old stale format
      const elapsedDays = cleanedData.curElapsedDays || cleanedData.meta?.curElapsedDays;
      const needsRewrite = !cleanedData.meta.curPeriod || !cleanedData.meta.prevPeriod;
      if (needsRewrite && elapsedDays) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let endDay = elapsedDays;
        let monthName = monthNames[new Date().getMonth()];
        let yearNum = new Date().getFullYear();
        const asOfStr = cleanedData.dataAsOfDate || cleanedData.meta?.dataAsOfDate;
        if (asOfStr) {
          const parts = asOfStr.split('-');
          if (parts.length === 3) {
            yearNum = parseInt(parts[0], 10) || yearNum;
            const mIdx = (parseInt(parts[1], 10) || 1) - 1;
            monthName = monthNames[mIdx] || monthName;
            endDay = parseInt(parts[2], 10) || elapsedDays;
          }
        }
        cleanedData.meta.curPeriod = `1 ${monthName} ${yearNum} - ${endDay} ${monthName} ${yearNum}`;
        cleanedData.curPeriod = cleanedData.meta.curPeriod;

        // Proper previous month calculation (handles Jan → Dec of prior year)
        const curMonthIdx = monthNames.indexOf(monthName);
        const prevMonthIdx = curMonthIdx > 0 ? curMonthIdx - 1 : 11;
        const prevMonthName = monthNames[prevMonthIdx];
        const prevYearNum = curMonthIdx === 0 ? yearNum - 1 : yearNum;
        cleanedData.meta.prevPeriod = `1 ${prevMonthName} ${prevYearNum} - ${endDay} ${prevMonthName} ${prevYearNum}`;
        cleanedData.prevPeriod = cleanedData.meta.prevPeriod;
      }

      this._cache = cleanedData;
      this._lastFetch = now;
      return cleanedData;
    } catch (err) {
      console.error('DataService: fetch live data failed, trying local fallback...', err);
      if (this._cache) return this._cache;
      
      try {
        const localUrl = typeof window !== 'undefined' ? `${window.location.origin}/latest.json` : '/latest.json';
        const localRes = await fetch(localUrl);
        if (localRes.ok) {
          const contentType = localRes.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            throw new Error('Local fallback returned HTML (Netlify CLI redirect)', { cause: err });
          }
          const localData = await localRes.json();
          const cleanedLocal = cleanData(localData);
          this._cache = cleanedLocal;
          this._lastFetch = now;
          return cleanedLocal;
        }
      } catch (localErr) {
        console.error('DataService: local fallback fetch failed too', localErr);
      }

      // Fallback to sample data in dev
      const { sampleData } = await import('../data/sampleData.js');
      this._cache = cleanData(sampleData);
      return this._cache;
    }
  }

  /** Clear cache (useful after new data arrives) */
  clearCache() {
    this._cache = null;
    this._lastFetch = 0;
  }

  /**
   * FUTURE: These methods will be added when migrating to a database
   * 
   * async fetchHistoricalData(startDate, endDate) { ... }
   * async fetchDealerDetail(dealerId) { ... }
   * async submitAction(actionId, status) { ... }
   */
}

// Singleton instance
export const dataService = new DataService();

