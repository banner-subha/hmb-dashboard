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
 *   score >= 75  →  CRITICAL
 *   score >= 50  →  HIGH
 *   score >= 30  →  MEDIUM
 *   else         →  LOW
 */
export function getSeverityFromImpactScore(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
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

export function getBusinessImpact(cur = 0, prev = 0, sharePct = 0, level = '', stateName = '') {
  const mom = calculateMoM(cur, prev);
  const drop = Math.max(0, prev - cur);

  // Decline-Only Guard: If there is no decline in sales, immediately return LOW severity
  if (drop <= 0) {
    return { impactScore: 0, severity: 'LOW', theme: getSeverityTheme('LOW') };
  }

  if (level === 'DEALER') {
    // --- DEALER LEVEL SCORER (Percentage/Decline-based) ---
    // 1. MoM decline risk curve
    let declineRisk = 0;
    if (mom <= -75) declineRisk = 100;
    else if (mom <= -60) declineRisk = 95;
    else if (mom <= -45) declineRisk = 83;
    else if (mom <= -30) declineRisk = 68;
    else if (mom <= -20) declineRisk = 52;
    else if (mom <= -10) declineRisk = 34;
    else if (mom < 0)    declineRisk = 16;

    // 2. Supporting risk signals (inactivity & volatility derived from cur/prev)
    const inactivityDays = cur > 0 ? 0 : 30;
    const inactivityRisk = Math.min((inactivityDays || 0) * 15, 100);
    
    const volatilityVal = Math.min(100, Math.abs(mom));
    const volatilityRisk = Math.min(volatilityVal * 28, 100);

    // 3. Raw risk
    const rawRisk = (declineRisk * 0.70) + (inactivityRisk * 0.18) + (volatilityRisk * 0.12);

    // 4. Business weight by current volume
    let businessWeight = 1.0;
    if (cur < 100)        businessWeight = 0.80;
    else if (cur <= 300)  businessWeight = 0.92;
    else if (cur <= 700)  businessWeight = 1.00;
    else if (cur <= 1500) businessWeight = 1.10;
    else                  businessWeight = 1.22;

    // 5. Score
    let impactScore = rawRisk * businessWeight;

    // 6. Pre-threshold boost when raw ingredients are severe
    if (rawRisk >= 55) impactScore += 8;

    // 7. Hard CRITICAL floor — complete market collapse
    if (cur === 0 && prev >= 100) {
      impactScore = Math.max(impactScore, 75);
    }

    impactScore = Math.min(100, Math.round(impactScore));
    const severity = getSeverityFromImpactScore(impactScore);
    const theme = getSeverityTheme(severity);

    return { impactScore, severity, theme };
  } else {
    // --- REGIONAL / DISTRICT LEVEL SCORER (Weight-based) ---
    const STRATEGIC_STATES = new Set(['West Bengal', 'Jharkhand', 'Odisha']);

    // 1. Scale denominators based on level (districts/products are smaller than states/overall)
    const isDistrictOrProduct = (level === 'DISTRICT' || level === 'PRODUCT');
    const shareDenom = isDistrictOrProduct ? 3.0 : 20.0;
    const dropDenom = isDistrictOrProduct ? 80.0 : 300.0;
    const volumeDenom = isDistrictOrProduct ? 120.0 : 500.0;

    const shareWeight = Math.min((sharePct / shareDenom) * 100, 100);
    const dropWeight = Math.min((drop / dropDenom) * 100, 100);
    
    let momWeight = 0;
    if (mom <= -70) momWeight = 100;
    else if (mom <= -50) momWeight = 80;
    else if (mom <= -30) momWeight = 50;
    else if (mom <= -15) momWeight = 20;
    
    const volumeWeight = Math.min((prev / volumeDenom) * 100, 100);
    
    // 2. Weighted score
    let impactScore = (shareWeight * 0.35) + (dropWeight * 0.30) + (momWeight * 0.20) + (volumeWeight * 0.15);
    
    // 3. Strategic state boost
    if (STRATEGIC_STATES.has(stateName || '')) {
      if (drop >= 75 || mom <= -15) {
        impactScore += 5;
      }
    }

    // 4. Severe MoM decline boost (highlight severe relative drop in active markets)
    if (mom <= -70) {
      impactScore += 15;
    } else if (mom <= -50) {
      impactScore += 8;
    }
    
    // 5. Zero-collapse tiered inactivity floor (cur === 0 and prev > 0)
    if (cur === 0 && prev > 0) {
      if (isDistrictOrProduct) {
        if (prev >= 50) {
          impactScore = Math.max(impactScore, 75); // CRITICAL
        } else if (prev >= 25) {
          impactScore = Math.max(impactScore, 55); // HIGH
        } else if (prev >= 10) {
          impactScore = Math.max(impactScore, 42); // MEDIUM
        } else if (prev >= 2) {
          impactScore = Math.max(impactScore, 32); // visible LOW
        }
      } else {
        if (prev >= 100) {
          impactScore = Math.max(impactScore, 75); // CRITICAL
        } else if (prev >= 50) {
          impactScore = Math.max(impactScore, 55); // HIGH
        } else if (prev >= 25) {
          impactScore = Math.max(impactScore, 42); // MEDIUM
        } else if (prev >= 5) {
          impactScore = Math.max(impactScore, 32); // visible LOW
        }
      }
    }
    
    impactScore = Math.min(100, Math.round(impactScore));
    const severity = getSeverityFromImpactScore(impactScore);
    const theme = getSeverityTheme(severity);
    
    return { impactScore, severity, theme };
  }
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
