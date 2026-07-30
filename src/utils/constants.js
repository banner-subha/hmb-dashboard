// Product labels and abbreviations used across the system — Business-Friendly
export const PRODUCT_LABELS = {
  IG: 'IG (I-Grill)',
  GI: 'GI (Grill Guard)',
  IGG: 'IGG (Iron Grill Guard)',
  HGI: 'HGI (Heavy Grill Guard)',
  P: 'P (Pipe)',
  RS: 'RS (Roofing Sheet)',
  SS: 'SS (Stainless Steel)',
};

export const ALL_PRODUCTS = Object.keys(PRODUCT_LABELS);

// Unified product color palette
export const PRODUCT_COLORS = {
  IG: '#3B82F6',   // Electric Blue
  GI: '#F97316',   // Premium Orange
  IGG: '#A3E635',  // Neon Lime
  HGI: '#8B5CF6',  // Violet Purple
  P: '#10B981',    // Emerald Green
  RS: '#EF4444',   // Rose Red
  SS: '#22D3EE',   // Slate Cyan
};

import { getSeverityTheme } from './trendEngine.js';

// Severity configuration — colors derived from trendEngine single source of truth
export const SEVERITY_CONFIG = {
  CRITICAL: { color: getSeverityTheme('CRITICAL').color, bg: 'bg-severity-critical/20', text: 'text-severity-critical', label: 'Critical' },
  HIGH:     { color: getSeverityTheme('HIGH').color,     bg: 'bg-severity-high/20',     text: 'text-severity-high',     label: 'High' },
  MEDIUM:   { color: getSeverityTheme('MEDIUM').color,   bg: 'bg-severity-medium/20',   text: 'text-severity-medium',   label: 'Medium' },
  LOW:      { color: getSeverityTheme('LOW').color,      bg: 'bg-severity-low/20',      text: 'text-severity-low',      label: 'Low' },
  NONE:     { color: '#6b7280',                          bg: 'bg-severity-none/20',      text: 'text-severity-none',     label: 'On Track' },
};

export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

// Chart color palette
export const CHART_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f97316', '#22c55e', '#ef4444', '#eab308'];

// Risk thresholds
export const RISK_THRESHOLDS = { HIGH: 70, MEDIUM: 40 };

// Category icons (text-based for simplicity)
export const CATEGORY_ICONS = {
  OVERALL: '🏢', PRODUCT: '📦', STATE: '🗺️', DISTRICT: '📍', DEALER: '🏪',
};

// Navigation items — Business-Friendly Labels
export const NAV_ITEMS = [
  { path: '/',          label: 'Executive Overview', icon: 'LayoutDashboard' },
  { path: '/states',    label: 'State Performance', icon: 'Map' },
  { path: '/districts', label: 'District Performance', icon: 'MapPin' },
  { path: '/dealers',   label: 'Dealer Performance', icon: 'Store' },
  { path: '/war-room',  label: 'AI Insights & Actions', icon: 'Brain' },
  { path: '/alerts',    label: 'Alerts & Risk', icon: 'Activity' },
  { path: '/geo',       label: 'Geographic View', icon: 'Globe' },
];

export const CLIENT_NAV_ITEMS = [
  { path: '/states',    label: 'State Performance', icon: 'Map' },
  { path: '/districts', label: 'District Performance', icon: 'MapPin' },
  { path: '/dealers',   label: 'Dealer Performance', icon: 'Store' },
];

export const NORTH_BENGAL_DISTRICTS = [
  'DARJEELING',
  'JALPAIGURI',
  'COOCHBEHAR',
  'ALIPURDUAR',
  'KALIMPONG',
  'MALDAH',
  'DINAJPUR UTTAR',
  'DINAJPUR DAKSHIN'
];

// Master set of valid Indian States & Union Territories
export const VALID_INDIAN_STATES = new Set([
  'andhra pradesh',
  'arunachal pradesh',
  'assam',
  'bihar',
  'chhattisgarh',
  'goa',
  'gujarat',
  'haryana',
  'himachal pradesh',
  'jharkhand',
  'karnataka',
  'kerala',
  'madhya pradesh',
  'maharashtra',
  'manipur',
  'meghalaya',
  'mizoram',
  'nagaland',
  'odisha',
  'orissa',
  'punjab',
  'rajasthan',
  'sikkim',
  'tamil nadu',
  'telangana',
  'tripura',
  'uttar pradesh',
  'uttarakhand',
  'west bengal',
  'wb',
  'up',
  'mp',
  'ap',
  'andaman and nicobar islands',
  'andaman and nicobar',
  'chandigarh',
  'dadra and nagar haveli and daman and diu',
  'daman and diu',
  'delhi',
  'nct of delhi',
  'jammu and kashmir',
  'jammu & kashmir',
  'j&k',
  'ladakh',
  'lakshadweep',
  'puducherry',
  'pondicherry'
]);

// State alias mapping for mislabeled raw CSV/database entries
export const STATE_ALIASES = {
  'HAILAKANDI': 'Assam',
  'UTTARPRADESH': 'Uttar Pradesh',
  'WB': 'West Bengal',
  'ODISHA': 'Orissa',
};

export function normalizeStateName(name) {
  if (!name || typeof name !== 'string') return name;
  const upper = name.trim().toUpperCase();
  return STATE_ALIASES[upper] || name.trim();
}

export function isRealState(name) {
  if (!name || typeof name !== 'string') return false;
  const normalized = normalizeStateName(name);
  const norm = normalized.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return VALID_INDIAN_STATES.has(norm);
}

export function isWestBengalUser(user, filterOptions) {
  if (!user || user.role === 'admin') return true;
  if (user.role === 'client') {
    const userStates = (user.states || []).map(s => normalizeStateName(s).toUpperCase());
    if (userStates.some(s => s.includes('WB') || s.includes('BENGAL'))) return true;

    if (filterOptions?.states && Array.isArray(filterOptions.states)) {
      if (filterOptions.states.some(s => {
        const norm = normalizeStateName(s).toUpperCase().replace(/\s+/g, '');
        return norm === 'WESTBENGAL' || norm === 'WB';
      })) {
        return true;
      }
    }
  }
  return false;
}

