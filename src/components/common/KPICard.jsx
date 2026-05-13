import { getMoMInfo } from '../../utils/formatters';

export default function KPICard({ label, value, momPct, subtitle, accentColor = '#3b82f6' }) {
  const val = parseFloat(momPct);

  let color = '#94a3b8';
  let arrow = '';

  if (!isNaN(val)) {
    if (val > 0) {
      color = '#22c55e';
      arrow = '↑';
    } else if (val < 0) {
      color = '#ef4444';
      arrow = '↓';
    }
  }

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
        {momPct !== undefined && momPct !== null && !isNaN(val) && (
          <span style={{ color }} className="font-bold whitespace-nowrap">
            {arrow && <span className="mr-0.5">{arrow}</span>}{val.toFixed(1)}%
          </span>
        )}
        <span className="truncate">{subtitle}</span>
      </div>
    </div>
  );
}