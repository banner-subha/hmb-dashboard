const TIER_CONFIG = {
  'Critical': { color: '#ef4444' },
  'High':     { color: '#f97316' },
  'Moderate': { color: '#f97316' },
  'Low':      { color: '#22c55e' },
  'Stable':   { color: '#22c55e' },
};

export default function ImpactBadge({ tier, score, className = '' }) {
  const config = TIER_CONFIG[tier] || { color: '#94a3b8' };
  const label = tier ? tier.toUpperCase() : '–';

  return (
    <div 
      className={`inline-flex items-center gap-2 text-xs font-bold tracking-wider ${className}`} 
      title={score ? `Impact Score: ${score}` : ''}
    >
      <span 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: config.color }}
      />
      <span style={{ color: config.color }}>{label}</span>
    </div>
  );
}
