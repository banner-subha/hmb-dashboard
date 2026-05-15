import { calculateMoM, getSeverity } from '../../utils/trendEngine';

/**
 * ImpactBadge — glassmorphism severity pill.
 * 
 * Props:
 *   cur, prev — raw values (preferred; severity recomputed on frontend)
 *   tier      — fallback severity tag (only used if cur/prev not provided)
 *   score     — optional impact score for tooltip
 *   color     — fallback color (only used if cur/prev not provided and tier resolves to a known color)
 *   className — optional CSS class
 */
export default function ImpactBadge({ cur, prev, tier, score, color, className = '' }) {
  let displayColor;
  let label;

  // Prefer frontend calculation from raw values
  if (cur != null && prev != null) {
    const mom = calculateMoM(cur, prev);
    const sev = getSeverity(mom);
    displayColor = sev.color;
    label = sev.severity;
  } else if (tier) {
    label = tier.toUpperCase();
    // Map known tiers to colors
    if (label === 'CRITICAL') displayColor = '#ef4444';
    else if (label === 'MODERATE') displayColor = '#f97316';
    else if (label === 'LOW' || label === 'STABLE') displayColor = '#22c55e';
    else displayColor = color || '#94a3b8';
  } else {
    displayColor = color || '#94a3b8';
    label = '–';
  }

  let bg = 'rgba(148,163,184,0.12)';
  let border = 'rgba(148,163,184,0.35)';

  if (displayColor === '#22c55e') {
    bg = 'rgba(34,197,94,0.12)';
    border = 'rgba(34,197,94,0.35)';
  } else if (displayColor === '#f97316') {
    bg = 'rgba(249,115,22,0.12)';
    border = 'rgba(249,115,22,0.35)';
  } else if (displayColor === '#ef4444') {
    bg = 'rgba(239,68,68,0.12)';
    border = 'rgba(239,68,68,0.35)';
  }

  return (
    <div 
      className={className}
      title={score ? `Impact Score: ${score}` : ''}
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
        background: bg,
        border: `1px solid ${border}`,
        color: displayColor,
        whiteSpace: 'nowrap'
      }}
    >
      <span 
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          background: 'currentColor',
          boxShadow: '0 0 10px currentColor'
        }}
      />
      <span>{label}</span>
    </div>
  );
}
