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
  pct = Math.max(-100, pct);
  return Number(pct.toFixed(1));
}

/**
 * SINGLE CENTRALIZED severity classifier.
 * This is the ONLY function that maps impactScore → severity tag.
 * ALL components, charts, maps, and tables MUST use this.
 *
 * Thresholds:
 *   score >= 70  →  CRITICAL
 *   score >= 50  →  HIGH
 *   score >= 30  →  MEDIUM (MODERATE)
 *   else         →  LOW (STABLE)
 */
export function getBusinessImpactThresholds() {
  return { CRITICAL: 70, HIGH: 50, MEDIUM: 30 };
}

export function getSeverityFromImpactScore(score) {
  if (score >= 70) return 'CRITICAL';
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
      severity: 'MODERATE',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.45)',
      shadow: 'none',
    },
    LOW: {
      severity: 'STABLE',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      border: 'rgba(34,197,94,0.45)',
      shadow: 'none',
    },
    CLEAR: {
      severity: 'Clear',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      border: 'rgba(34,197,94,0.45)',
      shadow: 'none',
    },
    ON_TRACK: {
      severity: 'On Track',
      color: '#22c55e',
      bg: 'rgba(34,197,94,0.12)',
      border: 'rgba(34,197,94,0.45)',
      shadow: 'none',
    },
    MONITOR: {
      severity: 'Monitor',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.45)',
      shadow: 'none',
    },
    AT_RISK: {
      severity: 'At Risk',
      color: '#f97316',
      bg: 'rgba(249,115,22,0.12)',
      border: 'rgba(249,115,22,0.45)',
      shadow: 'none',
    },
    NODATA: {
      severity: 'No Data',
      color: '#6b7280',
      bg: 'rgba(107,114,128,0.12)',
      border: 'rgba(107,114,128,0.45)',
      shadow: 'none',
    }
  };
  return themes[lvl] || themes['LOW'];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ALERT TAG BUSINESS LOGIC
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Formula: alertScore = (volumeRiskScore × 40%) + (paceScore × 30%) + (momScore × 30%)
 *
 * Primary Signal — Volume Risk / Volume Basis (40% weight):
 *   volumeRiskScore = Math.round(shareAmplifier × (underperformanceDeficit / 100))
 *   shareAmplifier = Math.min((sharePct / shareDenom) * 100, 100)
 *   shareDenom: STATE=20%, DISTRICT/PRODUCT=10%, DEALER=5%
 *
 * Secondary Signal — Pace vs Historical Avg (30% weight):
 *   paceAchievement = cur / expectedMtd
 *   ≥ 1.00  → paceScore = 0   (at or above historical pace)
 *   0.95–0.99 → 10            (within 5% behind)
 *   0.85–0.94 → 30            (5–15% behind)
 *   0.70–0.84 → 55            (15–30% behind)
 *   < 0.70    → 100           (>30% behind pace — serious underperformance)
 *
 * Supporting Signal — MoM Direction (30% weight):
 *   ≥ +10%          → momScore = 0   (strong growth, no concern)
 *   0% to +9.9%     → 10             (mild growth)
 *   -10% to -0.1%   → 35             (mild decline)
 *   -25% to -10.1%  → 65             (moderate decline)
 *   < -25%          → 100            (heavy decline)
 *
 * Final severity thresholds:
 *   alertScore >= 70 → CRITICAL
 *   alertScore >= 50 → HIGH
 *   alertScore >= 30 → MODERATE
 *   alertScore < 30 → STABLE
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function getBusinessImpact(cur = 0, prev = 0, sharePct = 0, level = '', stateName = '', expectedMtd = null) {
  const hasPaceBenchmark = expectedMtd !== null && expectedMtd !== undefined && expectedMtd > 0;
  const momPct = calculateMoM(cur, prev);   // pure MoM vs last month (not expectedMtd)

  // ── Edge case: never active (both zero) ─────────────────────────────────────
  if (cur === 0 && prev === 0) {
    return { impactScore: 0, severity: 'LOW', theme: getSeverityTheme('LOW') };
  }

  // ── Signal 1: Pace vs Historical Average (30% weight) ────────────────────────
  let paceScore = 0;
  if (hasPaceBenchmark) {
    const paceAchievement = cur / expectedMtd;
    if (paceAchievement >= 1.00)                              paceScore = 0;
    else if (paceAchievement >= 0.95)                         paceScore = 10;
    else if (paceAchievement >= 0.85)                         paceScore = 30;
    else if (paceAchievement >= 0.70)                         paceScore = 55;
    else                                                       paceScore = 100;
  } else if (cur === 0 && prev > 0) {
    paceScore = 100;
  }

  // ── Signal 2: MoM Direction (30% weight) ─────────────────────────────────────
  let momScore = 0;
  if (cur === 0 && prev > 0) {
    momScore = 100;
  } else if (momPct >= 10)                  momScore = 0;    // strong growth
  else if (momPct >= 0)              momScore = 10;   // mild growth
  else if (momPct >= -10)            momScore = 35;   // mild decline
  else if (momPct >= -25)            momScore = 65;   // moderate decline
  else                               momScore = 100;  // heavy decline (< -25%)

  // ── Underperformance Deficit (0 to 100) ─────────────────────────────────────
  const underperformanceDeficit = hasPaceBenchmark
    ? Math.round((paceScore * 0.50) + (momScore * 0.50))
    : momScore;

  // ── Primary Signal: Volume Risk / Share Basis (40% weight) ───────────────────
  const isDistrictOrProduct = (level === 'DISTRICT' || level === 'PRODUCT');
  const isDealer = (level === 'DEALER');
  const shareDenom = isDealer ? 5.0 : isDistrictOrProduct ? 10.0 : 25.0;
  const shareAmplifier = Math.min((sharePct / shareDenom) * 100, 100);
  const volumeRiskScore = Math.round(shareAmplifier * (underperformanceDeficit / 100));

  // ── Composite Score ─────────────────────────────────────────────────────────
  const alertScore = Math.round(
    (volumeRiskScore * 0.40) + (paceScore * 0.30) + (momScore * 0.30)
  );

  const impactScore = Math.min(100, alertScore);
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
