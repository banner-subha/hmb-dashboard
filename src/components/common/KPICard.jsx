export default function KPICard({ label, value, subtitle, momDisplay, momColor, accentColor = '#3b82f6' }) {
  const displayColor = momColor || '#94a3b8';

  return (
    <div
      className="glass-card-hover p-5 sm:p-6 flex flex-col justify-between"
      style={{ borderTopWidth: '3px', borderTopColor: accentColor,
        background: `linear-gradient(135deg, rgba(13,21,38,0.95), rgba(13,21,38,0.88))` }}
    >
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
