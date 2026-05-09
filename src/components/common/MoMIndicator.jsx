import { getMoMInfo } from '../../utils/formatters';

export default function MoMIndicator({ pct, className = '' }) {
  const info = getMoMInfo(pct);
  if (pct == null || isNaN(pct)) return null;
  
  return (
    <span style={{ color: info.color }} className={`font-bold whitespace-nowrap ${className}`}>
      {info.arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
