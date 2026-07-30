import { getSeverityTheme } from '../../utils/trendEngine';

export default function SeverityBadge({ severity, color, className = '' }) {
  const theme = getSeverityTheme(severity);

  // Allow manual color override if provided, else use theme
  const displayColor = color || theme.color;

  return (
    <div 
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.4px',
        backdropFilter: 'blur(6px)',
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        color: displayColor,
        boxShadow: theme.shadow,
        whiteSpace: 'nowrap'
      }}
    >
      <span 
        style={{
          width: '8px',
          height: '8px',
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
