// ═══════════════════════════════════════════════════════════════════════════════
// SEVERITY UTILITY — Delegates to trendEngine.js
// ═══════════════════════════════════════════════════════════════════════════════
// This module is kept for backward-compatibility with existing component imports.
// It now delegates entirely to the frontend trendEngine.
// NO backend visual fields are trusted.
// ═══════════════════════════════════════════════════════════════════════════════

import { calculateMoM, getSeverity } from './trendEngine';

/**
 * Derive severity metadata for any entity that has cur/prev (or mom).
 * Always recomputes MoM from cur/prev when available.
 * Falls back to entity.mom only if cur/prev are missing.
 */
export function getSeverityMeta(entity) {
  if (!entity) {
    return { severityTag: 'LOW', severityColor: '#22c55e' };
  }

  // Always prefer fresh frontend calculation from raw values
  let mom;
  if (entity.cur != null && entity.prev != null) {
    mom = calculateMoM(entity.cur, entity.prev);
  } else {
    mom = typeof entity.mom === 'number' ? entity.mom : 0;
  }

  const result = getSeverity(mom);

  return {
    severityTag: result.severity,
    severityColor: result.color,
  };
}
