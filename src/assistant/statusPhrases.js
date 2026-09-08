import { useEffect, useRef, useState } from 'react';

// What the assistant says while it is working.
//
// The agent service sends its own human-readable `status` string on every
// tool_start — that is where "Consulting sales database" came from. We ignore
// it. That string is written for a log, it names the database, and it is the
// same six words every time. The phrase belongs to the interface, so the
// interface writes it: short, in the first person of a colleague doing the
// work, and about the business rather than the plumbing.
//
// Nothing here ever mentions SQL, a table, a tool, a row count or a duration.

export const TOOL_PHRASES = {
  query_despatch: ['Pulling despatch numbers', 'Adding up tonnage'],
  query_dia_wise: ['Checking size-wise rates', 'Working through revenue'],
  query_pending: ['Reviewing the order backlog', 'Ageing the backlog'],
  query_dealer_targets: ['Looking up targets'],
  query_dealer_vs_actual: ['Comparing against target'],
  query_kro_performance: ['Checking field-force numbers'],
  resolve_dimension_value: ['Matching names'],
  explain_dealer_match: ['Confirming the dealer'],
};

export const OPENING = ['Thinking', 'Working out the numbers', 'Still on it'];
export const READING = ['Reading through it', 'Cross-checking'];
export const RECOVERING = ['Trying another way'];

export const MULTI = 'Checking a few things';
export const FALLBACK = 'Checking the numbers';

// How long a single phrase stays on screen before it may be replaced. Tool
// results can land in well under 100ms, and a caption that changes three times
// in a quarter second reads as a glitch rather than as progress.
export const HOLD_MS = 900;

// Elapsed thresholds, in ms, for walking the opening phrases. A question that
// is genuinely slow should say so rather than sitting on "Thinking" for
// fifteen seconds.
const OPENING_AT = [0, 2500, 6000];

// Long-running work advances to its second phrase rather than freezing.
const TOOL_ADVANCE_MS = 4000;
const READING_ADVANCE_MS = 3000;

function step(list, elapsed, every) {
  return list[Math.min(list.length - 1, Math.floor(elapsed / every))];
}

// Not every phrase is worth the same.
//
// "Reviewing the order backlog" says what the assistant is doing for you;
// "Thinking" and "Reading through it" are filler around it. Against a fast
// query the whole tool phase can be over inside the minimum hold, and a plain
// queue would then drop the one phrase worth reading in favour of the filler
// either side of it. So rank them: a more informative phrase preempts a less
// informative one on arrival, and once shown it serves its full hold before
// anything duller replaces it.
const RANK = { opening: 0, reading: 1, tool: 2, recovering: 2 };
export const rankOf = (activity) => (activity ? RANK[activity.kind] ?? 0 : -1);

/**
 * The phrase for an activity descriptor, given how long that activity has been
 * the current one. Pure, so it is trivially testable.
 *
 * activity: { kind: 'opening' | 'tool' | 'reading' | 'recovering',
 *             tool?: string, running?: number }
 */
export function phraseFor(activity, elapsed = 0) {
  if (!activity) return null;

  switch (activity.kind) {
    case 'opening': {
      let i = 0;
      for (let s = 0; s < OPENING_AT.length; s += 1) {
        if (elapsed >= OPENING_AT[s]) i = s;
      }
      return OPENING[i];
    }
    case 'tool': {
      // Two queries in flight at once: naming one of them would be arbitrary.
      if ((activity.running || 0) > 1) return MULTI;
      const list = TOOL_PHRASES[activity.tool];
      return list ? step(list, elapsed, TOOL_ADVANCE_MS) : FALLBACK;
    }
    case 'reading':
      return step(READING, elapsed, READING_ADVANCE_MS);
    case 'recovering':
      return RECOVERING[0];
    default:
      return FALLBACK;
  }
}

// How often the caption re-evaluates itself. Fine enough that a hold expiring
// is imperceptible, coarse enough to be free.
const EVAL_MS = 150;

/**
 * The live caption for a log of phases.
 *
 * The log is a playlist rather than a state to mirror. Each entry gets at
 * least HOLD_MS of airtime, so nothing flickers; entries still queued may be
 * skipped in favour of a more informative one, so a burst of fast queries
 * shows what it was doing rather than the filler around it; and a more
 * informative phase arriving interrupts a duller one already on screen.
 *
 * Returns null when there is nothing to say, which is the signal to unmount
 * the indicator — the first token of the answer takes over from it.
 */
export function useStatusPhrase(phases) {
  const [phrase, setPhrase] = useState(null);

  // Which entry is on screen and when it got there. Refs: they record what the
  // last commit did and are never inputs to rendering.
  const cursorRef = useRef(0);
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (!phases.length) {
      cursorRef.current = 0;
      shownAtRef.current = 0;
      // Deferred a macrotask so the indicator never re-renders inside the
      // effect flush that hid it.
      const clear = setTimeout(() => setPhrase(null), 0);
      return () => clearTimeout(clear);
    }

    let timer;

    const evaluate = () => {
      const now = Date.now();
      let cursor = Math.min(cursorRef.current, phases.length - 1);

      if (shownAtRef.current === 0) shownAtRef.current = now;

      const ahead = phases.slice(cursor + 1);
      if (ahead.length) {
        // Of everything queued, the most informative — falling back to the
        // newest, so a run of equally dull entries still ends up current.
        const best = ahead.reduce(
          (a, b) => (rankOf(b) > rankOf(a) ? b : a),
          ahead[ahead.length - 1],
        );
        const served = now - shownAtRef.current >= HOLD_MS;
        const interrupts = rankOf(best) > rankOf(phases[cursor]);

        if (served || interrupts) {
          cursor = phases.indexOf(best);
          cursorRef.current = cursor;
          shownAtRef.current = now;
        }
      }

      setPhrase(phraseFor(phases[cursor], now - shownAtRef.current));
      timer = setTimeout(evaluate, EVAL_MS);
    };

    // Deferred rather than called inline: the first evaluation must not commit
    // state inside the effect flush that scheduled it.
    timer = setTimeout(evaluate, 0);
    return () => clearTimeout(timer);
  }, [phases]);

  return phrase;
}
