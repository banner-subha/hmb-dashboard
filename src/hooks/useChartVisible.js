import { useState, useEffect, useRef } from 'react';

/**
 * Returns true once the chart container scrolls into the viewport.
 * Animations only play when the chart is actually visible.
 */
export function useChartVisible(ref) {
  // Default to true so charts always render immediately without waiting
  // for observer callback or failing if mounted inside collapsed parents.
  const [isVisible, setIsVisible] = useState(true);
  const hasAnimated = useRef(true);

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
