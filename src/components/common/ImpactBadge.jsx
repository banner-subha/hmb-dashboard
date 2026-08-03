import { getBusinessImpact, getSeverityTheme } from '../../utils/trendEngine';

const SEVERITY_BUCKET = {
  '#ef4444': 'critical',
  '#f97316': 'high',
  '#eab308': 'medium',
  '#22c55e': 'none',
  '#6b7280': 'low',
};

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
    const { theme: derivedTheme, impactScore: computedScore } = getBusinessImpact(cur, prev);
    theme = derivedTheme;
    if (!score) score = computedScore;
  } else if (tier) {
    theme = getSeverityTheme(tier);
  } else {
    theme = getSeverityTheme('LOW');
    if (color) theme.color = color;
  }

  return (
    <div
      data-severity={SEVERITY_BUCKET[theme.color] || 'none'}
      className={className}
      title={score ? `Priority: ${score >= 75 ? 'Urgent Action' : score >= 50 ? 'Needs Attention' : score >= 40 ? 'Monitor' : 'On Track'}` : ''}
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
          background: 'currentColor'
        }}
      />
      <span>{theme.severity}</span>
    </div>
  );
}
