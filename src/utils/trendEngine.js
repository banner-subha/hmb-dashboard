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
 *   mom <= -15  →  HIGH (orange)
 *   mom <= -5   →  MEDIUM (yellow)
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
      shadow: 'none',
    },
    HIGH: {
      severity: 'HIGH',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.12)',
      border: 'rgba(249,115,22,0.45)',
      shadow: 'none',
    },

    MEDIUM: {
      severity: 'MEDIUM',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.45)',
      shadow: 'none',
    },
    LOW: {
      severity: 'LOW',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      border: 'rgba(34,197,94,0.45)',
      shadow: 'none',
    }
  };
  return themes[lvl] || themes['LOW'];
}

export function getSeverityLevel(score) {
  if (score >= 65) return 'CRITICAL';
  if (score >= 45) return 'HIGH';
  if (score >= 20) return 'MEDIUM';
  return 'LOW';
}

export function calculateImpactScore(cur, prev, inactivityDays = 0, volatility = 0) {
  // Normalize each component to 0-100
  let volumeLossScore = 0;
  let drop = prev - cur;
  if (drop > 0) {
    if (drop > 1000) volumeLossScore = 100;
    else if (drop > 500) volumeLossScore = 80;
    else if (drop > 100) volumeLossScore = 50;
    else volumeLossScore = 20;
  }
  
  let mom = calculateMoM(cur, prev);
  let declineScore = 0;
  if (mom <= -75) declineScore = 100;
  else if (mom <= -50) declineScore = 80;
  else if (mom <= -25) declineScore = 50;
  else if (mom < 0) declineScore = 20;
  
  let inactivityScore = Math.min(100, (inactivityDays || 0) * 10);
  let volatilityScore = Math.min(100, (volatility || 0) * 20);
  
  let impactScore = (declineScore * 0.40) + (volumeLossScore * 0.30) + (inactivityScore * 0.20) + (volatilityScore * 0.10);
  return Math.min(100, Math.max(0, impactScore));
}

export function getSeverity(mom) {
  if (mom <= -25) return getSeverityTheme('CRITICAL');
  if (mom <= -15) return getSeverityTheme('HIGH');
  if (mom <= -5) return getSeverityTheme('MEDIUM');
  return getSeverityTheme('LOW');
}

/**
 * Get trend display color based ONLY on direction.
 *   positive → green
 *   negative → red
 *   zero/null → neutral grey
 */
export function getTrendColor(mom, cur = null, prev = null) {
  if (mom == null) return '#94a3b8';
  if (mom >= 0) return '#22c55e';
  
  if (cur != null && prev != null) {
    const score = calculateImpactScore(cur, prev);
    const sevLevel = getSeverityLevel(score);
    return getSeverityTheme(sevLevel).color;
  }
  
  return getSeverity(mom).color;
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
