// Formatting utilities used across the dashboard
// NOTE: All trend calculations, severity classification, and color mapping
// are derived from trendEngine.js. These are pure display formatters only.

/** Format a number as MT (metric tons) */
export const formatMT = (n) => {
  if (n == null || isNaN(n)) return '—';
  const val = parseFloat(n);
  const formatter = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 20
  });
  return `${formatter.format(val)} MT`;
};

/** Format number with commas */
export const formatNumber = (n) => {
  if (n == null || isNaN(n)) return '—';
  return parseFloat(n).toLocaleString('en-IN', { maximumFractionDigits: 1 });
};

/** Format MoM percentage (achievement ratio — no +/- prefix) */
export const formatMoM = (pct) => {
  if (pct == null || isNaN(pct)) return '—';
  return `${parseFloat(pct).toFixed(1)}%`;
};

/** Format percentage */
export const formatPct = (pct) => {
  if (pct == null || isNaN(pct)) return '—';
  return `${parseFloat(pct).toFixed(1)}%`;
};

/** Slugify a string for URLs */
export const slugify = (str) =>
  (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Format ISO date to readable */
export const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
