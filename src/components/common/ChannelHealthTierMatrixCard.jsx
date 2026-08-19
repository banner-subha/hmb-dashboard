import React, { useMemo } from 'react';
import CollapsibleCard from './CollapsibleCard';
import { formatMT, formatPct } from '../../utils/formatters';
import { Users, ArrowRight, Award, TrendingUp, AlertOctagon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ChannelHealthTierMatrixCard({ dealers = [], totalVolume = 0 }) {
  const navigate = useNavigate();

  const matrix = useMemo(() => {
    if (!dealers || dealers.length === 0) {
      return {
        totalDealers: 0,
        activeDealers: 0,
        activeRate: 0,
        top5Share: 0,
        atRiskMT: 0,
        tiers: []
      };
    }

    const validDealers = [...dealers];
    const totalMT = totalVolume > 0 
      ? totalVolume 
      : validDealers.reduce((sum, d) => sum + (d.cur || 0), 0);

    const sortedByCur = [...validDealers].sort((a, b) => (b.cur || 0) - (a.cur || 0));
    const top5MT = sortedByCur.slice(0, 5).reduce((sum, d) => sum + (d.cur || 0), 0);
    const top5Share = totalMT > 0 ? (top5MT / totalMT) * 100 : 0;

    // Dynamic tier brackets adapting to dataset scale
    const maxCur = Math.max(...validDealers.map(d => d.cur || 0), 1);
    const t1Threshold = Math.max(50, maxCur * 0.4);
    const t2Threshold = Math.max(15, maxCur * 0.15);

    const t1Dealers = validDealers.filter(d => (d.cur || 0) >= t1Threshold);
    const t2Dealers = validDealers.filter(d => (d.cur || 0) >= t2Threshold && (d.cur || 0) < t1Threshold);
    const t3Dealers = validDealers.filter(d => (d.cur || 0) > 0 && (d.cur || 0) < t2Threshold);
    const inactDealers = validDealers.filter(d => (!d.cur || d.cur === 0) && (d.prev || 0) > 0);

    const calcTier = (list, name, color, badgeClass, icon) => {
      const vol = list.reduce((sum, d) => sum + (d.cur || 0), 0);
      const prevVol = list.reduce((sum, d) => sum + (d.prev || 0), 0);
      const share = totalMT > 0 ? (vol / totalMT) * 100 : 0;
      const count = list.length;
      return { name, vol, prevVol, share, count, color, badgeClass, icon };
    };

    const t1 = calcTier(
      t1Dealers, 
      'Tier 1 • Key Accounts', 
      '#10b981', 
      'badge-theme-green', 
      Award
    );
    const t2 = calcTier(
      t2Dealers, 
      'Tier 2 • Core Drivers', 
      '#3b82f6', 
      'badge-theme-blue', 
      TrendingUp
    );
    const t3 = calcTier(
      t3Dealers, 
      'Tier 3 • Retail / Micro', 
      '#8b5cf6', 
      'badge-theme-purple', 
      Users
    );

    const atRiskMT = inactDealers.reduce((sum, d) => sum + (d.prev || 0), 0);
    const inact = {
      name: 'At-Risk • Inactive Accounts',
      vol: 0,
      prevVol: atRiskMT,
      share: 0,
      count: inactDealers.length,
      color: '#ef4444',
      badgeClass: 'badge-theme-red',
      icon: AlertOctagon
    };

    const activeCount = t1.count + t2.count + t3.count;
    const activeRate = validDealers.length > 0 ? (activeCount / validDealers.length) * 100 : 0;

    return {
      totalDealers: validDealers.length,
      activeDealers: activeCount,
      activeRate,
      top5Share,
      atRiskMT,
      tiers: [t1, t2, t3, inact]
    };
  }, [dealers, totalVolume]);

  return (
    <CollapsibleCard
      title="Channel Health & Dealer Matrix"
      badge={
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 whitespace-nowrap shadow-xs badge-theme-green">
          {matrix.activeDealers} Active • {formatPct(matrix.activeRate)}
        </span>
      }
      accentColor="#10b981"
      fullHeight={true}
    >
      <div className="flex flex-col justify-between h-full space-y-4 py-0.5">
        
        {/* Tier Share Multi-Segment Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-text-muted">
            <span>Volume Share by Account Tier</span>
            <span className="text-text-primary font-mono font-bold">Top 5: {formatPct(matrix.top5Share)} Share</span>
          </div>

          <div className="h-3 rounded-full bg-bg-secondary overflow-hidden flex border border-border/40 p-0.5 gap-0.5">
            {matrix.tiers.filter(t => t.share > 0).map((tier, idx) => (
              <div 
                key={idx}
                className="h-full rounded-xs transition-all"
                style={{ 
                  width: `${Math.max(tier.share, 4)}%`, 
                  backgroundColor: tier.color 
                }}
                title={`${tier.name}: ${formatPct(tier.share)}`}
              />
            ))}
          </div>
        </div>

        {/* Account Tiers Breakdown */}
        <div className="space-y-2.5">
          {matrix.tiers.map((tier, idx) => {
            const Icon = tier.icon;
            const isInactive = tier.name.includes('Inactive');

            return (
              <div 
                key={idx}
                className="p-3 sm:p-3.5 bg-bg-secondary/70 rounded-xl border border-border/40 flex items-center justify-between gap-3 transition-colors hover:bg-bg-card shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-border/40"
                    style={{ backgroundColor: `${tier.color}15`, color: tier.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary truncate">{tier.name}</div>
                    <div className="text-xs text-text-muted font-medium">
                      {tier.count} Accounts • {isInactive ? `-${formatMT(tier.prevVol)} Lost MT` : `${formatPct(tier.share)} Total Vol`}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm sm:text-[14.5px] font-black font-mono text-text-primary">
                    {isInactive ? `${tier.count} Churned` : formatMT(tier.vol)}
                  </div>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md shadow-xs ${tier.badgeClass}`}>
                    {isInactive ? 'Intervention' : `${Math.round(tier.share)}% Share`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Deep-Link with Uniform Theme Pill Style */}
        <div className="pt-2.5 border-t border-border/40 flex justify-between items-center gap-2">
          <span className="text-[11px] sm:text-xs text-text-muted font-medium truncate min-w-0">
            {matrix.totalDealers} Network Accounts Analyzed
          </span>
          <button
            onClick={() => navigate('/dealers')}
            className="btn-pill-action shrink-0"
          >
            <span>Dealer Intelligence</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

      </div>
    </CollapsibleCard>
  );
}
