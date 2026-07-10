const DATA_URL = 'https://hubydueitefxxxrbpnjk.supabase.co/storage/v1/object/public/dashboard-data/latest.json';

export let data = null;
export let loadError = null;

export async function loadData() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching latest.json`);
  data = await res.json();
  return data;
}

export function getData() {
  if (!data) throw new Error('Data not loaded. Call loadData() first.');
  return data;
}
