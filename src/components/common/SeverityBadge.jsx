export default function SeverityBadge({ severity, color, className = '' }) {
  const displayColor = color || '#94a3b8';
  const label = severity ? severity.toUpperCase() : '–';
  
  return (
    <div className={`inline-flex items-center gap-2 text-xs font-bold tracking-wider ${className}`}>
      <span 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: displayColor }}
      />
      <span style={{ color: displayColor }}>{label}</span>
    </div>
  );
}
