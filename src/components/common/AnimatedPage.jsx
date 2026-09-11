import { m } from 'framer-motion';
import { pageVariants } from '../../utils/motionVariants';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Fades a routed page in on mount.
 *
 * The element type stays an m.div in both motion modes. It used to return a
 * bare fragment when reduced motion was on, so the rendered element changed
 * identity the moment useReducedMotion's effect resolved — swapping a live
 * motion node out mid-transition, which is the other half of why pages could
 * end up stuck invisible. `initial={false}` skips the animation instead: same
 * element, same tree, just no movement.
 */
export default function AnimatedPage({ children }) {
  const reduced = useReducedMotion();

  return (
    <m.div
      variants={pageVariants}
      initial={reduced ? false : 'initial'}
      animate="animate"
    >
      {children}
    </m.div>
  );
}
