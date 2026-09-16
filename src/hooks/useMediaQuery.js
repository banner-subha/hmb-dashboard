import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a media query.
 *
 * Reads through `useSyncExternalStore` rather than mirroring `matches` into
 * state from an effect. The old version always rendered `false` first and
 * corrected itself after mount, so every consumer got one frame of the wrong
 * answer — which on `useMediaQuery('(max-width: 639px)')` meant the assistant
 * mounting as a desktop side panel before flipping to a mobile sheet.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onStoreChange) => {
      const mediaQuery = window.matchMedia(query);

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', onStoreChange);
        return () => mediaQuery.removeEventListener('change', onStoreChange);
      }
      // Older Safari.
      mediaQuery.addListener(onStoreChange);
      return () => mediaQuery.removeListener(onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // No DOM to measure when there is no window. Matches the old initial state.
    () => false,
  );
}
