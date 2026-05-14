// Product labels and abbreviations used across the system
export const PRODUCT_LABELS = {
  IG: 'IG (Iron Gate)',
  GI: 'GI (Galvanised Iron)',
  IGG: 'IGG (Iron Gate — Heavy)',
  HGI: 'HGI (Heavy GI)',
  P: 'P (Pipe)',
  RS: 'RS (Roofing Sheet)',
  SS: 'SS (Stainless Steel)',
};

export const ALL_PRODUCTS = Object.keys(PRODUCT_LABELS);

// Severity configuration
export const SEVERITY_CONFIG = {
  IMMEDIATE:{ color: '#ef4444', bg: 'bg-severity-critical/20', text: 'text-severity-critical', label: 'Immediate' },
  CRITICAL: { color: '#ef4444', bg: 'bg-severity-critical/20', text: 'text-severity-critical', label: 'Critical' },
  HIGH:     { color: '#f97316', bg: 'bg-severity-high/20',     text: 'text-severity-high',     label: 'High' },
  MEDIUM:   { color: '#eab308', bg: 'bg-severity-medium/20',   text: 'text-severity-medium',   label: 'Medium' },
  LOW:      { color: '#6b7280', bg: 'bg-severity-low/20',      text: 'text-severity-low',      label: 'Low' },
  NONE:     { color: '#22c55e', bg: 'bg-severity-none/20',     text: 'text-severity-none',     label: 'None' },
};

export const SEVERITY_ORDER = ['IMMEDIATE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

// Chart color palette
export const CHART_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f97316', '#22c55e', '#ef4444', '#eab308'];

// Risk thresholds
export const RISK_THRESHOLDS = { HIGH: 70, MEDIUM: 40 };

// Category icons (text-based for simplicity)
export const CATEGORY_ICONS = {
  OVERALL: '🏢', PRODUCT: '📦', STATE: '🗺️', DISTRICT: '📍', DEALER: '🏪',
};

// Navigation items
export const NAV_ITEMS = [
  { path: '/',          label: 'Executive Overview', icon: 'LayoutDashboard' },
  { path: '/states',    label: 'State Intelligence', icon: 'Map' },
  { path: '/districts', label: 'District Intelligence', icon: 'MapPin' },
  { path: '/dealers',   label: 'Dealer Intelligence', icon: 'Store' },
  { path: '/war-room',  label: 'AI War Room', icon: 'Brain' },
  { path: '/alerts',    label: 'Alert Intelligence', icon: 'Activity' },
  { path: '/geo',       label: 'Geo Intelligence', icon: 'Globe' },
];
