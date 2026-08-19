import { getSeverityTheme } from '../../utils/trendEngine';

const SEVERITY_BUCKET = {
  '#f87171': 'critical',
  '#ef4444': 'critical',
  '#f97316': 'high',
  '#eab308': 'medium',
  '#22c55e': 'none',
  '#6b7280': 'low',
  '#94a3b8': 'low',
};

/**
 * PriorityBadge — renders action priority using trendEngine-derived colors.
 * Maps IMMEDIATE/CRITICAL/HIGH/MEDIUM/LOW to the centralized severity theme.
 */
export default function PriorityBadge({ priority, className = '' }) {
  const s = (priority || '').toString().trim().toUpperCase();
  
  // Map priority labels to severity levels for color derivation
  let severityKey = 'LOW';
  if (s === 'IMMEDIATE' || s === 'CRITICAL') severityKey = 'CRITICAL';
  else if (s === 'HIGH') severityKey = 'HIGH';
  else if (s === 'MEDIUM') severityKey = 'MEDIUM';
  else if (s === 'LOW') severityKey = 'LOW';

  const theme = getSeverityTheme(severityKey);
  // For unrecognized priorities, use neutral
  const bg = (s && severityKey !== 'LOW' && s !== 'LOW') ? theme.bg : (s === 'LOW' ? theme.bg : 'rgba(148,163,184,0.12)');
  const border = (s && severityKey !== 'LOW' && s !== 'LOW') ? theme.border : (s === 'LOW' ? theme.border : 'rgba(148,163,184,0.35)');
  const color = (s && (severityKey !== 'LOW' || s === 'LOW')) ? theme.color : '#94a3b8';

  return (
    <div
      data-severity={SEVERITY_BUCKET[color] || 'none'}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 14px',
        minHeight: '32px',
        borderRadius: '10px',
        fontSize: '12.5px',
        fontWeight: 800,
        letterSpacing: '0.4px',
        width: 'fit-content',
        backdropFilter: 'blur(6px)',
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        whiteSpace: 'nowrap'
      }}
    >
      {s === 'MEDIUM' ? 'MODERATE' : (s || '–')}
    </div>
  );
}
