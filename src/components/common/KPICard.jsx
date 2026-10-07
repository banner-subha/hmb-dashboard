import React from 'react';

function KPICard({
  label,
  value,
  subtitle,
  momDisplay,
  momColor,
  accentColor = '#3b82f6',
  lightAccentColor,
  loading = false,
  fitValue = false,
  // 'lg' (Executive Overview only): bigger label, figure and sub-line.
  size = 'md',
  className = ''
}) {
  const lg = size === 'lg';
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

      // fitValue: the figure scales with the tile instead of stepping by
      // breakpoint, so a tile in a row of variable-width tiles never clips.
      // The divisor is the figure's width in ems (tabular digits ~0.62em,
      // the fixed-size unit roughly 0.4em a character). A parent may set
      // --kpi-fit instead: a row that splits its width by weight sets it to
      // the weight, so every figure in that row lands at the same size.
      const fitEm = (num.length * 0.62 + (unit ? unit.length * 0.4 + 0.3 : 0)).toFixed(2);
      // lg fills more of the tile: the em estimate above runs about 20% wide
      // (commas and points are narrower than digits), so 1.12 still leaves room.
      const fitStyle = fitValue
        ? {
            fontSize: lg
              ? `clamp(1.25rem, calc(100cqi * 1.12 / var(--kpi-fit, ${fitEm})), var(--kpi-max, 3.5rem))`
              : `clamp(1.5rem, calc(100cqi / var(--kpi-fit, ${fitEm})), 3.05rem)`,
          }
        : undefined;

      return (
        <div className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
          <span
            className={`${fitValue ? 'font-black' : numFontSize} text-text-primary leading-none tracking-tight`}
            style={fitStyle}
          >
            {num}
          </span>
          {unit && (
            <span className={`${lg ? 'text-sm sm:text-base lg:text-lg' : 'text-xs sm:text-sm lg:text-base'} font-bold text-text-secondary tracking-normal ml-0.5`}>
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
      className={`glass-card-hover kpi-tile relative ${fitValue ? 'p-4' : 'p-4 sm:p-5'} ${lg ? '[container-type:inline-size]' : ''} flex flex-col overflow-hidden h-full ${className}`}
      style={{
        borderLeftWidth: '0',
      }}
    >
      {/* Crisp solid side accent line on the left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px]"
        style={{ backgroundColor: effectiveAccent }}
      />

      {/* A fitted row keeps each label to one line, so every figure in the row
          sits on the same baseline; the full label stays in the tooltip. */}
      <div
        className={`stat-label text-text-muted uppercase leading-snug ${fitValue ? `mb-1.5 ${lg ? '' : 'text-[12px]'} font-bold tracking-wide truncate` : 'mb-2 text-xs sm:text-[13px] font-bold tracking-wide'}`}
        // lg: 14px where the tile has room, down to 12px on the narrow tiles of
        // a one-row 2xl layout, so "OUTSTANDING (₹)" is never cut.
        style={lg ? { fontSize: 'clamp(12px, 9.9cqi, 14px)' } : undefined}
        title={fitValue ? label : undefined}
      >
        {label}
      </div>

      {/*
        A figure that has not arrived yet is not the same as a figure that does
        not exist. Rendering the em-dash placeholder while a request is still in
        flight reads as "no data"; the shimmer reads as "not yet", and it is
        sized to the figure it replaces so the tile does not reflow on arrival.
      */}
      <div className={fitValue ? 'mb-1 [container-type:inline-size]' : 'mb-1.5'}>
        {loading
          ? <div className={`skeleton ${lg ? 'h-10 sm:h-11 lg:h-12' : 'h-9 sm:h-10 lg:h-11'} w-3/5`} aria-hidden="true" />
          : renderFormattedValue()}
      </div>

      <div className={`${lg ? 'text-[13px] sm:text-[15px]' : 'text-xs sm:text-[13px]'} text-text-secondary mt-auto pt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug`}>
        {momDisplay && (
          <span style={{ color: displayColor }} className={`${lg ? 'text-sm sm:text-[15px]' : 'text-sm sm:text-[13.5px]'} font-black tracking-wide whitespace-nowrap`}>
            {momDisplay}
          </span>
        )}
        <span className="font-semibold text-text-muted/90 leading-snug">{subtitle}</span>
      </div>
    </div>
  );
}

export default React.memo(KPICard);
