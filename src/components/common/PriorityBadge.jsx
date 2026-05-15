export default function PriorityBadge({ priority, className = '' }) {
  const s = (priority || '').toString().trim().toUpperCase();
  
  let bg = 'rgba(148,163,184,0.12)';
  let border = 'rgba(148,163,184,0.35)';
  let color = '#94a3b8';

  if (s === 'IMMEDIATE' || s === 'CRITICAL') {
    bg = 'rgba(239,68,68,0.12)';
    border = 'rgba(239,68,68,0.35)';
    color = '#ef4444';
  } else if (s === 'HIGH') {
    bg = 'rgba(249,115,22,0.12)';
    border = 'rgba(249,115,22,0.35)';
    color = '#f97316';
  } else if (s === 'MEDIUM') {
    bg = 'rgba(234,179,8,0.12)';
    border = 'rgba(234,179,8,0.35)';
    color = '#eab308';
  } else if (s === 'LOW') {
    bg = 'rgba(34,197,94,0.12)';
    border = 'rgba(34,197,94,0.35)';
    color = '#22c55e';
  }

  return (
    <div 
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 12px',
        minHeight: '32px',
        borderRadius: '10px',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.4px',
        width: 'fit-content',
        backdropFilter: 'blur(6px)',
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        whiteSpace: 'nowrap'
      }}
    >
      {s || '–'}
    </div>
  );
}
