import { calculateImpactScore, getSeverityLevel, getSeverityTheme } from '../../utils/trendEngine';

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
  let theme;

  // Prefer frontend calculation from raw values
  if (cur != null && prev != null) {
    const impactScore = calculateImpactScore(cur, prev);
    const sevLevel = getSeverityLevel(impactScore);
    theme = getSeverityTheme(sevLevel);
  } else if (tier) {
    theme = getSeverityTheme(tier);
  } else {
    theme = getSeverityTheme('LOW');
    if (color) theme.color = color;
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
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        color: theme.color,
        boxShadow: theme.shadow,
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
      <span>{theme.severity}</span>
    </div>
  );
}
