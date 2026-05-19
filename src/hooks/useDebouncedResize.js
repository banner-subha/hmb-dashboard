import { useState, useEffect, useRef } from 'react';

export function useDebouncedResize(ref, delay = 150) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const timeoutRef = useRef(null);
  
  useEffect(() => {
    if (!ref.current) return;
    
    const observeTarget = ref.current;
    
    const observer = new ResizeObserver((entries) => {
      if (!entries || !entries.length) return;
      const { width, height } = entries[0].contentRect;
      const roundedWidth = Math.floor(width);
      const roundedHeight = Math.floor(height);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          setDimensions(prev => {
            if (prev.width === roundedWidth && prev.height === roundedHeight) return prev;
            return { width: roundedWidth, height: roundedHeight };
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
