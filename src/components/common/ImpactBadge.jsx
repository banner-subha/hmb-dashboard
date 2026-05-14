// Presentational mapping — maps backend tier strings to visual styles.
// This is NOT intelligence; it's pure UI configuration.
const TIER_CONFIG = {
  'Critical': { icon: '🔴', bg: 'bg-severity-critical/20', text: 'text-severity-critical' },
  'High':     { icon: '🟠', bg: 'bg-severity-high/20',     text: 'text-severity-high' },
  'Moderate': { icon: '🟡', bg: 'bg-severity-medium/20',   text: 'text-severity-medium' },
  'Low':      { icon: '🟢', bg: 'bg-severity-none/20',     text: 'text-emerald-500' },
  'Stable':   { icon: '🟢', bg: 'bg-severity-none/20',     text: 'text-severity-none' },
};

export default function ImpactBadge({ tier, score, className = '' }) {
  // Graceful fallback if tier is missing
  const config = TIER_CONFIG[tier] || { icon: '⚪', bg: 'bg-bg-secondary', text: 'text-text-muted' };
  const label = tier || '–';

  return (
    <div 
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold ${config.bg} ${config.text} ${className}`} 
      title={score ? `Impact Score: ${score}` : ''}
    >
      <span>{config.icon}</span>
      <span>{label}</span>
    </div>
  );
}
