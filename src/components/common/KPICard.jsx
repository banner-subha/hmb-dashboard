export default function KPICard({ label, value, subtitle, momDisplay, momColor, accentColor = '#3b82f6', className = '' }) {
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

  // Format value and unit separately for clean typography
  const renderFormattedValue = () => {
    const valStr = String(value ?? '').trim();
    const match = valStr.match(/^([\d,]+\.?\d*)\s*(.*)$/);
    if (match && match[1]) {
      const num = match[1];
      const unit = match[2];
      const numFontSize = num.length > 8
        ? 'text-2xl sm:text-3xl lg:text-[2.2rem] xl:text-[2.5rem] font-black'
        : 'text-3xl sm:text-4xl lg:text-[2.65rem] font-black';

      return (
        <div className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
          <span className={`${numFontSize} text-text-primary leading-none tracking-tight`}>
            {num}
          </span>
          {unit && (
            <span className="text-xs sm:text-sm lg:text-base font-bold text-text-secondary tracking-normal ml-0.5">
              {unit}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="text-2xl sm:text-3xl lg:text-[2.25rem] font-black text-text-primary leading-none whitespace-nowrap overflow-hidden text-ellipsis">
        {valStr}
      </div>
    );
  };

  return (
    <div
      className={`glass-card-hover relative p-4 sm:p-5 flex flex-col justify-between overflow-hidden h-full ${className}`}
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

      <div className="stat-label mb-2 text-xs font-bold text-text-muted uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </div>

      <div className="mb-1.5">
        {renderFormattedValue()}
      </div>

      <div className="text-xs text-text-secondary mt-1 flex items-center gap-2 truncate">
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
