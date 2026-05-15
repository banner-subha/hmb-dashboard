export default function ImpactBadge({ tier, score, color, className = '' }) {
  const displayColor = color || '#94a3b8';
  const label = tier ? tier.toUpperCase() : '–';

  return (
    <div 
      className={`inline-flex items-center gap-2 text-xs font-bold tracking-wider ${className}`} 
      title={score ? `Impact Score: ${score}` : ''}
    >
      <span 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: displayColor }}
      />
      <span style={{ color: displayColor }}>{label}</span>
    </div>
  );
}
