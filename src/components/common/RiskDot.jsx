import { getRiskColor } from '../../utils/formatters';

export default function RiskDot({ score, className = '' }) {
  const color = getRiskColor(score);
  return (
    <span 
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`}
      style={{ backgroundColor: color }}
      title={`Risk Score: ${score}`}
    />
  );
}
