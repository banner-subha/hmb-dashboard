// ═══════════════════════════════════════════════════════════════════════════════
// SEVERITY UTILITY — Delegates to trendEngine.js
// ═══════════════════════════════════════════════════════════════════════════════
// This module is kept for backward-compatibility with existing component imports.
// It now delegates entirely to the frontend trendEngine.
// NO backend visual fields are trusted.
// ═══════════════════════════════════════════════════════════════════════════════

import { calculateMoM, getBusinessImpact } from './trendEngine';

/**
 * Derive severity metadata for any entity that has cur/prev (or mom).
 * Always recomputes MoM from cur/prev when available.
 * Falls back to entity.mom only if cur/prev are missing.
 */
export function getSeverityMeta(entity) {
  if (!entity) {
    return { severityTag: 'LOW', severityColor: '#22c55e' };
  }

  let cur = entity.cur != null ? entity.cur : 0;
  let prev = entity.prev != null ? entity.prev : 0;

  if (entity.cur == null && entity.prev == null && typeof entity.mom === 'number') {
    prev = 100;
    cur = 100 * (1 + entity.mom / 100);
  }

  const { theme } = getBusinessImpact(cur, prev, entity.inactivityDays, entity.volatility);

  return {
    severityTag: theme.severity,
    severityColor: theme.color,
  };
}
