// Formatting utilities used across the dashboard
// NOTE: All trend calculations, severity classification, and color mapping
// are derived from trendEngine.js. These are pure display formatters only.

/** Format a number as MT (metric tons) */
export const formatMT = (n, decimals = 2) => {
  if (n == null || isNaN(n)) return '—';
  const val = parseFloat(n);
  const formatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return `${formatter.format(val)} MT`;
};

/** Format number with commas */
export const formatNumber = (n) => {
  if (n == null || isNaN(n)) return '—';
  return parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO day to a short label: "2026-09-23" -> "23 Sep 2026". Unparseable input returns ''. */
export const formatDayLabel = (isoDay) => {
  const [y, mo, d] = String(isoDay || '').split('-').map(Number);
  const mon = MONTH_ABBR[mo - 1];
  if (!y || !mon || !d) return '';
  return `${d} ${mon} ${y}`;
};

/** Format number of days in a business-grade format */
export const formatDays = (days) => {
  if (days == null || isNaN(days)) return '—';
  const val = parseFloat(days);
  const formattedVal = val % 1 === 0 ? val.toFixed(0) : val.toFixed(1);
  return `${formattedVal} ${val === 1 ? 'day' : 'days'}`;
};
