import React from 'react';
import { getSeverityTheme } from '../../utils/trendEngine';

// Map a severity hue to a 5-bucket id used by CSS light-mode overrides.
// Bucketed by the same color that renders in dark mode so the light hue matches.
const SEVERITY_BUCKET = {
  '#f87171': 'critical',
  '#ef4444': 'critical',
  '#f97316': 'high',
  '#eab308': 'medium',
  '#22c55e': 'none',
  '#6b7280': 'low',
};

function SeverityBadge({ severity, color, className = '' }) {
  const theme = getSeverityTheme(severity);

  // Allow manual color override if provided, else use theme
  const displayColor = color || theme.color;
  const bucket = SEVERITY_BUCKET[displayColor] || 'none';

  return (
    <div
      data-severity={bucket}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 12px',
        marginRight: '8px',
        borderRadius: '999px',
        fontSize: '12.5px',
        fontWeight: 800,
        letterSpacing: '0.4px',
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        color: displayColor,
        boxShadow: theme.shadow,
        whiteSpace: 'nowrap'
      }}
    >
      <span 
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '999px',
          background: 'currentColor'
        }}
      />
      <span>
        {theme.severity}
      </span>
    </div>
  );
}

export default React.memo(SeverityBadge);
