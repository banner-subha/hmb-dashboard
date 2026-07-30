import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
import { collapseVariants } from '../../utils/motionVariants';

export default function CollapsibleCard({ 
  title, 
  badge = null, 
  defaultOpen = true, 
  children, 
  className = '',
  accentColor = null
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`glass-card overflow-hidden ${className}`}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        className="collapsible-header w-full flex items-center justify-between p-4 sm:p-5 transition-colors border-b border-border cursor-pointer select-none focus-visible:outline-accent-blue"
        style={accentColor ? { borderLeftWidth: '3px', borderLeftColor: accentColor } : {}}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="card-title truncate">{title}</h3>
          {badge && <span className="shrink-0">{badge}</span>}
        </div>
        <m.div
          className="text-text-muted shrink-0"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          <ChevronDown className="w-5 h-5" />
        </m.div>
      </div>
      
      <AnimatePresence initial={false}>
        {isOpen && (
          <m.div
            variants={collapseVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-6">
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
