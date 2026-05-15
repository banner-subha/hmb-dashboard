export default function MoMIndicator({ pct, className = '' }) {
  const displayValue = pct != null ? `${Math.abs(parseFloat(pct)).toFixed(1)}%` : '—';
  
  let arrow = '';
  let color = '#94a3b8'; // neutral
  
  if (pct != null) {
    const val = parseFloat(pct);
    if (val > 0) {
      arrow = '↑';
      color = '#22c55e'; // green
    } else if (val < 0) {
      arrow = '↓';
      color = '#ef4444'; // red
    }
  }

  return (
    <span 
      style={{ color }} 
      className={`font-bold whitespace-nowrap ${className}`}
    >
      {arrow && <span className="mr-0.5">{arrow}</span>}
      {displayValue}
    </span>
  );
}