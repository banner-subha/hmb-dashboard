import { memo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, User } from 'lucide-react';
import { formatMT } from '../../utils/formatters';
import { paceDisplay, quadrantConfig, isUnlinked, comparableAvg } from '../../utils/visits';
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
  const pace = paceDisplay(dealer);
  const unlinked = isUnlinked(dealer);
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
            style={{ backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}
          >
            {cfg.label}
          </span>
          <h3 className="text-2xl font-black text-text-primary leading-tight pr-10">{dealer.dealer}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[13px] text-text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {geo}
            </span>
            <span className="inline-flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> {dealer.primaryRep || 'No executive assigned'}
            </span>
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
                ? 'Same as normal by this date'
                : `${diff > 0 ? '+' : ''}${diff} vs the normal ${usual} by this date`}
            </span>
            <span className="text-[12px] text-text-muted block mt-1">
              Normal full month: {dealer.histAvgVisits ?? '—'} visits
            </span>
          </div>
          <div className="p-3.5 bg-bg-secondary/60 rounded-xl border border-border/30">
            <span className="text-[12.5px] font-bold text-text-muted block mb-1">Sales vs Target</span>
            <span className={`text-2xl font-black leading-none ${pace.text}`}>{pace.label}</span>
            <span className="text-[12.5px] text-text-secondary block mt-2 font-semibold">
              {unlinked
                ? 'Never invoiced — no target to measure against'
                : `Shipping ${dealer.currentDailyRate ? `${formatMT(dealer.currentDailyRate)}/day` : formatMT(0)} per day now`}
            </span>
            <span className="text-[12px] text-text-muted block mt-1">
              Average visit length: {dealer.avgDurationMins ?? 0} min
            </span>
          </div>
        </div>

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
