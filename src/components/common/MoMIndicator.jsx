import { getMoMInfo } from '../../utils/formatters';

export default function MoMIndicator({ pct, className = '' }) {
  if (pct == null || isNaN(pct)) {
    return <span className={`font-bold text-text-muted ${className}`}>—</span>;
  }

  const val = parseFloat(pct);

  // New logic: > 0 is green (increase), < 0 is red (drop)
  let color = '#94a3b8'; // default neutral/grey for 0%
  let arrow = '';

  if (val > 0) {
    color = '#22c55e'; // Green
    arrow = '↑';
  } else if (val < 0) {
    color = '#ef4444'; // Red
    arrow = '↓';
  }

  return (
    <span style={{ color }} className={`font-bold whitespace-nowrap ${className}`}>
      {arrow && <span className="mr-0.5">{arrow}</span>}{val.toFixed(1)}%
    </span>
  );
}