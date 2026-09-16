import { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, User } from 'lucide-react';
import { formatMT } from '../../utils/formatters';
import {
  quadrantConfig,
  isUnlinked,
  comparableAvg,
  accentBucket,
  getDynamicProgressColor,
} from '../../utils/visits';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

/**
 * Dealer scorecard. Escape and backdrop close it; the old version had neither.
 *
 * Rendered through a portal onto document.body. `position: fixed` is resolved
 * against the nearest ancestor that has a transform, a filter, or layout
 * containment — and this page sits inside two of those: the layout's scroll
 * container carries `transform: translateZ(0)`, and AnimatedPage applies a
 * transform of its own while it fades in. In the tree, `inset-0` therefore
 * covered the scrolling panel rather than the viewport, and the dialog opened
 * squashed against the cards near the top of the page instead of centred over
 * the screen. A portal is the only reliable way out of a transformed ancestor.
 */
function DealerScorecardModal({ dealer, onClose }) {
  useBodyScrollLock(Boolean(dealer));

  useEffect(() => {
    if (!dealer) return undefined;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dealer, onClose]);

  if (!dealer) return null;

  const cfg = quadrantConfig(dealer.quadrant);
  const unlinked = isUnlinked(dealer);

  // Same figures, same colour scale as the Sales vs BP Target column on both
  // tables. The tile used to show the pace verdict as a word, which is the one
  // thing the row behind it no longer says — opening a dealer reading 31% of
  // plan and being told "BEHIND" dropped the number the card was opened for.
  const salesActual = dealer.salesActual ?? dealer.salesCur ?? 0;
  const salesTarget = dealer.salesTarget ?? dealer.bpTarget;
  const pct = dealer.salesAchievedPct;
  const hasTarget = salesTarget != null && salesTarget > 0;
  const dynamic = getDynamicProgressColor(pct);
  const barWidth = hasTarget && pct != null ? Math.max(0, Math.min(100, pct)) : 0;
  const usual = comparableAvg(dealer);
  const cur = dealer.curVisits ?? 0;
  const diff = cur - usual;
  const geo = dealer.district
    ? `${dealer.district}, ${dealer.state}`
    : (dealer.state || 'Location not recorded');

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative animate-fade-in max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Scorecard for ${dealer.dealer}`}
      >
        <button
          onClick={onClose}
          aria-label="Close scorecard"
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted hover:text-text-primary cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div>
          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12.5px] font-bold mb-2.5"
            data-accent={accentBucket(cfg.color)}
            style={{ backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}
          >
            {cfg.label}
          </span>
          <h3 className="text-2xl font-black text-text-primary leading-tight pr-10">{dealer.dealer}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-[13px] text-text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {geo}
            </span>
            {dealer.assignedKrm && (
              <span data-role="KRM" className="role-tag inline-flex items-center gap-1 px-2 py-0.5 text-[12px]">
                <span className="text-[10px] font-extrabold uppercase">KRM:</span> {dealer.assignedKrm}
              </span>
            )}
            {dealer.assignedKro && (
              <span data-role="KRO" className="role-tag inline-flex items-center gap-1 px-2 py-0.5 text-[12px]">
                <span className="text-[10px] font-extrabold uppercase">KRO:</span> {dealer.assignedKro}
              </span>
            )}
            {!dealer.assignedKrm && !dealer.assignedKro && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> {dealer.primaryRep || 'No executive assigned'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 bg-bg-secondary/60 rounded-xl border border-border/30">
            <span className="text-[12.5px] font-bold text-text-muted block mb-1">Visits This Month</span>
            <span className="text-3xl font-black text-text-primary leading-none">{cur}</span>
            {/* Both averages, labelled. The comparable one drives the group;
                the whole-month one answers "how many in a typical month". */}
            <span className="text-[12.5px] text-text-secondary block mt-2 font-semibold">
              {diff === 0
                ? 'On pace with MTD benchmark'
                : `${diff > 0 ? '+' : ''}${diff} vs MTD benchmark (${usual})`}
            </span>
            <span className="text-[12px] text-text-muted block mt-1">
              Full month benchmark: {dealer.histAvgVisits != null ? Math.round(dealer.histAvgVisits) : '—'} visits
            </span>
          </div>
          <div className="p-3.5 bg-bg-secondary/60 rounded-xl border border-border/30">
            <span className="text-[12.5px] font-bold text-text-muted block mb-1">Sales vs BP Target</span>

            {unlinked ? (
              <>
                <span className="text-2xl font-black leading-none text-text-muted">—</span>
                <span className="text-[13px] block mt-2 font-semibold">
                  {dealer.bpPotential > 0 ? (
                    <span className="text-amber-400">
                      Unbilled prospect ({formatMT(dealer.bpPotential, 1)} market potential)
                    </span>
                  ) : dealer.historicalQty > 0 ? (
                    <span className="text-sky-400">
                      Dormant customer ({formatMT(dealer.historicalQty, 1)} historical billing, last {dealer.lastOrderDate || ''})
                    </span>
                  ) : (
                    <span className="text-text-secondary">
                      Unbilled prospect account (0 invoices on record)
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-2xl font-black leading-none tabular-nums text-text-primary">
                    {formatMT(salesActual, 1)}
                  </span>
                  {hasTarget ? (
                    <span className="inline-flex items-baseline gap-1 text-[15px] font-bold whitespace-nowrap">
                      <span className="text-text-muted font-normal">/</span>
                      <span className="text-text-primary font-bold">{formatMT(salesTarget, 1)}</span>
                    </span>
                  ) : (
                    <span className="text-[12.5px] font-medium text-text-muted italic">
                      (No plan target)
                    </span>
                  )}
                </div>

                {hasTarget ? (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-2.5 w-28 rounded-full bg-bg-secondary/90 overflow-hidden border border-border/40 p-[1px] shrink-0">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: dynamic.color,
                          boxShadow: dynamic.glow,
                        }}
                      />
                    </div>
                    <span
                      className="text-[12px] font-black tabular-nums whitespace-nowrap leading-none"
                      style={{ color: dynamic.color }}
                    >
                      {pct != null ? `${Number(pct).toFixed(1)}%` : '0.0%'}
                    </span>
                  </div>
                ) : (
                  <span className="text-[12px] text-text-muted italic block mt-2">Unbudgeted</span>
                )}

                <span className="text-[12px] text-text-muted block mt-1">
                  Shipping {dealer.currentDailyRate ? formatMT(dealer.currentDailyRate, 1) : formatMT(0, 1)} per day now
                </span>
              </>
            )}

            <span className="text-[12px] text-text-muted block mt-1">
              Average visit length: {dealer.avgDurationMins ?? 0} min
            </span>
          </div>
        </div>

        {((dealer.krmVisits && dealer.krmVisits.length > 0) || (dealer.kroVisits && dealer.kroVisits.length > 0) || (dealer.otherVisits && dealer.otherVisits.length > 0)) && (
          <div className="p-3.5 bg-bg-secondary/40 rounded-xl border border-border/30 space-y-2">
            <span className="text-[12px] font-bold text-text-muted block uppercase tracking-wider">
              Field Executives Who Visited This Month
            </span>
            <div className="flex flex-wrap gap-2">
              {dealer.krmVisits?.map((k, idx) => (
                <span key={`krm-modal-${idx}`} data-role="KRM" className="role-tag inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px]">
                  <span className="font-extrabold text-[10px] uppercase tracking-wide">KRM</span>
                  <span>{k.name}</span>
                  <span className="font-bold text-amber-400">({k.visits} {k.visits === 1 ? 'visit' : 'visits'})</span>
                </span>
              ))}
              {dealer.kroVisits?.map((k, idx) => (
                <span key={`kro-modal-${idx}`} data-role="KRO" className="role-tag inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px]">
                  <span className="font-extrabold text-[10px] uppercase tracking-wide">KRO</span>
                  <span>{k.name}</span>
                  <span className="font-bold text-sky-400">({k.visits} {k.visits === 1 ? 'visit' : 'visits'})</span>
                </span>
              ))}
              {dealer.otherVisits?.map((k, idx) => (
                <span key={`oth-modal-${idx}`} data-role="REP" className="role-tag inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px]">
                  <span className="font-extrabold text-[10px] uppercase tracking-wide">REP</span>
                  <span>{k.name}</span>
                  <span className="font-bold text-slate-400">({k.visits} {k.visits === 1 ? 'visit' : 'visits'})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 bg-bg-secondary/40 rounded-xl border border-border/30 space-y-2">
          <div className="text-[13px] font-black text-text-primary uppercase tracking-wide">Next Step</div>
          <p className="text-sm text-text-secondary leading-relaxed">{cfg.action}</p>
          <p className="text-[13px] text-text-muted leading-relaxed">{cfg.description}</p>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-accent-blue text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default memo(DealerScorecardModal);
