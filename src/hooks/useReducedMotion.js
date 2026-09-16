import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onStoreChange) {
  const mql = window.matchMedia(QUERY);

  if (mql.addEventListener) {
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  }
  // Older Safari.
  if (mql.addListener) {
    mql.addListener(onStoreChange);
    return () => mql.removeListener(onStoreChange);
  }
  return () => {};
}

/**
 * Whether the user has asked for reduced motion.
 *
 * Read through `useSyncExternalStore`, so the very first render already has the
 * real answer. Mirroring it into state from an effect meant this returned
 * `false` for one frame — long enough to start playing the animation it exists
 * to suppress.
 */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
