import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ArrowRight, Target, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import CollapsibleCard from './CollapsibleCard';
import SkeletonLoader from './SkeletonLoader';
import {
  achievementTone,
  formatMT1,
  formatMT1Bare,
  formatPct1,
  formatMonthLabel,
} from '../../utils/businessPlan';

/** How many states the card lists before handing off to the Business Plan tab.
 *  Five matches the other ranked cards on this page. */
const VISIBLE_ROWS = 5;

/**
 * A bar that stops at 100% while the figure beside it keeps reporting the real
 * number, so 140% achievement reads as 140% rather than as a full bar.
 *
 * The track is `bg-bg-card` rather than `bg-bg-secondary`: the row it sits on
 * is already `bg-bg-secondary`, so the old track was the same colour as its
 * own background and an empty bar was invisible.
 */
function AchievementBar({ pct, color }) {
  const width = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <span className="block h-2 w-full rounded-full bg-bg-card border border-border/50 overflow-hidden">
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </span>
  );
}

/**
 * One figure in the summary row, built to the same spec as the tiles on
 * PaceTrackerCard: rounded-xl on a raised surface, icon beside a small caps
 * label, the figure large with its unit trailing small, and a note underneath.
 *
 * Sized by container query rather than by breakpoint, because the viewport does
 * not tell you how wide this card is. It sits in a 5-of-12 column, so the row is
 * ~660px on a 1920px screen but only ~250px at 1024px — and below lg the page
 * collapses to one column and it is wide again. Keying off the viewport made the
 * roomiest case and the tightest case ask for the same size; keying off the row
 * lets each tile spend exactly the width it actually has.
 *
 * The breakpoints are the measured row widths, not the generic container sizes:
 * 250px at a 1024px viewport (the pinch), 313px on a 375px phone, 357px at
 * 1280px, 624px at 1920px, ~714px below lg. The generic @xs is 320px, which the
 * phone case misses by 7px, so the ladder is written out in pixels instead.
 *
 * The compact base is that 250px case, where three tiles get ~69px of text room
 * and only a 12px figure fits. Everything above it is progressive enrichment.
 */
function KpiTile({ icon: Icon, iconClass, label, value, valueClass = '', color, tint, note }) {
  return (
    <div
      className={`rounded-lg @min-[300px]:rounded-xl p-1 @min-[300px]:p-2 @min-[340px]:p-2.5 @min-[440px]:p-3 @min-[560px]:p-3.5 min-w-0 shadow-xs flex flex-col justify-between ${
        tint || 'bg-bg-secondary/80 border border-border/60'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0 text-[9px] @min-[300px]:text-[10px] @min-[440px]:text-xs font-bold text-text-muted uppercase tracking-wide">
        <Icon className={`hidden @min-[440px]:inline-block w-4 h-4 shrink-0 ${iconClass || ''}`} />
        <span className="leading-tight truncate">{label}</span>
      </div>

      <div
        className={`mt-1 @min-[440px]:mt-2 font-black tabular-nums tracking-tight leading-none truncate text-xs @min-[300px]:text-sm @min-[340px]:text-base @min-[440px]:text-xl @min-[560px]:text-2xl ${valueClass}`}
        style={color ? { color } : undefined}
      >
        {formatMT1Bare(value)}
        <span className="text-[8px] @min-[300px]:text-[10px] @min-[440px]:text-xs font-bold text-text-muted ml-px @min-[300px]:ml-1">MT</span>
      </div>

      {/* Hidden at the 250px width, where there is no room for a third line. */}
      <div className="hidden @min-[300px]:block text-[10px] @min-[440px]:text-[11px] text-text-muted font-medium mt-1 @min-[440px]:mt-1.5 leading-snug truncate">
        {note}
      </div>
    </div>
  );
}

/**
 * Where the month stands against the Business Plan, by state.
 *
 * Ordered by shortfall rather than by size, so the states that need a decision
 * are the ones on screen. The full ranking, every other grouping and the
 * filters all live on the Business Plan tab; this is the executive read of it.
 *
 * The plan month is printed in the badge rather than assumed to match the
 * despatch cycle above it. The two genuinely can differ, and a reader who
 * assumes they match would compare the wrong pair of numbers.
 */
function TargetVsActualCard({ month, states, totals, loading, error }) {
  const navigate = useNavigate();

  const worst = useMemo(
    () =>
      [...(states || [])]
        .filter((s) => s.spTarget > 0)
        .sort((a, b) => a.variance - b.variance)
        .slice(0, VISIBLE_ROWS),
    [states]
  );

  const tone = achievementTone(totals?.achievementPct ?? null);

  // Both counts are over states that actually carry a target. A state with no
  // plan is neither behind nor ahead, and counting it in the denominator would
  // understate how much of the planned base is short.
  const planned = (states || []).filter((s) => s.spTarget > 0);
  const plannedCount = planned.length;
  const behindCount = planned.filter(
    (s) => s.achievementPct !== null && s.achievementPct < 100
  ).length;

  const body = () => {
    if (loading) {
      return (
        <div className="space-y-2.5">
          <SkeletonLoader variant="table-row" count={5} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-sm text-text-muted py-6 text-center font-medium">
          Target figures could not be loaded. The despatch numbers above are unaffected.
        </div>
      );
    }

    if (!totals || !worst.length) {
      return (
        <div className="text-sm text-text-muted py-6 text-center font-medium">
          No business plan has been published for this month yet.
        </div>
      );
    }

    return (
      <div className="space-y-3.5 py-0.5">
        {/*
          Three tiles matching the PaceTrackerCard stat row. `@container` is what
          makes that possible at every width: the tiles measure this row, not the
          window, so the same markup can be a full-size stat block at 660px and
          still fit the ~69px of text room it gets at a 1024px viewport.

          The gap tile is tinted rather than only coloured, because once the
          three sit side by side, colour alone stopped reading as "this is the
          one to act on". The tint uses the badge classes rather than colour
          utilities: there is no green in the token ramp (`bg-accent-green`
          resolves to nothing), and these carry their own [data-theme="light"]
          override for the fill and hairline.

          The figure keeps a plain inline hex. In dark that is the #ef4444 it has
          always been; in light the LIGHT THEME — CONTRAST HARDENING block at the
          end of index.css remaps that hue by attribute selector to
          rgb(164, 23, 42) (7.1 : 1). The legible light red is that remap doing
          its job, not this class — which is why the hex stays inline and plain
          rather than moving into the className.
        */}
        <div className="@container">
          <div className="grid grid-cols-3 gap-1.5 @min-[300px]:gap-2 @min-[440px]:gap-3 @min-[560px]:gap-3.5">
            <KpiTile
              icon={Target}
              iconClass="text-accent-sky"
              label="Target"
              value={totals.spTarget}
              valueClass="text-text-secondary"
              note={`${plannedCount} states planned`}
            />
            <KpiTile
              icon={Receipt}
              iconClass="text-accent-blue"
              label="Invoiced"
              value={totals.actual}
              valueClass="text-text-primary"
              note={`${formatPct1(totals.achievementPct)} of target`}
            />
            <KpiTile
              icon={totals.variance < 0 ? TrendingDown : TrendingUp}
              // The label states the direction, so the figure drops its sign
              // rather than reading "-8,870.3".
              label={totals.variance < 0 ? 'Short by' : 'Ahead by'}
              value={Math.abs(totals.variance)}
              color={totals.variance < 0 ? '#ef4444' : '#22c55e'}
              tint={totals.variance < 0 ? 'badge-theme-red' : 'badge-theme-green'}
              note={`${behindCount} of ${plannedCount} behind`}
            />
          </div>
        </div>

        {/* The list below is sorted by shortfall, which is not self-evident.
            The states-behind count moved into the gap tile above rather than
            being printed twice. */}
        <div className="text-[12.5px] font-semibold text-text-secondary">
          Largest shortfall first
        </div>

        <div className="space-y-2">
          {worst.map((s) => {
            const rowTone = achievementTone(s.achievementPct);
            return (
              <div
                key={s.key || s.label}
                role="button"
                tabIndex={0}
                onClick={() => navigate('/business-plan')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate('/business-plan');
                  }
                }}
                className="group flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-bg-secondary/60 hover:bg-bg-card border border-border/40 hover:border-accent-blue/40 transition-all cursor-pointer shadow-xs gap-2.5 focus-visible:outline-accent-blue"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] sm:text-base font-bold text-text-primary truncate group-hover:text-accent-blue transition-colors leading-snug">
                    {s.label}
                  </div>
                  {/* Secondary, not muted: this pair is the evidence behind the
                      percentage, so it has to stay readable. The unit rides on
                      the second figure only — carrying it twice truncated the
                      line on a phone and read as noise everywhere else. */}
                  <div className="text-[13px] text-text-secondary font-semibold mt-1 truncate font-mono tabular-nums">
                    {formatMT1Bare(s.actual)} of {formatMT1(s.spTarget)}
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="flex flex-col gap-1.5 min-w-[80px] sm:min-w-[96px]">
                    <span
                      className="text-base sm:text-[17px] font-black tabular-nums text-right leading-none"
                      style={{ color: rowTone.color }}
                    >
                      {formatPct1(s.achievementPct)}
                    </span>
                    <AchievementBar pct={s.achievementPct} color={rowTone.color} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-blue transition-transform group-hover:translate-x-0.5 shrink-0" />
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-border/40">
          <button
            onClick={() => navigate('/business-plan')}
            className="w-full py-2.5 px-3 rounded-lg bg-bg-secondary hover:bg-bg-card border border-border/60 hover:border-accent-blue/50 text-sm font-bold text-accent-blue hover:text-accent-blue/80 flex items-center justify-center gap-2 transition-all cursor-pointer group shadow-xs leading-snug"
          >
            <span>Open Business Plan</span>
            <ArrowRight className="w-4 h-4 text-accent-blue transition-transform group-hover:translate-x-1 shrink-0" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <CollapsibleCard
      title="Target vs Invoiced by State"
      accentColor={tone.color}
      badge={
        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold shadow-xs badge-theme-blue">
          <Target className="w-3.5 h-3.5" />
          {/* While the request is in flight the month is simply not known yet.
              Saying "No plan month" here would assert an absence the card has
              not established. */}
          <span>{month ? `Plan ${formatMonthLabel(month)}` : loading ? 'Loading plan' : 'No plan month'}</span>
        </div>
      }
    >
      {body()}
    </CollapsibleCard>
  );
}

export default React.memo(TargetVsActualCard);
