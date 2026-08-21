import { m } from 'framer-motion';
import { pageVariants } from '../../utils/motionVariants';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function AnimatedPage({ children }) {
  const reduced = useReducedMotion();
  
  if (reduced) return <>{children}</>;
  
  return (
    <m.div 
      variants={pageVariants} 
      initial="initial" 
      animate="animate" 
      exit="exit"
    >
      {children}
    </m.div>
  );
}
