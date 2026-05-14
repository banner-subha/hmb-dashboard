import React from 'react';

/**
 * HealthBadge Component
 * Purely presentational component that renders operational health status
 * based on backend-provided intelligence fields.
 */
export default function HealthBadge({ status, color, className = '' }) {
  // Graceful fallback for missing fields
  if (!status) return null;
  
  const displayColor = color || '#94a3b8';
  const label = status || '–';

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
