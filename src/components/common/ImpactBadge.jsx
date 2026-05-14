import { getImpactTier } from '../../utils/formatters';

export default function ImpactBadge({ score, className = '' }) {
  const tier = getImpactTier(score);
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold ${tier.bg} ${tier.text} ${className}`} title={`Impact Score: ${score}`}>
      <span>{tier.icon}</span>
      <span>{tier.label}</span>
    </div>
  );
}
