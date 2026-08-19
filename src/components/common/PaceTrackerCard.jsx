import React, { useMemo } from 'react';
import CollapsibleCard from './CollapsibleCard';
import { formatMT, formatNumber } from '../../utils/formatters';
import { TrendingUp, TrendingDown, Target, Zap, Calendar, ArrowUpRight } from 'lucide-react';

export default function PaceTrackerCard({ data, rawData }) {
  if (!data) return null;

  const totalCur = data.totalCur || 0;
  
  // Calculate accurate calendar cycle days
  const now = new Date();
  const calendarDay = now.getDate() || 14;
  const daysInMonth = (rawData?.meta?.daysInCurMonth) || new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() || 31;
  const daysElapsed = (rawData?.meta?.curElapsedDays && rawData.meta.curElapsedDays > 0) 
    ? rawData.meta.curElapsedDays 
    : calendarDay;
  const daysRemaining = Math.max(1, daysInMonth - daysElapsed);

  // Calculate daily rates
  const currentDailyRate = data.currentDailyRate || (daysElapsed > 0 ? (totalCur / daysElapsed) : 0);
  const targetDailyRate = data.dailyAvgQty || (rawData?.meta?.targetDailyRate) || (data.operationalContext?.overall_performance?.daily_avg_qty) || 712.63;

  // Predict full-month target from historical months / daily average pace
  const predictedMonthTarget = useMemo(() => {
    if (data.expectedMtd && data.expectedMtd > 0) return data.expectedMtd;
    if (data.predicted_full_month_target_mt && data.predicted_full_month_target_mt > 0) return data.predicted_full_month_target_mt;
    if (data.targetTotal && data.targetTotal > 0) return data.targetTotal;
    if (rawData?.meta?.expectedMtd && rawData.meta.expectedMtd > 0) return rawData.meta.expectedMtd;

    const pastMonths = Object.entries(rawData?.monthlyHistory || {})
      .filter(([k]) => k !== '2026-08')
      .map(([, v]) => (v.states || []).reduce((sum, s) => sum + (s.cur || s.qty || 0), 0))
      .filter(v => v > 1000);

    if (pastMonths.length > 0) {
      const recentMonths = pastMonths.slice(-3);
      const avg = recentMonths.reduce((a, b) => a + b, 0) / recentMonths.length;
      if (avg > 0) return Math.round(avg * 100) / 100;
    }

    return Math.round(targetDailyRate * daysInMonth * 100) / 100;
  }, [data, rawData, targetDailyRate, daysInMonth]);

  // Target deficit & required run rate to hit monthly goal
  const remainingVolume = Math.max(0, predictedMonthTarget - totalCur);
  const requiredDailyRunRate = daysRemaining > 0 ? Math.round((remainingVolume / daysRemaining) * 10) / 10 : 0;

  // Pace health calculation
  const paceRatio = targetDailyRate > 0 ? (currentDailyRate / targetDailyRate) : 1;
  let statusText = 'On Track';
  let statusBg = 'badge-theme-green';
  let statusIcon = <TrendingUp className="w-3.5 h-3.5" />;
  
  if (paceRatio < 0.75) {
    statusText = 'Serious Shortfall';
    statusBg = 'badge-theme-red';
    statusIcon = <TrendingDown className="w-3.5 h-3.5" />;
  } else if (paceRatio < 0.95) {
    statusText = 'Falling Behind';
    statusBg = 'badge-theme-amber';
    statusIcon = <TrendingDown className="w-3.5 h-3.5" />;
  }

  // Progress toward predicted full month target
  const progressPct = predictedMonthTarget > 0 ? Math.min(100, Math.round((totalCur / predictedMonthTarget) * 100)) : 0;
  const paceDelta = Math.round((currentDailyRate - targetDailyRate) * 10) / 10;

  return (
    <CollapsibleCard 
      title="Today's Dispatch Pace" 
      badge={
        <div className={`flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold shadow-xs ${statusBg}`}>
          {statusIcon}
          <span>{statusText}</span>
        </div>
      }
      accentColor="#06b6d4"
    >
      <div className="space-y-3.5 py-0.5">
        
        {/* Top 2 Metric Comparison Blocks */}
        <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
          <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-text-muted uppercase tracking-wider truncate">
              <Zap className="w-4 h-4 text-accent-blue shrink-0" />
              <span className="truncate">Shipping Per Day (Now)</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-text-primary tracking-tight leading-none mt-2">
              {formatNumber(Math.round(currentDailyRate * 10) / 10)} <span className="text-xs font-bold text-text-muted">MT/day</span>
            </div>
            <div className="text-[11px] text-text-muted font-medium mt-1.5 truncate">
              {daysElapsed} days into this month
            </div>
          </div>

          <div className="p-3 sm:p-3.5 rounded-xl bg-bg-secondary/80 border border-border/60 shadow-xs flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-text-muted uppercase tracking-wider truncate">
              <Target className="w-4 h-4 text-accent-sky shrink-0" />
              <span className="truncate">Daily Target Dispatch</span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-text-primary tracking-tight leading-none mt-2">
              {formatNumber(Math.round(targetDailyRate * 10) / 10)} <span className="text-xs font-bold text-text-muted">MT/day</span>
            </div>
            <div className="text-[11px] text-text-muted font-medium mt-1.5 truncate">
              Based on last 3 months
            </div>
          </div>
        </div>

        {/* Cleanly Aligned MTD Progress Bar Block */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-bg-secondary/60 border border-border/50 space-y-2.5 shadow-xs">
          {/* Header Row: Title & Progress Percentage Badge */}
          <div className="flex justify-between items-center">
            <span className="text-xs sm:text-sm font-bold text-text-primary uppercase tracking-wide">This Month's Target</span>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-black font-mono shadow-xs badge-theme-blue">
              {progressPct}% Done
            </span>
          </div>

          {/* Value Row: Despatched vs Target */}
          <div className="flex justify-between items-baseline pt-0.5">
            <div className="space-y-0.5">
              <div className="text-[11px] font-semibold text-text-muted uppercase">Shipped So Far</div>
              <div className="text-base sm:text-lg font-black text-text-primary font-mono">{formatMT(totalCur)}</div>
            </div>
            <div className="text-right space-y-0.5">
              <div className="text-[11px] font-semibold text-text-muted uppercase">Month Target</div>
              <div className="text-base sm:text-lg font-black text-text-secondary font-mono">{formatMT(predictedMonthTarget)}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 sm:h-3 rounded-full bg-bg-primary/80 overflow-hidden border border-border/60 p-0.5">
            <div 
              className="h-full rounded-full transition-all duration-500 shadow-sm" 
              style={{ 
                width: `${Math.max(5, progressPct)}%`,
                background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)'
              }} 
            />
          </div>

          {/* Sub-row: Cycle Day & Pace Delta */}
          <div className="flex justify-between items-center text-xs font-medium text-text-muted pt-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              <span>Day <strong className="text-text-primary">Day {daysElapsed}</strong> of {daysInMonth} this month</span>
            </span>
            <span className={`font-bold ${paceDelta >= 0 ? 'text-severity-none' : 'text-severity-critical'}`}>
              {paceDelta >= 0 ? `+${paceDelta}` : paceDelta} MT/day {paceDelta >= 0 ? 'ahead of target' : 'behind target'}
            </span>
          </div>
        </div>

        {/* Required Run Rate Box */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-bg-secondary/50 border border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent-blue/10 text-accent-blue shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Daily Rate Needed</div>
              <div className="text-base sm:text-lg font-black text-text-primary mt-0.5 leading-tight">
                {formatNumber(requiredDailyRunRate)} <span className="text-xs font-bold text-text-muted">MT/day</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Remaining Volume</div>
            <div className="text-base sm:text-lg font-black text-text-primary font-mono mt-0.5 leading-tight">
              {formatMT(remainingVolume)}
            </div>
            <div className="text-[11px] font-medium text-text-muted mt-0.5">
              {daysRemaining} days left
            </div>
          </div>
        </div>

      </div>
    </CollapsibleCard>
  );
}
