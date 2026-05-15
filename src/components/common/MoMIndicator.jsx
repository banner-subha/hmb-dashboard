import { calculateMoM, getTrendColor, formatTrend } from '../../utils/trendEngine';

/**
 * MoMIndicator — displays a trend arrow + percentage.
 * 
 * Props:
 *   cur, prev — raw values (preferred; MoM recomputed on frontend)
 *   pct       — fallback MoM percentage (only used if cur/prev not provided)
 *   className — optional CSS class
 */
export default function MoMIndicator({ cur, prev, pct, className = '' }) {
  // Always prefer frontend calculation from cur/prev
  let mom;
  if (cur != null && prev != null) {
    mom = calculateMoM(cur, prev);
  } else {
    mom = pct != null ? parseFloat(pct) : null;
  }

  const color = getTrendColor(mom);
  const display = mom != null ? formatTrend(mom) : '—';

  return (
    <span 
      style={{ color }} 
      className={`font-bold whitespace-nowrap ${className}`}
    >
      {display}
    </span>
  );
}