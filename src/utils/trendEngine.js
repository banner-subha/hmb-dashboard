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
  let pct;
  if (prev <= 0) {
    if (cur <= 0) pct = 0;
    else pct = 100;
  } else {
    pct = ((cur - prev) / prev) * 100;
  }
  // Symmetric clamp — mirrors the backend n8n mom() cap of ±100
  pct = Math.max(-100, Math.min(100, pct));
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
  return { CRITICAL: 75, HIGH: 50, MEDIUM: 30 };
}

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
      severity: 'MODERATE',
      color: '#eab308',
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.45)',
      shadow: 'none',
    },
    MODERATE: {
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
    STABLE: {
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
 * ALERT TAG BUSINESS LOGIC — Volume-Tiered Business Risk Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Commercial Principle:
 *   Business Impact = (Volume Gravity at Stake) × (Underperformance Signal)
 *
 *   1. High-density entities (major markets, large volumes) carry full business
 *      impact: substantial volume drops translate directly to HIGH or CRITICAL.
 *   2. Growing entities (positive MoM, cur > prev) represent expanding business;
 *      moderate pace deficits are tempered so growing markets are not falsely alarmed.
 *   3. Low-volume / fringe entities (e.g. states < 50 MT like Manipur/Rajasthan,
 *      small states < 400 MT like Tripura/Arunachal, micro-districts, and small dealers)
 *      are capped at MODERATE or STABLE/LOW. A complete collapse of an 8 MT fringe
 *      account must never rival a 400 MT drop in a core market.
 *
 * Final severity thresholds:
 *   impactScore >= 75 → CRITICAL
 *   impactScore >= 50 → HIGH
 *   impactScore >= 30 → MODERATE (MEDIUM)
 *   impactScore < 30  → STABLE (LOW)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function getBusinessImpact(cur = 0, prev = 0, sharePct = 0, level = '', stateName = '', expectedMtd = null, lossFlag = null, lossDeltaPct = null) {
  // Support passing options object or composite benchmark
  if (typeof expectedMtd === 'object' && expectedMtd !== null) {
    lossFlag = expectedMtd.lossFlag || lossFlag;
    lossDeltaPct = expectedMtd.lossDeltaPct || lossDeltaPct;
    expectedMtd = expectedMtd.expectedMtd;
  }

  const momPct = calculateMoM(cur, prev);
  const maxVol = Math.max(cur, prev);
  const dropMT = Math.max(0, prev - cur);

  // ── Edge case: never active (both zero) ─────────────────────────────────────
  if (cur === 0 && prev === 0) {
    return { impactScore: 0, severity: 'LOW', theme: getSeverityTheme('LOW') };
  }

  // ── Signal 1: Pace vs Historical Average (0 - 100) ──────────────────────────
  let paceScore = 0;
  if (lossFlag === 'AHEAD') {
    paceScore = 0;
  } else if (lossFlag === 'BEHIND') {
    const delta = Math.abs(Number(lossDeltaPct) || 0);
    if (delta <= 10) paceScore = 15;
    else if (delta <= 25) paceScore = 35;
    else if (delta <= 50) paceScore = 65;
    else paceScore = 100;
  } else if (expectedMtd !== null && expectedMtd !== undefined && expectedMtd > 0) {
    const paceAchievement = cur / expectedMtd;
    if (paceAchievement >= 1.00) paceScore = 0;
    else if (paceAchievement >= 0.90) paceScore = 15;
    else if (paceAchievement >= 0.75) paceScore = 35;
    else if (paceAchievement >= 0.50) paceScore = 65;
    else paceScore = 100;
  } else if (cur === 0 && prev > 0) {
    paceScore = 100;
  }

  // ── Signal 2: MoM Direction (0 - 100) ───────────────────────────────────────
  let momScore = 0;
  if (cur === 0 && prev > 0) {
    momScore = 100;
  } else if (momPct >= 10) {
    momScore = 0;   // strong growth
  } else if (momPct >= 0) {
    momScore = 10;  // mild growth
  } else if (momPct >= -10) {
    momScore = 30;  // mild decline
  } else if (momPct >= -25) {
    momScore = 60;  // moderate decline
  } else {
    momScore = 100; // severe decline (< -25%)
  }

  // ── Underperformance Deficit (0 - 100) ──────────────────────────────────────
  let deficit;
  if (momPct > 0) {
    // Growing accounts are expanding; pace shortfall is a secondary monitoring signal
    deficit = Math.min(30, Math.round(paceScore * 0.35));
  } else if (lossFlag != null || (expectedMtd !== null && expectedMtd > 0)) {
    deficit = Math.round((paceScore * 0.5) + (momScore * 0.5));
  } else {
    deficit = momScore;
  }

  // ── Volume Gravity / Weight Factor (0.0 - 1.0) & Severity Caps ──────────────
  const lvl = (level || '').toUpperCase();
  let volumeWeight = 1.0;
  let maxAllowedSeverity = 'CRITICAL';

  if (lvl === 'STATE') {
    // Tier 1: Core High-Density State (share >= 7.0% or volume >= 1000 MT, e.g. WB, Jharkhand, Orissa, Assam, Bihar)
    if (sharePct >= 7.0 || maxVol >= 1000) {
      volumeWeight = 1.0;
      maxAllowedSeverity = 'CRITICAL';
    } 
    // Tier 2: Mid-Density State (share >= 2.5% or volume >= 400 MT, e.g. UP)
    else if (sharePct >= 2.5 || maxVol >= 400) {
      volumeWeight = 0.85;
      maxAllowedSeverity = dropMT >= 400 ? 'CRITICAL' : 'HIGH';
    } 
    // Tier 3: Small State (share >= 0.5% or volume >= 50 MT, e.g. Tripura, Arunachal)
    else if (sharePct >= 0.5 || maxVol >= 50) {
      volumeWeight = 0.45;
      maxAllowedSeverity = 'MODERATE'; // Cannot be HIGH or CRITICAL
    } 
    // Tier 4: Micro / Fringe State (share < 0.5% and volume < 50 MT, e.g. Rajasthan, Manipur)
    else {
      volumeWeight = 0.20;
      maxAllowedSeverity = 'LOW'; // strictly STABLE / LOW
    }
  } else if (lvl === 'DISTRICT' || lvl === 'PRODUCT') {
    // Tier 1: Key High-Volume District (share >= 3.0% or volume >= 200 MT)
    if (sharePct >= 3.0 || maxVol >= 200) {
      volumeWeight = 1.0;
      maxAllowedSeverity = 'CRITICAL';
    } 
    // Tier 2: Mid-Volume District (share >= 1.0% or volume >= 50 MT)
    else if (sharePct >= 1.0 || maxVol >= 50) {
      volumeWeight = 0.80;
      maxAllowedSeverity = dropMT >= 80 ? 'CRITICAL' : 'HIGH';
    } 
    // Tier 3: Small District (share >= 0.2% or volume >= 15 MT)
    else if (sharePct >= 0.2 || maxVol >= 15) {
      volumeWeight = 0.45;
      maxAllowedSeverity = 'MODERATE';
    } 
    // Tier 4: Micro District (volume < 15 MT)
    else {
      volumeWeight = 0.20;
      maxAllowedSeverity = maxVol >= 8 ? 'MODERATE' : 'LOW';
    }
  } else if (lvl === 'DEALER') {
    // Tier 1: Major Key Account (share >= 1.0% or volume >= 80 MT)
    if (sharePct >= 1.0 || maxVol >= 80) {
      volumeWeight = 1.0;
      maxAllowedSeverity = 'CRITICAL';
    } 
    // Tier 2: Mid Dealer (share >= 0.3% or volume >= 25 MT)
    else if (sharePct >= 0.3 || maxVol >= 25) {
      volumeWeight = 0.75;
      maxAllowedSeverity = dropMT >= 40 ? 'HIGH' : 'MODERATE';
    } 
    // Tier 3: Small Dealer (volume >= 8 MT)
    else if (maxVol >= 8) {
      volumeWeight = 0.40;
      maxAllowedSeverity = 'MODERATE';
    } 
    // Tier 4: Micro Dealer (volume < 8 MT, e.g. 0.92 MT dealer)
    else {
      volumeWeight = 0.15;
      maxAllowedSeverity = 'LOW';
    }
  } else {
    // Generic fallback
    if (maxVol >= 100) volumeWeight = 1.0;
    else if (maxVol >= 30) volumeWeight = 0.7;
    else volumeWeight = 0.3;
    if (maxVol < 15) maxAllowedSeverity = 'LOW';
    else if (maxVol < 60) maxAllowedSeverity = 'MODERATE';
  }

  // ── Calculate Final Impact Score ─────────────────────────────────────────────
  let rawScore = Math.round(deficit * volumeWeight);

  // Bonus for large absolute MT lost
  if (dropMT >= 1000) rawScore += 20;
  else if (dropMT >= 400) rawScore += 10;
  else if (dropMT >= 150) rawScore += 5;

  let impactScore = Math.min(100, Math.max(0, rawScore));

  let severity = 'LOW';
  if (impactScore >= 75) severity = 'CRITICAL';
  else if (impactScore >= 50) severity = 'HIGH';
  else if (impactScore >= 30) severity = 'MEDIUM';
  else severity = 'LOW';

  // Enforce volume-tier ceiling caps
  const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, MODERATE: 2, LOW: 1, STABLE: 1 };
  if (rank[severity] > rank[maxAllowedSeverity]) {
    severity = maxAllowedSeverity === 'MODERATE' ? 'MEDIUM' : maxAllowedSeverity;
    if (severity === 'MEDIUM' && impactScore >= 50) impactScore = 45;
    if (severity === 'LOW' && impactScore >= 30) impactScore = 20;
  }

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
