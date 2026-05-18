import React from 'react';
import { getBusinessImpact } from '../../utils/trendEngine';

/**
 * HealthBadge Component
 * Derives operational health status from trendEngine when cur/prev are available.
 * Falls back to presentational-only rendering for legacy callers.
 */
export default function HealthBadge({ cur, prev, status, color, className = '' }) {
  let displayColor = color || '#94a3b8';
  let label = status || '–';

  // Prefer frontend derivation from raw values
  if (cur != null && prev != null) {
    const { severity, theme } = getBusinessImpact(cur, prev);
    displayColor = theme.color;
    label = severity;
  }

  if (!label || label === '–') return null;

  return (
    <div 
      className={`inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold border border-white/5 uppercase tracking-tight ${className}`}
      style={{ 
        backgroundColor: `${displayColor}15`, // 15% opacity bg
        color: displayColor
      }}
    >
      {label}
    </div>
  );
}
