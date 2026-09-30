import { supabase } from './supabaseClient';

// How current each source is (get_data_freshness, migration 037), for the
// master header. The snapshot is rebuilt after every ingest; five minutes of
// cache keeps page changes from asking again.

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached = null;
let inFlight = null;

/** { despatch_orders: { latest, loadedAt }, do_pending: {...}, field_visits: {...} } */
export function fetchDataFreshness() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Promise.resolve(cached.value);
  if (inFlight) return inFlight;
  inFlight = supabase.rpc('get_data_freshness')
    .then(({ data, error }) => {
      if (error) throw new Error(`get_data_freshness: ${error.message}`);
      const value = Object.fromEntries((data || []).map(r => [r.source, { latest: r.latest_data_date, loadedAt: r.loaded_at }]));
      cached = { value, at: Date.now() };
      return value;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}
