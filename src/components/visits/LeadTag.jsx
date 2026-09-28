import { formatDayLabel } from '../../utils/formatters';

/**
 * "New lead" tag: the dealer or fabricator had a visit_type 'new lead' visit
 * in the period shown. Uppercase like the role tags beside it.
 */
export default function LeadTag({ visits = 1, first = null }) {
  const title = [
    first ? `Visited as a new lead on ${formatDayLabel(first)}` : 'Visited as a new lead in this period',
    visits > 1 ? `${visits} new-lead visits` : null,
  ].filter(Boolean).join(' · ');
  return (
    <span className="lead-tag px-1.5 py-0.5 text-[10px] uppercase tracking-wide" title={title}>
      New lead
    </span>
  );
}

/**
 * "New leads only" filter button, with the number of new leads in the list it
 * filters. New leads are usually a first visit, so in a list ordered by visits
 * they sit at the bottom; this brings them to the top of the view.
 */
export function LeadsToggle({ on, count, onChange }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-1.5 min-h-11 md:min-h-0 px-3 py-2 rounded-xl border text-[12.5px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
        on
          ? 'bg-accent-blue border-accent-blue text-white shadow-sm'
          : 'bg-bg-secondary/60 border-border/40 text-text-secondary hover:text-text-primary hover:bg-bg-card'
      }`}
    >
      New leads only
      <span className={`px-1.5 py-0.5 rounded-md text-[11px] tabular-nums ${on ? 'bg-white/25 text-white' : 'bg-bg-card text-text-muted'}`}>
        {Number(count || 0).toLocaleString('en-IN')}
      </span>
    </button>
  );
}
