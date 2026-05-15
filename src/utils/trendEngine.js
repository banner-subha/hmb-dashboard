// ═══════════════════════════════════════════════════════════════════════════════
// TREND ENGINE — Frontend Single Source of Truth
// ═══════════════════════════════════════════════════════════════════════════════
// The backend provides ONLY raw data (cur, prev).
// ALL trend calculations, severity derivation, color mapping, and formatting
// are computed HERE on the frontend.
// DO NOT trust: displayColor, healthColor, trendColor, trendLabel,
//               impactTier, healthStatus, trendDirection from backend.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate Month-over-Month percentage change from raw cur/prev values.
 * Always use this instead of trusting backend `mom` field.
 */
export function calculateMoM(cur = 0, prev = 0) {
  if (!prev && cur > 0) return 100;
  if (!prev) return 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

/**
 * Derive severity classification from MoM percentage.
 * Returns severity tag, color, and glassmorphism pill styles.
 *
 * Rules:
 *   mom <= -25  →  CRITICAL (red)
 *   mom <= -10  →  MODERATE (orange)
 *   else        →  LOW      (green)
 */
export function getSeverity(mom) {
  if (mom <= -25) {
    return {
      severity: 'CRITICAL',
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.45)',
    };
  }

  if (mom <= -10) {
    return {
      severity: 'MODERATE',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.12)',
      border: 'rgba(249,115,22,0.45)',
    };
  }

  return {
    severity: 'LOW',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.45)',
  };
}

/**
 * Get trend display color based ONLY on direction.
 *   positive → green
 *   negative → red
 *   zero/null → neutral grey
 */
export function getTrendColor(mom) {
  if (mom == null) return '#94a3b8';
  if (mom > 0) return '#22c55e';
  if (mom < 0) return '#ef4444';
  return '#94a3b8';
}

/**
 * Format a MoM percentage for display with arrow.
 *   positive  → "↑ 4.1%"
 *   negative  → "↓ 12.3%"
 *   zero/null → "0%"
 */
export function formatTrend(mom) {
  if (mom == null) return '—';
  if (mom > 0) return `↑ ${mom}%`;
  if (mom < 0) return `↓ ${Math.abs(mom)}%`;
  return '0%';
}

/**
 * All-in-one: compute MoM from cur/prev, then derive full severity + trend metadata.
 * Use this when you have raw cur/prev values and want everything computed fresh.
 */
export function computeEntityMeta(cur = 0, prev = 0) {
  const mom = calculateMoM(cur, prev);
  const severity = getSeverity(mom);
  const trendColor = getTrendColor(mom);
  const trendDisplay = formatTrend(mom);

  return {
    mom,
    ...severity,
    trendColor,
    trendDisplay,
  };
}
