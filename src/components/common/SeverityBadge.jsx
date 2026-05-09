import { SEVERITY_CONFIG } from '../../utils/constants';

export default function SeverityBadge({ severity, className = '' }) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.NONE;
  const badgeClass = `badge-${(severity || 'none').toLowerCase()}`;
  
  return (
    <span className={`${badgeClass} ${className}`}>
      {config.label || severity}
    </span>
  );
}
