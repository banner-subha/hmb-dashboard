import React from 'react';
import MoMIndicator from './MoMIndicator';
import { formatMT } from '../../utils/formatters';

export default function ProductInsightCard({ productInsights = [] }) {
  return (
    <div className="grid grid-cols-1 gap-4 w-full">
      {productInsights.map((insight, idx) => {
        const {
          product,
          label,
          cur_mt = 0,
          prev_mt = 0,
          mom_pct = 0,
          share_pct = 0,
          pending_qty = 0,
          trend = 'STABLE',
          primary_driver = '',
          recommended_action = ''
        } = insight;

        // Determine border and accent color based on mom_pct
        let borderColor = 'border-border/60';
        let accentColor = 'text-text-muted';
        let trendBg = 'bg-bg-card/40';

        if (mom_pct < -10) {
          borderColor = 'border-severity-critical/55';
          accentColor = 'text-severity-critical';
          trendBg = 'bg-severity-critical/10';
        } else if (mom_pct <= -5) {
          borderColor = 'border-severity-high/55';
          accentColor = 'text-severity-high';
          trendBg = 'bg-severity-high/10';
        } else if (mom_pct > 0) {
          borderColor = 'border-severity-none/55';
          accentColor = 'text-severity-none';
          trendBg = 'bg-severity-none/10';
        } else {
          borderColor = 'border-border/60';
          accentColor = 'text-text-muted';
          trendBg = 'bg-bg-card/60';
        }

        return (
          <div
            key={idx}
            className={`glass-card p-5 border ${borderColor} flex flex-col justify-between hover:scale-[1.01] transition-transform duration-200`}
          >
            {/* Header info */}
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-base font-extrabold text-text-primary tracking-tight">
                    {label}
                  </span>
                </div>
                {/* Trend Badge */}
                <span
                  className={`text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-md uppercase ${trendBg} ${accentColor}`}
                >
                  {trend}
                </span>
              </div>

              {/* MT and MoM Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/20">
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    Current (MT)
                  </span>
                  <span className="text-base font-extrabold text-text-primary mt-0.5">
                    {formatMT(cur_mt)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    MoM Trend
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <MoMIndicator cur={cur_mt} prev={prev_mt} />
                  </div>
                </div>
              </div>

              {/* Share & Pending */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/20">
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    Share %
                  </span>
                  <span className="text-sm font-extrabold text-text-secondary mt-0.5">
                    {share_pct}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    Pending (MT)
                  </span>
                  <span className="text-sm font-extrabold text-text-primary mt-0.5">
                    {formatMT(pending_qty)}
                  </span>
                </div>
              </div>

              {/* Primary Driver */}
              {primary_driver && (
                <div className="pt-3 border-t border-border/20">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1">
                    Primary Driver
                  </span>
                  <p className="text-[13px] text-text-secondary leading-relaxed font-medium">
                    {primary_driver}
                  </p>
                </div>
              )}
            </div>

            {/* Action / Recommended Action */}
            {recommended_action && (
              <div className="mt-5 pt-3 border-t border-border/20">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mb-1">
                  Recommended Action
                </span>
                <p className="text-[12px] text-text-secondary leading-relaxed font-semibold mb-3">
                  {recommended_action}
                </p>
                <button
                  type="button"
                  className="w-full py-1.5 rounded-lg bg-bg-secondary hover:bg-border border border-border/70 text-text-primary text-[11px] font-bold transition-all uppercase tracking-wider cursor-pointer"
                >
                  Initiate Action Plan
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
