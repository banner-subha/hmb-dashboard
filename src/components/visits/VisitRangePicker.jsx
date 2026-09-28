import { memo, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, RotateCcw } from 'lucide-react';
import {
  RANGE_PRESETS,
  EARLIEST_VISIT_DAY,
  MAX_RANGE_DAYS,
  presetRange,
  rangeProblem,
} from '../../utils/visitRange';
import { formatDayLabel } from '../../utils/formatters';

const label = ({ from, to }) =>
  from === to ? formatDayLabel(from) : `${formatDayLabel(from)} – ${formatDayLabel(to)}`;

/**
 * The period the visit views describe. "This month" is the page's own view
 * (value null); anything else is an inclusive { from, to } that the page reads
 * from query_visits_range. Custom dates use the browser's own calendar.
 */
function VisitRangePicker({ value, preset, latest, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const problem = rangeProblem(draft.from, draft.to, latest);
  const current = value ? label(value) : `This month · to ${formatDayLabel(latest)}`;

  const pick = key => {
    if (key === 'custom') {
      setDraft(value || { from: `${latest.slice(0, 7)}-01`, to: latest });
      return;
    }
    onChange(key === 'month' ? null : presetRange(key, latest), key);
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={wrap} className="relative">
        <button
          type="button"
          onClick={() => {
            if (!open) setDraft(value || { from: '', to: '' });
            setOpen(o => !o);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex items-center gap-2 min-h-11 md:min-h-0 px-3.5 py-2 rounded-xl bg-bg-card/60 border border-border/40 hover:border-accent-blue/50 text-[13px] text-text-secondary whitespace-nowrap cursor-pointer"
        >
          <CalendarDays className="w-4 h-4 text-accent-blue" />
          <span className="font-bold text-text-primary">{current}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Choose visit period"
            className="absolute left-0 md:left-auto md:right-0 z-40 mt-2 w-[min(320px,calc(100vw-32px))] rounded-2xl border border-border bg-bg-card shadow-2xl p-3 space-y-3"
          >
            <div className="grid grid-cols-2 gap-1.5">
              {RANGE_PRESETS.map(p => {
                const on = preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(p.key)}
                    className={`min-h-11 md:min-h-0 px-3 py-2 rounded-lg text-[13px] font-bold text-left cursor-pointer transition-colors ${
                      on
                        ? 'bg-accent-blue text-white'
                        : 'bg-bg-secondary/60 text-text-secondary hover:text-text-primary hover:bg-bg-card-hover'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-border/50 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                {[['from', 'From'], ['to', 'To']].map(([k, text]) => (
                  <label key={k} className="block">
                    <span className="block text-[11px] font-bold text-text-muted uppercase tracking-wide mb-1">{text}</span>
                    <input
                      type="date"
                      value={draft[k]}
                      min={EARLIEST_VISIT_DAY}
                      max={latest}
                      onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))}
                      // A click anywhere on the field opens the calendar. On its
                      // own the browser only opens it from the small icon, and a
                      // click on the text just selects the day digits. showPicker
                      // can throw (older browsers, embedded frames); typing the
                      // date still works then.
                      onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* typing still works */ } }}
                      className="visit-date-input w-full min-h-11 md:min-h-0 text-[13px] py-1.5 px-2 rounded-lg border border-border bg-bg-input text-text-primary cursor-pointer hover:border-accent-blue/50 focus:border-accent-blue"
                    />
                  </label>
                ))}
              </div>
              <p className={`text-[12px] leading-snug ${problem && draft.from && draft.to ? 'text-severity-critical' : 'text-text-muted'}`}>
                {problem && draft.from && draft.to
                  ? problem
                  : `Up to ${MAX_RANGE_DAYS} days, from 1 Jan 2025 to ${formatDayLabel(latest)}.`}
              </p>
              <button
                type="button"
                disabled={Boolean(problem)}
                onClick={() => { onChange({ from: draft.from, to: draft.to }, 'custom'); setOpen(false); }}
                className="w-full min-h-11 md:min-h-0 py-2 rounded-lg bg-accent-blue text-white text-[13px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Show these dates
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Only while a range is picked: "This month" is the page's own view, so
          there is nothing to clear then. Same look as the page's Clear Filters. */}
      {value && (
        <button
          type="button"
          onClick={() => { setOpen(false); onChange(null, 'month'); }}
          className="inline-flex items-center gap-1.5 min-h-11 md:min-h-0 px-3.5 py-2 rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Clear dates
        </button>
      )}
    </div>
  );
}

export default memo(VisitRangePicker);
