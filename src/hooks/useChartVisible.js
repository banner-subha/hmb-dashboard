import { useState, useEffect, useRef } from 'react';

/**
 * Returns true once the chart container scrolls into the viewport.
 * Animations only play when the chart is actually visible.
 */
export function useChartVisible(ref) {
  // Without IntersectionObserver there is nothing to wait for, so the chart is
  // visible from the first render rather than being switched on by an effect a
  // render later.
  const [isVisible, setIsVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ref.current || hasAnimated.current) return;

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return isVisible;
}
