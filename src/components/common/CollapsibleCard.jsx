import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-bg-card hover:bg-bg-card-hover transition-colors border-b border-border"
        style={accentColor ? { borderLeftWidth: '3px', borderLeftColor: accentColor } : {}}
      >
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-sm text-text-primary tracking-wide">{title}</h3>
          {badge && <span>{badge}</span>}
        </div>
        <div className="text-text-muted">
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>
      
      <AnimatePresence initial={false}>
        {isOpen && (
          <m.div
            variants={collapseVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-5">
              {children}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
