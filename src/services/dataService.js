/**
 * Data Service — Abstraction Layer
 * 
 * All data access goes through this service.
 * Currently reads from static JSON files.
 * Future migration to Supabase/Firebase requires ONLY changing this file.
 */

const DATA_URL = 'https://hubydueitefxxxrbpnjk.supabase.co/storage/v1/object/public/dashboard-data/latest.json';

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
      this._cache = data;
      this._lastFetch = now;
      return data;
    } catch (err) {
      console.error('DataService: fetch failed, using cache or sample', err);
      if (this._cache) return this._cache;
      // Fallback to sample data in dev
      const { sampleData } = await import('../data/sampleData.js');
      this._cache = sampleData;
      return sampleData;
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
