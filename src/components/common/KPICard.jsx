import { formatMoM, getMoMInfo } from '../../utils/formatters';

export default function KPICard({ label, value, momPct, subtitle, accentColor = '#3b82f6' }) {
  const mom = getMoMInfo(momPct);
  
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
        {momPct !== undefined && momPct !== null && (
          <span style={{ color: mom.color }} className="font-bold whitespace-nowrap">
            {mom.arrow} {Math.abs(momPct).toFixed(1)}%
          </span>
        )}
        <span className="truncate">{subtitle}</span>
      </div>
    </div>
  );
}
