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
  let pct = 0;
  if (prev <= 0) {
    if (cur <= 0) pct = 0;
    else pct = 100;
  } else {
    pct = ((cur - prev) / prev) * 100;
  }
  pct = Math.max(-100, Math.min(100, pct));
  return Number(pct.toFixed(1));
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
export function getSeverityTheme(level) {
  const lvl = (level || 'LOW').toUpperCase();
  const themes = {
    CRITICAL: {
      severity: 'CRITICAL',
      color: '#ef4444',
      bg: 'rgba(239,68,68,0.12)',
      border: 'rgba(239,68,68,0.45)',
      shadow: '0 0 15px rgba(239,68,68,0.15)',
    },
    HIGH: {
      severity: 'HIGH',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.12)',
      border: 'rgba(249,115,22,0.45)',
      shadow: '0 0 15px rgba(249,115,22,0.15)',
    },
    MODERATE: { // Aliased to HIGH for backward compat with UI updates
      severity: 'MODERATE',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.12)',
      border: 'rgba(249,115,22,0.45)',
      shadow: '0 0 15px rgba(249,115,22,0.15)',
    },
    MEDIUM: {
      severity: 'MEDIUM',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.45)',
      shadow: '0 0 15px rgba(234,179,8,0.15)',
    },
    LOW: {
      severity: 'LOW',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      border: 'rgba(34,197,94,0.45)',
      shadow: '0 0 15px rgba(34,197,94,0.15)',
    }
  };
  return themes[lvl] || themes['LOW'];
}

export function getSeverityLevel(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

export function calculateImpactScore(cur, prev, inactivityDays = 0, volatility = 0) {
  let volumeWeight = 0;
  if (prev > 1000) volumeWeight = 25;
  else if (prev > 500) volumeWeight = 20;
  else if (prev > 100) volumeWeight = 10;
  else if (prev > 0) volumeWeight = 5;
  
  let mom = calculateMoM(cur, prev);
  let declineWeight = 0;
  if (mom <= -75) declineWeight = 40;
  else if (mom <= -50) declineWeight = 30;
  else if (mom <= -25) declineWeight = 20;
  else if (mom < 0) declineWeight = 10;
  
  let inactivityWeight = Math.min(20, (inactivityDays || 0) * 2);
  let volatilityWeight = Math.min(15, (volatility || 0) * 10);
  
  let score = volumeWeight + declineWeight + inactivityWeight + volatilityWeight;
  return Math.min(100, Math.max(0, score));
}

export function getSeverity(mom) {
  if (mom <= -25) return getSeverityTheme('CRITICAL');
  if (mom <= -10) return getSeverityTheme('MODERATE');
  return getSeverityTheme('LOW');
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
