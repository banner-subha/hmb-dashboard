import { getMoMInfo } from '../../utils/formatters';

export default function MoMIndicator({ pct, className = '' }) {
  if (pct == null || isNaN(pct)) {
    return <span className={`font-bold text-text-muted ${className}`}>—</span>;
  }
  
  const val = parseFloat(pct);
  // Achievement ratio coloring: green ≥75, orange ≥50, red <50
  const color = val >= 75 ? '#22c55e' : val >= 50 ? '#f97316' : '#ef4444';
  // Arrows: ↑ if exceeding prior period (≥100), ↓ if below 75%
  const arrow = val >= 100 ? '↑' : val < 75 ? '↓' : '';
  
  return (
    <span style={{ color }} className={`font-bold whitespace-nowrap ${className}`}>
      {arrow && <span className="mr-0.5">{arrow}</span>}{val.toFixed(1)}%
    </span>
  );
}
