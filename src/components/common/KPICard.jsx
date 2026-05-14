export default function KPICard({ label, value, subtitle, momDisplay, momColor, accentColor = '#3b82f6' }) {
  // Graceful fallback: if momColor is missing, use neutral grey
  const displayColor = momColor || '#94a3b8';

  return (
    <div
      className="glass-card-hover p-4 sm:p-5 flex flex-col justify-between"
      style={{ borderTopWidth: '3px', borderTopColor: accentColor }}
    >
      <div className="text-[10px] sm:text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
        {label}
      </div>

      <div className="kpi-value text-xl sm:text-3xl mb-1 truncate">
        {value}
      </div>

      <div className="text-[10px] sm:text-xs text-text-secondary mt-1 flex items-center gap-1.5 truncate">
        {momDisplay && (
          <span style={{ color: displayColor }} className="font-bold whitespace-nowrap">
            {momDisplay}
          </span>
        )}
        <span className="truncate">{subtitle}</span>
      </div>
    </div>
  );
}