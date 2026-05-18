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
 * SINGLE CENTRALIZED severity classifier.
 * This is the ONLY function that maps impactScore → severity tag.
 * ALL components, charts, maps, and tables MUST use this.
 *
 * Thresholds:
 *   score >= 75  →  CRITICAL
 *   score >= 50  →  HIGH
 *   score >= 30  →  MEDIUM
 *   else         →  LOW
 */
export function getSeverityFromImpactScore(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

/**
 * Return glassmorphism theme styles for a severity level.
 * Input MUST be a severity tag from getSeverityFromImpactScore().
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
  const drop = Math.max(0, prev - cur);

  // 1. MoM decline risk curve
  let declineRisk = 0;
  if (mom <= -75) declineRisk = 100;
  else if (mom <= -60) declineRisk = 95;
  else if (mom <= -45) declineRisk = 83;
  else if (mom <= -30) declineRisk = 68;
  else if (mom <= -20) declineRisk = 52;
  else if (mom <= -10) declineRisk = 34;
  else if (mom < 0)    declineRisk = 16;

  // 2. Supporting risk signals
  const inactivityRisk = Math.min((inactivityDays || 0) * 15, 100);
  const volatilityRisk = Math.min((volatility || 0) * 28, 100);

  // 3. Raw risk — MoM dominates
  const rawRisk = (declineRisk * 0.70) + (inactivityRisk * 0.18) + (volatilityRisk * 0.12);

  // 4. Business weight by current volume
  let businessWeight = 1.0;
  if (cur < 100)       businessWeight = 0.80;
  else if (cur <= 300) businessWeight = 0.92;
  else if (cur <= 700) businessWeight = 1.00;
  else if (cur <= 1500)businessWeight = 1.10;
  else                 businessWeight = 1.22;

  // 5. Score — no dampener
  let impactScore = rawRisk * businessWeight;

  // 6. MT loss bonus (reduced to avoid double-stacking)
  const mtLoss = drop;
  if (mtLoss >= 1000)      impactScore += 12;
  else if (mtLoss >= 500)  impactScore += 6;

  // 7. Pre-threshold boost when raw ingredients are severe
  if (rawRisk >= 55) impactScore += 8;

  // 8. Hard CRITICAL floor — complete market collapse
  // Only fires when inactivityDays/volatility are NOT available (zeroed)
  // When real inactivity data exists, organic score should reach CRITICAL naturally
  if (cur === 0 && prev >= 100) {
    impactScore = Math.max(impactScore, 75);
  }

  impactScore = Math.min(100, Math.round(impactScore));

  const severity = getSeverityFromImpactScore(impactScore);
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
