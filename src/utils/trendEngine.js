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

export function getBusinessImpact(cur = 0, prev = 0, inactivityDays = 0, volatility = 0) {
  const mom = calculateMoM(cur, prev);
  
  let declineRisk = 0;
  if (mom <= -70) declineRisk = 100;
  else if (mom <= -55) declineRisk = 85;
  else if (mom <= -40) declineRisk = 65;
  else if (mom <= -25) declineRisk = 45;
  else if (mom <= -10) declineRisk = 25;
  else if (mom < 0) declineRisk = 10;
  else declineRisk = 0;

  let inactivityRisk = Math.min((inactivityDays || 0) * 12, 100);
  let volatilityRisk = Math.min((volatility || 0) * 20, 100);

  let rawRisk = (declineRisk * 0.55) + (inactivityRisk * 0.25) + (volatilityRisk * 0.20);

  let businessWeight = 1.0;
  if (prev < 100) businessWeight = 0.45;
  else if (prev <= 300) businessWeight = 0.65;
  else if (prev <= 700) businessWeight = 0.85;
  else if (prev <= 1500) businessWeight = 1.0;
  else businessWeight = 1.2;

  let impactScore = Math.min(100, Math.round(rawRisk * businessWeight));

  let severity = 'LOW';
  if (impactScore >= 70) severity = 'CRITICAL';
  else if (impactScore >= 45) severity = 'HIGH';
  else if (impactScore >= 25) severity = 'MEDIUM';
  else severity = 'LOW';

  const theme = getSeverityTheme(severity);

  return { impactScore, severity, theme };
}

/**
 * Get trend display color based ONLY on direction.
 *   positive or zero/null → green
 *   negative → red
 */
export function getTrendColor(mom, cur = null, prev = null) {
  if (mom == null || mom >= 0) return '#22c55e';
  return '#ef4444';
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


