// Formatting utilities used across the dashboard

/** Format a number as MT (metric tons) */
export const formatMT = (n) => {
  if (n == null || isNaN(n)) return '—';
  const val = parseFloat(n);
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(1)}K MT`;
  return `${val.toFixed(1)} MT`;
};

/** Format number with commas */
export const formatNumber = (n) => {
  if (n == null || isNaN(n)) return '—';
  return parseFloat(n).toLocaleString('en-IN', { maximumFractionDigits: 1 });
};

/** Format MoM percentage */
export const formatMoM = (pct) => {
  if (pct == null || isNaN(pct)) return '—';
  const val = parseFloat(pct);
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
};

/** Format percentage */
export const formatPct = (pct) => {
  if (pct == null || isNaN(pct)) return '—';
  return `${parseFloat(pct).toFixed(1)}%`;
};

/** Get MoM direction info */
export const getMoMInfo = (pct) => {
  if (pct == null || isNaN(pct)) return { direction: 'neutral', color: '#6b7280', arrow: '' };
  const val = parseFloat(pct);
  if (val > 0) return { direction: 'up', color: '#22c55e', arrow: '▲' };
  if (val < 0) return { direction: 'down', color: '#ef4444', arrow: '▼' };
  return { direction: 'neutral', color: '#6b7280', arrow: '–' };
};

/** Get risk color based on score */
export const getRiskColor = (score) => {
  const s = parseFloat(score) || 0;
  if (s >= 70) return '#ef4444';
  if (s >= 40) return '#f97316';
  return '#22c55e';
};

/** Get risk label */
export const getRiskLabel = (score) => {
  const s = parseFloat(score) || 0;
  if (s >= 70) return 'HIGH';
  if (s >= 40) return 'MEDIUM';
  return 'LOW';
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
