export default function KPICard({ label, value, subtitle, momDisplay, momColor, accentColor = '#3b82f6' }) {
  const displayColor = momColor || '#94a3b8';

  // Helper to convert hex to rgba for gradient fade
  const hexToRgba = (hex, alpha) => {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const gradientBg = accentColor.startsWith('#') && accentColor.length === 7
    ? `linear-gradient(180deg, ${accentColor} 0%, ${hexToRgba(accentColor, 0.1)} 100%)`
    : `linear-gradient(180deg, ${accentColor} 0%, rgba(59, 130, 246, 0.1) 100%)`;

  const glowColor = accentColor.startsWith('#') && accentColor.length === 7
    ? hexToRgba(accentColor, 0.08)
    : 'rgba(59, 130, 246, 0.08)';

  return (
    <div
      className="glass-card-hover relative p-5 sm:p-6 flex flex-col justify-between overflow-hidden"
      style={{
        borderLeftWidth: '0',
      }}
    >
      {/* Side gradient accent line on the left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px]"
        style={{ background: gradientBg }}
      />

      {/* Subtle left corner glow */}
      <div
        className="absolute top-0 left-0 w-32 h-20 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 0% 0%, ${glowColor}, transparent 75%)` }}
      />

      <div className="stat-label mb-2.5">
        {label}
      </div>

      <div className="kpi-value truncate mb-1.5">
        {value}
      </div>

      <div className="text-xs sm:text-sm text-text-secondary mt-1 flex items-center gap-2 truncate">
        {momDisplay && (
          <span style={{ color: displayColor }} className="font-bold whitespace-nowrap">
            {momDisplay}
          </span>
        )}
        <span className="truncate text-text-muted">{subtitle}</span>
      </div>
    </div>
  );
}
