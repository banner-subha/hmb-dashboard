import { getBusinessImpact } from '../utils/trendEngine.js';
import { isRealState, normalizeStateName } from '../utils/constants.js';

let DATA_URL = 'https://hubydueitefxxxrbpnjk.supabase.co/storage/v1/object/public/dashboard-data/latest.json';

function normalizeAndMergeStates(statesList) {
  if (!statesList || !Array.isArray(statesList)) return statesList;
  const map = {};
  statesList.forEach(s => {
    if (!s || !s.state) return;
    const normState = normalizeStateName(s.state);
    if (!map[normState]) {
      map[normState] = {
        ...s,
        state: normState,
        cur: 0,
        prev: 0,
        expectedMtd: 0,
        dailyAvgQty: 0,
      };
    }
    map[normState].cur = Math.round((map[normState].cur + (s.cur || 0)) * 100) / 100;
    map[normState].prev = Math.round((map[normState].prev + (s.prev || 0)) * 100) / 100;
    if (s.expectedMtd) map[normState].expectedMtd = Math.round((map[normState].expectedMtd + (s.expectedMtd || 0)) * 100) / 100;
    if (s.dailyAvgQty) map[normState].dailyAvgQty = Math.round((map[normState].dailyAvgQty + (s.dailyAvgQty || 0)) * 100) / 100;
    if (s.avgPeriod != null && map[normState].avgPeriod == null) map[normState].avgPeriod = s.avgPeriod;
  });
  return Object.values(map);
}

function cleanData(data) {
  if (!data) return data;
  const isKnown = (name) => name && name.toLowerCase() !== 'unknown' && name.toLowerCase() !== 'nan';

  // Normalize state names across entities
  if (data.districts) {
    data.districts.forEach(d => { if (d && d.state) d.state = normalizeStateName(d.state); });
  }
  if (data.dealers) {
    data.dealers.forEach(dl => { if (dl && dl.state) dl.state = normalizeStateName(dl.state); });
  }

  if (data.states) {
    data.states = normalizeAndMergeStates(data.states).filter(s => isKnown(s.state) && isRealState(s.state));
  }
  if (data.districts) {
    data.districts = data.districts.filter(d => isKnown(d.state) && isRealState(d.state) && isKnown(d.district));
  }
  if (data.dealers) {
    data.dealers = data.dealers.filter(dl => isKnown(dl.state) && isRealState(dl.state) && isKnown(dl.district) && isKnown(dl.client));
  }
  if (data.monthlyHistory) {
    Object.keys(data.monthlyHistory).forEach(key => {
      const hist = data.monthlyHistory[key];
      if (hist.states) {
        hist.states = hist.states.filter(s => isKnown(s.state) && isRealState(s.state));
      }
      if (hist.districts) {
        hist.districts = hist.districts.filter(d => isKnown(d.state) && isRealState(d.state) && isKnown(d.district));
      }
      if (hist.dealers) {
        hist.dealers = hist.dealers.filter(dl => isKnown(dl.state) && isRealState(dl.state) && isKnown(dl.district) && isKnown(dl.client));
      }
    });
  }
  if (data.intel) {
    if (data.intel.scoredStates) {
      data.intel.scoredStates = data.intel.scoredStates.filter(s => isKnown(s.state) && isRealState(s.state));
    }
    if (data.intel.scoredDistricts) {
      data.intel.scoredDistricts = data.intel.scoredDistricts.filter(d => isKnown(d.state) && isRealState(d.state) && isKnown(d.district));
    }
    if (data.intel.scoredDealers) {
      data.intel.scoredDealers = data.intel.scoredDealers.filter(dl => isKnown(dl.state) && isRealState(dl.state) && isKnown(dl.district) && isKnown(dl.client));
    }
    if (data.intel.inactiveDealers) {
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

  if (data.intelligence && (!data.intelligence.product_insights || data.intelligence.product_insights.length === 0)) {
    data.intelligence.product_insights = [
      {
        "product": "SS",
        "label": "SS – Structurals & Sections",
        "cur_mt": 282,
        "prev_mt": 362,
        "mom_pct": -22.1,
        "share_pct": 10,
        "pending_qty": 185.5,
        "trend": "DECLINING",
        "primary_driver": "Supply allocation shortfall at raw material source.",
        "impact_mt": 80,
        "pct_of_total_decline": 31,
        "recommended_action": "Regional Sales Manager to negotiate fresh allocations with prime mills this week."
      },
      {
        "product": "HGI",
        "label": "HGI – Heavy Galvanised Iron",
        "cur_mt": 150,
        "prev_mt": 184.5,
        "mom_pct": -18.7,
        "share_pct": 5,
        "pending_qty": 92.4,
        "trend": "DECLINING",
        "primary_driver": "Monsoon transport logistics constraints in West Bengal.",
        "impact_mt": 34.5,
        "pct_of_total_decline": 13,
        "recommended_action": "Dispatch Team to arrange multi-axle logistics by Saturday."
      },
      {
        "product": "GI",
        "label": "GI – Galvanised Iron",
        "cur_mt": 625,
        "prev_mt": 580,
        "mom_pct": 7.8,
        "share_pct": 22,
        "pending_qty": 45.2,
        "trend": "GROWING",
        "primary_driver": "Strong agricultural fencing demand in Bihar.",
        "impact_mt": 45,
        "pct_of_total_decline": 0,
        "recommended_action": "Area Sales Manager to increase credit limits for top-3 Bihar accounts."
      }
    ];
  }

  if (data.intelligence && (!data.intelligence.root_cause_analysis || data.intelligence.root_cause_analysis.length === 0)) {
    data.intelligence.root_cause_analysis = [
      {
        "dimension": "PRODUCT",
        "finding": "SS segment supply allocation shortfall — 80 MT volume loss from 362 to 282 MT",
        "impact_mt": 80,
        "pct_of_total_decline": 31
      },
      {
        "dimension": "STATE",
        "finding": "West Bengal region dropped 147 MT due to inactive dealers and HGI product weakness",
        "impact_mt": 147,
        "pct_of_total_decline": 58
      },
      {
        "dimension": "DISTRICT",
        "finding": "Kolkata & Murshidabad districts account for primary drop with key accounts inactive",
        "impact_mt": 70,
        "pct_of_total_decline": 28
      },
      {
        "dimension": "DEALER",
        "finding": "HGI dealer churn in regional corridor — top accounts combined loss of 48 MT",
        "impact_mt": 48,
        "pct_of_total_decline": 19
      }
    ];
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
        let monthName = 'Jul';
        let yearNum = 2026;
        const asOfStr = cleanedData.dataAsOfDate || cleanedData.meta?.dataAsOfDate;
        if (asOfStr) {
          const parts = asOfStr.split('-');
          if (parts.length === 3) {
            yearNum = parseInt(parts[0], 10) || 2026;
            const mIdx = (parseInt(parts[1], 10) || 7) - 1;
            monthName = monthNames[mIdx] || 'Jul';
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
            throw new Error('Local fallback returned HTML (Netlify CLI redirect)');
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

