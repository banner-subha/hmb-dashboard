import { memo, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, RotateCcw, X } from 'lucide-react';
import {
  RANGE_PRESETS,
  earliestVisitDay,
  presetRange,
  rangeProblem,
} from '../../utils/visitRange';
import { fetchVisitsCalendar } from '../../services/visitService';
import { formatDayLabel } from '../../utils/formatters';

const label = ({ from, to }) =>
  from === to ? formatDayLabel(from) : `${formatDayLabel(from)} – ${formatDayLabel(to)}`;

// The filter row's version drops the repeated year: '1 Jan – 28 Sep 2026'.
const shortLabel = ({ from, to }) =>
  from === to || from.slice(0, 4) !== to.slice(0, 4)
    ? label({ from, to })
    : `${formatDayLabel(from).replace(/\s\d{4}$/, '')} – ${formatDayLabel(to)}`;

// compact: the 34px height and 12px text of the filter row it sits in.
const SIZE = {
  normal: 'min-h-11 md:min-h-0 px-3.5 py-2 text-[13px]',
  compact: 'min-h-11 md:min-h-0 md:h-[34px] px-2.5 py-1 text-[12px]',
};
const POPOVER_W = 320;

/**
 * Left offset from the picker's own box: right-aligned to the button, then
 * moved as needed to stay 16px inside the viewport (on a phone the button can
 * sit anywhere in a wrapped row).
 */
function popoverPos(wrapEl, buttonEl) {
  const w = wrapEl?.getBoundingClientRect();
  const b = buttonEl?.getBoundingClientRect();
  if (!w || !b) return null;
  const width = Math.min(POPOVER_W, window.innerWidth - 32);
  const left = Math.max(16, Math.min(b.right - width, window.innerWidth - width - 16));
  return { left: left - w.left, width };
}

/**
 * The period the visit views describe. "This month" is the page's own view
 * (value null); anything else is an inclusive { from, to } that the page reads
 * from query_visits_range. Custom dates use the browser's own calendar.
 *
 * Keep it out of anything that scrolls sideways: the popover is absolute, and
 * a scroll box clips it.
 */
function VisitRangePicker({ value, preset, latest, onChange, compact = false }) {
  const size = compact ? SIZE.compact : SIZE.normal;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const button = useRef(null);
  // Earliest day with visits, from the calendar (cached, and warmed with the
  // page). Until it arrives, or if it fails, only the latest day bounds a range.
  const [earliest, setEarliest] = useState(null);
  const wrap = useRef(null);

  useEffect(() => {
    let live = true;
    fetchVisitsCalendar()
      .then(cal => { if (live) setEarliest(earliestVisitDay(cal)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = e => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    const place = () => setPos(popoverPos(wrap.current, button.current));
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const problem = rangeProblem(draft.from, draft.to, latest, earliest);
  const current = value
    ? (compact ? shortLabel(value) : label(value))
    : compact
      ? `1–${formatDayLabel(latest)}`
      : `This month · to ${formatDayLabel(latest)}`;

  const pick = key => {
    if (key === 'custom') {
      setDraft(value || { from: `${latest.slice(0, 7)}-01`, to: latest });
      return;
    }
    onChange(key === 'month' ? null : presetRange(key, latest), key);
    setOpen(false);
  };

  return (
    <div className={`flex items-center ${compact ? 'gap-1.5 shrink-0' : 'flex-wrap gap-2'}`}>
      <div ref={wrap} className="relative">
        <button
          ref={button}
          type="button"
          onClick={() => {
            if (!open) {
              setDraft(value || { from: '', to: '' });
              setPos(popoverPos(wrap.current, button.current));
            }
            setOpen(o => !o);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`inline-flex items-center gap-2 ${size} rounded-xl bg-bg-card/60 border border-border/40 hover:border-accent-blue/50 text-text-secondary whitespace-nowrap cursor-pointer`}
        >
          <CalendarDays className="w-4 h-4 text-accent-blue" />
          <span className="font-bold text-text-primary">{current}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && pos && (
          <div
            role="dialog"
            aria-label="Choose visit period"
            style={{ left: pos.left, width: pos.width }}
            className="absolute top-full z-40 mt-2 rounded-2xl border border-border bg-bg-card shadow-2xl p-3 space-y-3"
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
                      min={earliest || undefined}
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
                  : earliest
                    ? `Any range from ${formatDayLabel(earliest)} to ${formatDayLabel(latest)}.`
                    : `Any range up to ${formatDayLabel(latest)}.`}
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
      {value && (compact ? (
        // In the filter row a labelled button would push the row past one line.
        <button
          type="button"
          onClick={() => { setOpen(false); onChange(null, 'month'); }}
          aria-label="Clear dates"
          title="Clear dates"
          className="inline-flex items-center justify-center min-h-11 min-w-11 md:min-h-0 md:min-w-0 md:h-[34px] md:w-[34px] rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => { setOpen(false); onChange(null, 'month'); }}
          className={`inline-flex items-center gap-1.5 ${size} rounded-xl border border-border/60 bg-bg-card hover:bg-bg-card-hover font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer whitespace-nowrap`}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Clear dates
        </button>
      ))}
    </div>
  );
}

export default memo(VisitRangePicker);
