// Mapping trend directions to visual styles.
const DIRECTION_CONFIG = {
  'up':      { color: '#22c55e', arrow: '↑' },
  'down':    { color: '#ef4444', arrow: '↓' },
  'neutral': { color: '#94a3b8', arrow: '' },
};

export default function MoMIndicator({ direction, label, pct, className = '' }) {
  // Graceful fallback to backend-provided intelligence fields
  // If missing, use neutral display or plain percentage
  const config = DIRECTION_CONFIG[direction] || DIRECTION_CONFIG.neutral;
  const displayValue = label || (pct != null ? `${parseFloat(pct).toFixed(1)}%` : '—');

  return (
    <span 
      style={{ color: config.color }} 
      className={`font-bold whitespace-nowrap ${className}`}
    >
      {config.arrow && <span className="mr-0.5">{config.arrow}</span>}
      {displayValue}
    </span>
  );
}