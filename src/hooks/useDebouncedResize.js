import { useState, useEffect, useRef } from 'react';

export function useDebouncedResize(ref, delay = 150) {
  const [dimensions, setDimensions] = useState(() => {
    if (ref?.current) {
      const rect = ref.current.getBoundingClientRect();
      const w = Math.floor(rect.width || ref.current.clientWidth || 0);
      const h = Math.floor(rect.height || ref.current.clientHeight || 0);
      if (w > 0) return { width: w, height: h };
    }
    return { width: 0, height: 0 };
  });

  const timeoutRef = useRef(null);
  const isFirstMeasure = useRef(true);
  
  useEffect(() => {
    if (!ref.current) return;
    
    const observeTarget = ref.current;

    const getBestWidth = (measuredW) => {
      if (measuredW > 0) return measuredW;
      const clientW = Math.floor(observeTarget.clientWidth || 0);
      if (clientW > 0) return clientW;
      const bcrW = Math.floor(observeTarget.getBoundingClientRect?.()?.width || 0);
      if (bcrW > 0) return bcrW;
      const parentW = Math.floor(observeTarget.parentElement?.clientWidth || 0);
      if (parentW > 0) return parentW;
      return 0;
    };

    // Immediate layout check on effect attachment
    const initialW = getBestWidth(0);
    const initialH = Math.floor(observeTarget.clientHeight || observeTarget.getBoundingClientRect?.()?.height || 0);
    if (initialW > 0) {
      setDimensions(prev => (prev.width === initialW && prev.height === initialH ? prev : { width: initialW, height: initialH }));
      isFirstMeasure.current = false;
    }
    
    const observer = new ResizeObserver((entries) => {
      if (!entries || !entries.length) return;
      const { width, height } = entries[0].contentRect;
      const roundedWidth = getBestWidth(Math.floor(width));
      const roundedHeight = Math.floor(height);
      
      // If width is still 0 (e.g. during mount animation or tab transition),
      // do not burn isFirstMeasure yet so we can measure as soon as layout completes.
      if (isFirstMeasure.current) {
        if (roundedWidth > 0) {
          isFirstMeasure.current = false;
          requestAnimationFrame(() => {
            setDimensions({ width: roundedWidth, height: roundedHeight });
          });
          return;
        }
        return;
      }
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          setDimensions(prev => {
            // Never clobber an established valid width with a transient 0 during DOM reflow
            const finalWidth = roundedWidth > 0 ? roundedWidth : prev.width;
            const finalHeight = roundedHeight > 0 ? roundedHeight : prev.height;
            if (prev.width === finalWidth && prev.height === finalHeight) return prev;
            return { width: finalWidth, height: finalHeight };
          });
        });
      }, delay);
    });
    
    observer.observe(observeTarget);
    
    return () => {
      observer.disconnect();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [ref, delay]);
  
  return dimensions;
}

