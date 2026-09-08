import { useReducedMotion } from '../hooks/useReducedMotion';
import { useStatusPhrase } from './statusPhrases';

// What the assistant says while it works.
//
// It sits where the answer will appear, not under the composer: the caption is
// the beginning of the reply, and the first token of real text replaces it in
// the same spot.

// A narrow bright band travelling across dim text. The gradient stops are
// close together so the highlight reads as a sweep rather than a wash.
const SWEEP = [
  'linear-gradient(90deg,',
  'var(--color-text-dim) 0%,',
  'var(--color-text-dim) 35%,',
  'var(--color-text-primary) 50%,',
  'var(--color-text-dim) 65%,',
  'var(--color-text-dim) 100%)',
].join(' ');

export default function ThinkingIndicator({ phases }) {
  const phrase = useStatusPhrase(phases);
  const reducedMotion = useReducedMotion();

  if (!phrase) return null;

  return (
    <div
      className="flex items-center gap-2 py-0.5"
      // Each phrase is announced once, whole. Without atomic the reader can
      // stitch fragments of the old and new caption together.
      aria-live="polite"
      aria-atomic="true"
    >
      {reducedMotion ? (
        <>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-blue" />
          <span className="text-[0.9rem] text-text-muted">{phrase}</span>
        </>
      ) : (
        // Keyed on the phrase so each new one fades in rather than cutting.
        // The fade lives on the wrapper because the sweep owns `animation` on
        // the span itself.
        <span key={phrase} className="animate-fade-in">
          <span
            className="animate-text-shimmer bg-clip-text text-[0.9rem] text-transparent"
            style={{ backgroundImage: SWEEP }}
          >
            {phrase}
          </span>
        </span>
      )}
    </div>
  );
}
