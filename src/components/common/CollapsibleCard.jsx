import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, m } from 'framer-motion';
import { collapseVariants } from '../../utils/motionVariants';

function CollapsibleCard({ 
  title, 
  badge = null, 
  defaultOpen = true, 
  children, 
  className = '',
  accentColor = null,
  fullHeight = false
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`glass-card overflow-hidden flex flex-col ${fullHeight ? 'h-full' : ''} ${className}`}>
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
        className="collapsible-header w-full flex items-center justify-between p-3.5 sm:p-4 transition-colors border-b border-border cursor-pointer select-none focus-visible:outline-accent-blue shrink-0"
        style={accentColor ? { borderLeftWidth: '3px', borderLeftColor: accentColor } : {}}
      >
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 min-w-0 pr-2 flex-1">
          <h3 className="card-title text-base sm:text-lg font-bold text-text-primary tracking-tight leading-snug">{title}</h3>
          {badge && <div className="inline-flex items-center shrink-0">{badge}</div>}
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
            className={`overflow-hidden ${fullHeight ? 'flex-1 flex flex-col' : ''}`}
          >
            <div className={`p-3.5 sm:p-4.5 ${fullHeight ? 'flex-1 flex flex-col justify-between' : ''}`}>
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default React.memo(CollapsibleCard);
