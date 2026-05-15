export function getSeverityMeta(entity) {
  if (!entity) {
    return { severityTag: 'LOW', severityColor: '#22c55e' };
  }

  const mom = typeof entity.mom === 'number' ? entity.mom : 0;
  const impactScore = entity.impactScore ?? entity.riskScore ?? 0;

  // Frontend derivation rules
  if (mom <= -25 || impactScore >= 75) {
    return { severityTag: 'CRITICAL', severityColor: '#ef4444' };
  }
  
  if ((mom <= -10 && mom > -25) || (impactScore >= 40 && impactScore <= 74)) {
    return { severityTag: 'MODERATE', severityColor: '#f97316' };
  }
  
  if (mom > -10 && impactScore < 40) {
    return { severityTag: 'LOW', severityColor: '#22c55e' };
  }

  // Graceful fallback to backend provided values if derivation fails
  return { 
    severityTag: entity.impactTier || 'LOW', 
    severityColor: entity.severityColor || entity.displayColor || '#22c55e' 
  };
}
