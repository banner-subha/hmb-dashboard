import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import CollapsibleCard from './CollapsibleCard';
import { formatMT } from '../../utils/formatters';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { staggerContainer, staggerItem } from '../../utils/motionVariants';
import { MapPin, Building2, Store, TrendingDown } from 'lucide-react';

const TYPE_META = {
  STATE: { icon: MapPin, label: 'State', colorClass: 'text-severity-critical', bgClass: 'bg-severity-critical/10', solidClass: 'bg-severity-critical' },
  DISTRICT: { icon: Building2, label: 'District', colorClass: 'text-orange-500', bgClass: 'bg-orange-500/10', solidClass: 'bg-orange-500' },
  DEALER: { icon: Store, label: 'Dealer', colorClass: 'text-amber-500', bgClass: 'bg-amber-500/10', solidClass: 'bg-amber-500' },
};

function buildDrivers(data) {
  const backend = data?.intel?.declineDrivers;
  if (Array.isArray(backend) && backend.length > 0) return backend.slice(0, 8);

  // Fallback (sample data / legacy payload): derive client-side with a
  // gross-decline denominator matching the backend definition.
  const gross = Math.max(1, (data?.states || []).reduce((sum, s) => sum + Math.max(0, (s.prev || 0) - (s.cur || 0)), 0));
  const rows = [];
  const push = (type, name, drop, nav) => {
    if (drop > 0) rows.push({ type, name, drop: Math.round(drop * 100) / 100, pctOfTotal: Math.min(100, Math.round((drop / gross) * 100)), nav });
  };
  (data?.states || []).forEach(s => {
    if (s.drop > 0) push('STATE', s.state, s.drop, { path: '/states', q: { state: s.state } });
  });
  (data?.districts || []).forEach(d => {
    if (d.drop > 0) push('DISTRICT', `${d.district}, ${d.state}`, d.drop, { path: '/districts', q: { state: d.state, district: d.district } });
  });
  (data?.dealers || []).forEach(dl => {
    if (dl.drop > 0) push('DEALER', `${dl.client} (${dl.district}, ${dl.state})`, dl.drop, { path: '/dealers', q: { state: dl.state, district: dl.district, search: dl.client } });
  });
  rows.sort((a, b) => b.drop - a.drop);
  return rows.slice(0, 8);
}

function navFor(driver) {
  if (driver.nav) return driver.nav;
  const parts = driver.name.split(', ');
  if (driver.type === 'STATE') return { path: '/states', q: { state: parts[0] } };
  if (driver.type === 'DISTRICT') return { path: '/districts', q: { state: parts[1], district: parts[0] } };
  const dealer = driver.name.replace(/\s*\(.*\)$/, '');
  const geo = (driver.name.match(/\(([^)]+)\)/) || [])[1]?.split(', ') || [];
  return { path: '/dealers', q: { state: geo[1], district: geo[0], search: dealer } };
}

function DeclineDriversCard({ data }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const drivers = useMemo(() => buildDrivers(data), [data]);
  const maxDrop = drivers.length > 0 ? drivers[0].drop : 1;
  const totalGross = useMemo(
    () => Math.max(1, (data?.states || []).reduce((sum, s) => sum + Math.max(0, (s.prev || 0) - (s.cur || 0)), 0)),
    [data]
  );

  if (!drivers.length) return null;

  return (
    <CollapsibleCard
      title="Decline Drivers"
      badge={
        <span className="text-xs font-mono font-bold px-3 py-0.5 rounded-full shadow-xs badge-theme-red">
          −{formatMT(totalGross)} MT
        </span>
      }
      accentColor="#ef4444"
    >
      <div className="py-0.5">
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-3">
          Largest volume losses this period
        </p>
        <div className="space-y-2" variants={reduceMotion ? undefined : staggerContainer} initial="initial" animate="animate">
          {drivers.map((drv, idx) => {
            const meta = TYPE_META[drv.type] || TYPE_META.STATE;
            const Icon = meta.icon;
            const nav = navFor(drv);
            return (
              <m.button
                key={`${drv.type}-${drv.name}-${idx}`}
                type="button"
                onClick={() => navigate(`${nav.path}?${new URLSearchParams(nav.q).toString()}`)}
                className="w-full text-left p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-severity-critical/40 transition-colors cursor-pointer shadow-xs group"
                variants={reduceMotion ? undefined : staggerItem}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`p-1.5 rounded-md shrink-0 ${meta.bgClass} ${meta.colorClass}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-sm text-text-primary font-medium truncate">{drv.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-bold font-mono ${meta.colorClass}`}>{drv.pctOfTotal}%</span>
                    <span className="flex items-center gap-1 text-[13px] sm:text-sm font-black font-mono text-text-primary">
                      <TrendingDown className="w-3.5 h-3.5 text-severity-critical" />
                      {formatMT(drv.drop)}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden border border-border/40 bg-bg-primary/80 shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${meta.solidClass}`}
                    style={{ width: `${Math.max(6, Math.round((drv.drop / maxDrop) * 100))}%` }}
                    title={`${drv.name}: ${formatMT(drv.drop)} MT (${drv.pctOfTotal}% of decline)`}
                  />
                </div>
              </m.button>
            );
          })}
        </div>
      </div>
    </CollapsibleCard>
  );
}

export default React.memo(DeclineDriversCard);
