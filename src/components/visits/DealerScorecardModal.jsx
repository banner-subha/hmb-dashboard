import { memo, useEffect } from 'react';
import { X } from 'lucide-react';
import { formatMT } from '../../utils/formatters';
import { paceDisplay, quadrantConfig, isUnlinked } from '../../utils/visits';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

/** Dealer scorecard. Escape and backdrop close it; the old version had neither. */
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
  const geo = dealer.district
    ? `${dealer.district}, ${dealer.state}`
    : (dealer.state || 'Location not recorded');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-bg-card border border-border rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative animate-fade-in max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Scorecard for ${dealer.dealer}`}
      >
        <button
          onClick={onClose}
          aria-label="Close scorecard"
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted hover:text-text-primary"
        >
          <X className="w-4 h-4" />
        </button>

        <div>
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold mb-2"
            style={{ backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}
          >
            {cfg.label}
          </span>
          <h3 className="text-xl font-black text-text-primary leading-tight pr-10">{dealer.dealer}</h3>
          <p className="text-xs text-text-muted mt-0.5">
            {geo} · Assigned Executive: {dealer.primaryRep || 'Unassigned'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-bg-secondary/60 rounded-xl border border-border/30">
            <span className="text-[10.5px] font-bold text-text-muted block">Visits Completed This Month</span>
            <span className="text-2xl font-black text-text-primary">{dealer.curVisits ?? 0}</span>
            {/* Both averages, labelled. The comparable one drives the category;
                the whole-month one answers "how many in a typical month". */}
            <span className="text-[10px] text-text-muted block mt-0.5">
              Typical month: {dealer.histAvgVisits ?? '—'} visits
            </span>
            <span className="text-[10px] text-text-muted block">
              Same period, past 6 months: {dealer.histAvgVisitsMtd ?? '—'} visits
            </span>
          </div>
          <div className="p-3 bg-bg-secondary/60 rounded-xl border border-border/30">
            <span className="text-[10.5px] font-bold text-text-muted block">Sales Target Status</span>
            <span className={`text-2xl font-black ${pace.text}`}>{pace.label}</span>
            <span className="text-[10px] text-text-muted block mt-0.5">
              {unlinked
                ? 'Not linked to a sales account'
                : `Current rate: ${dealer.currentDailyRate ? `${formatMT(dealer.currentDailyRate)}/day` : formatMT(0)}`}
            </span>
          </div>
        </div>

        <div className="p-4 bg-bg-secondary/40 rounded-xl border border-border/30 text-xs text-text-muted space-y-1.5">
          <div className="font-bold text-text-primary">Recommended action</div>
          <p className="leading-relaxed">{cfg.description}</p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-bold hover:bg-accent/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(DealerScorecardModal);
