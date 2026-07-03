/**
 * Data Service — Abstraction Layer
 * 
 * All data access goes through this service.
 * Currently reads from static JSON files.
 * Future migration to Supabase/Firebase requires ONLY changing this file.
 */

let DATA_URL = 'https://hubydueitefxxxrbpnjk.supabase.co/storage/v1/object/public/dashboard-data/latest.json';

function cleanData(data) {
  if (!data) return data;
  const isKnown = (name) => name && name.toLowerCase() !== 'unknown' && name.toLowerCase() !== 'nan';

  if (data.states) {
    data.states = data.states.filter(s => isKnown(s.state));
  }
  if (data.districts) {
    data.districts = data.districts.filter(d => isKnown(d.state) && isKnown(d.district));
  }
  if (data.dealers) {
    data.dealers = data.dealers.filter(dl => isKnown(dl.state) && isKnown(dl.district) && isKnown(dl.client));
  }
  if (data.monthlyHistory) {
    Object.keys(data.monthlyHistory).forEach(key => {
      const hist = data.monthlyHistory[key];
      if (hist.states) {
        hist.states = hist.states.filter(s => isKnown(s.state));
      }
      if (hist.districts) {
        hist.districts = hist.districts.filter(d => isKnown(d.state) && isKnown(d.district));
      }
      if (hist.dealers) {
        hist.dealers = hist.dealers.filter(dl => isKnown(dl.state) && isKnown(dl.district) && isKnown(dl.client));
      }
    });
  }
  if (data.intel) {
    if (data.intel.scoredStates) {
      data.intel.scoredStates = data.intel.scoredStates.filter(s => isKnown(s.state));
    }
    if (data.intel.scoredDistricts) {
      data.intel.scoredDistricts = data.intel.scoredDistricts.filter(d => isKnown(d.state) && isKnown(d.district));
    }
    if (data.intel.scoredDealers) {
      data.intel.scoredDealers = data.intel.scoredDealers.filter(dl => isKnown(dl.state) && isKnown(dl.district) && isKnown(dl.client));
    }
    if (data.intel.inactiveDealers) {
      data.intel.inactiveDealers = data.intel.inactiveDealers.filter(dl => isKnown(dl.state) && isKnown(dl.district) && isKnown(dl.client));
    }
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
    });
  });

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

      // Fallback: Derive curPeriod from generatedAt if curPeriod is missing
      if (cleanedData.meta && !cleanedData.meta.curPeriod) {
        const genAt = cleanedData.meta.generatedAt || cleanedData.generatedAt;
        if (genAt) {
          const genDate = new Date(genAt);
          if (!isNaN(genDate.getTime())) {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const curMonth = monthNames[genDate.getUTCMonth()];
            const curYear = genDate.getUTCFullYear();
            const curDay = genDate.getUTCDate();
            cleanedData.meta.curPeriod = `1 ${curMonth} ${curYear} - ${curDay} ${curMonth} ${curYear}`;
          }
        }
      }

      this._cache = cleanedData;
      this._lastFetch = now;
      return cleanedData;
    } catch (err) {
      console.error('DataService: fetch live data failed, trying local fallback...', err);
      if (this._cache) return this._cache;
      
      try {
        const localRes = await fetch('/latest.json');
        if (localRes.ok) {
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

