import React from 'react';

function KPICard({
  label,
  value,
  subtitle,
  momDisplay,
  momColor,
  accentColor = '#3b82f6',
  lightAccentColor,
  className = ''
}) {
  const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  const effectiveAccent = isLight && lightAccentColor ? lightAccentColor : accentColor;
  const displayColor = momColor || '#94a3b8';

  // Format value and unit separately for clean typography
  const renderFormattedValue = () => {
    const valStr = String(value ?? '').trim();
    const match = valStr.match(/^([\d,]+\.?\d*)\s*(.*)$/);
    if (match && match[1]) {
      const num = match[1];
      const unit = match[2];
      const numFontSize = num.length > 8
        ? 'text-2xl sm:text-3xl lg:text-[2.35rem] xl:text-[2.6rem] font-black'
        : 'text-3xl sm:text-4xl lg:text-[2.85rem] xl:text-[3.05rem] font-black';

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
      <div className="text-2xl sm:text-3xl lg:text-[2.45rem] font-black text-text-primary leading-none whitespace-nowrap overflow-hidden text-ellipsis">
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
      {/* Crisp solid side accent line on the left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px]"
        style={{ backgroundColor: effectiveAccent }}
      />

      <div className="stat-label mb-2 text-xs sm:text-[13px] font-bold text-text-muted uppercase tracking-wide leading-snug">
        {label}
      </div>

      <div className="mb-1.5">
        {renderFormattedValue()}
      </div>

      <div className="text-xs sm:text-[13px] text-text-secondary mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
        {momDisplay && (
          <span style={{ color: displayColor }} className="text-sm sm:text-[13.5px] font-black tracking-wide whitespace-nowrap">
            {momDisplay}
          </span>
        )}
        <span className="font-semibold text-text-muted/90 leading-snug">{subtitle}</span>
      </div>
    </div>
  );
}

export default React.memo(KPICard);
