export default function SeverityBadge({ severity, color, className = '' }) {
  let displayColor = color;
  const s = (severity || '').toUpperCase();
  if (!displayColor) {
    if (s === 'CRITICAL') displayColor = '#ef4444';
    else if (s === 'HIGH' || s === 'MODERATE') displayColor = '#f97316';
    else if (s === 'LOW' || s === 'STABLE') displayColor = '#22c55e';
    else displayColor = '#94a3b8';
  }

  const label = s || '–';

  let bg = 'rgba(148,163,184,0.12)';
  let border = 'rgba(148,163,184,0.35)';

  if (displayColor === '#22c55e') {
    bg = 'rgba(34,197,94,0.12)';
    border = 'rgba(34,197,94,0.35)';
  } else if (displayColor === '#f97316') {
    bg = 'rgba(249,115,22,0.12)';
    border = 'rgba(249,115,22,0.35)';
  } else if (displayColor === '#ef4444') {
    bg = 'rgba(239,68,68,0.12)';
    border = 'rgba(239,68,68,0.35)';
  }

  return (
    <div 
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.4px',
        backdropFilter: 'blur(6px)',
        background: bg,
        border: `1px solid ${border}`,
        color: displayColor,
        whiteSpace: 'nowrap'
      }}
    >
      <span 
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '999px',
          background: 'currentColor',
          boxShadow: '0 0 10px currentColor'
        }}
      />
      <span>{label}</span>
    </div>
  );
}
