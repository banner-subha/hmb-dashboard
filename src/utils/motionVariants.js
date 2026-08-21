// Page wrapper — fade + subtle upward drift
export const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, transition: { duration: 0.10 } },
};

// Stagger container — for KPI grids, card lists
export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

// Stagger child — each card/item
export const staggerItem = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

// Viewport-triggered entry (once only)
export const viewportEntry = {
  initial: { opacity: 0, y: 10 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.3, ease: 'easeOut' },
};

// Sidebar drawer
export const sidebarVariants = {
  closed: { x: '-100%', transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
  open:   { x: 0,       transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } },
};

// Backdrop overlay
export const backdropVariants = {
  closed: { opacity: 0 },
  open:   { opacity: 1, transition: { duration: 0.2 } },
};

// Collapsible content (max-height + opacity, NOT height: auto)
export const collapseVariants = {
  open:   { opacity: 1, maxHeight: 2000, transition: { duration: 0.25, ease: 'easeInOut' } },
  closed: { opacity: 0, maxHeight: 0,    transition: { duration: 0.2, ease: 'easeInOut' } },
};

// KPI card stagger child — scale + fade for premium feel
export const kpiCard = {
  initial: { opacity: 0, scale: 0.98, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// List item — fade + slide
export const listItem = {
  initial: { opacity: 0, x: -4 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

// Scale-in burst (for badges, chips)
export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.18, ease: 'easeOut' } },
};

// Generic fade-up
export const fadeInUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
};
