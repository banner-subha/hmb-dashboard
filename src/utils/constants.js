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

export const getProductFullName = (code) => {
  if (!code) return '';
  const label = PRODUCT_LABELS[code] || code;
  const match = label.match(/\(([^)]+)\)/);
  return match ? match[1] : label;
};

// Unified product color palette — Blue spectrum tuned to stay visible on
// BOTH themes (deep enough for white cards, bright enough for slate cards).
export const PRODUCT_COLORS = {
  IG: '#1D4ED8',   // Deep Royal Blue
  GI: '#3B82F6',   // Electric Blue
  IGG: '#60A5FA',  // Sky Blue
  P: '#0EA5E9',    // Cyan Sky Blue
  HGI: '#818CF8',  // Indigo Periwinkle
  RS: '#06B6D4',   // Teal Cyan
  SS: '#38BDF8',   // Crystal Blue
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
export const CHART_COLORS = ['#3b82f6', '#4FA98C', '#8b5cf6', '#f97316', '#22c55e', '#ef4444', '#eab308'];

// Risk thresholds
export const RISK_THRESHOLDS = { HIGH: 70, MEDIUM: 40 };

// Category icons (text-based for simplicity)
export const CATEGORY_ICONS = {
  OVERALL: '🏢', PRODUCT: '📦', STATE: '🗺️', DISTRICT: '📍', DEALER: '🏪',
};

// Navigation items — Business-Friendly Labels
export const NAV_ITEMS = [
  { path: '/',          label: 'Executive Overview', icon: 'LayoutDashboard' },
  { path: '/states',    label: 'State Overview', icon: 'Map' },
  { path: '/districts', label: 'District Overview', icon: 'MapPin' },
  { path: '/dealers',   label: 'Dealer Network', icon: 'Store' },
  { path: '/war-room',  label: 'AI Insights & Actions', icon: 'Brain' },
  { path: '/alerts',    label: 'Alerts & Risks', icon: 'Activity' },
  { path: '/geo',       label: 'Geographic View', icon: 'Globe' },
];

export const CLIENT_NAV_ITEMS = [
  { path: '/states',    label: 'State Overview', icon: 'Map' },
  { path: '/districts', label: 'District Overview', icon: 'MapPin' },
  { path: '/dealers',   label: 'Dealer Network', icon: 'Store' },
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

// State alias mapping for mislabeled raw CSV/database entries and geoSlugs
export const STATE_ALIASES = {
  'HAILAKANDI': 'Assam',
  'UTTARPRADESH': 'Uttar Pradesh',
  'UTTAR PRADESH': 'Uttar Pradesh',
  'WESTBENGAL': 'West Bengal',
  'WEST BENGAL': 'West Bengal',
  'UP': 'Uttar Pradesh',
  'WB': 'West Bengal',
  'MP': 'Madhya Pradesh',
  'MADHYAPRADESH': 'Madhya Pradesh',
  'MADHYA PRADESH': 'Madhya Pradesh',
  'AP': 'Andhra Pradesh',
  'ANDHRAPRADESH': 'Andhra Pradesh',
  'ANDHRA PRADESH': 'Andhra Pradesh',
  'ODISHA': 'Orissa',
  'ORISSA': 'Orissa',
  'ORRISA': 'Orissa',
  'JHARKHAND': 'Jharkhand',
  'BIHAR': 'Bihar',
  'ASSAM': 'Assam',
  'TRIPURA': 'Tripura',
  'RAJASTHAN': 'Rajasthan',
  'MANIPUR': 'Manipur',
  'CHHATTISGARH': 'Chhattisgarh',
  'ARUNACHALPRADESH': 'Arunachal Pradesh',
  'ARUNACHAL PRADESH': 'Arunachal Pradesh',
  'MEGHALAYA': 'Meghalaya',
  'MIZORAM': 'Mizoram',
  'NAGALAND': 'Nagaland',
  'SIKKIM': 'Sikkim',
  'GUJARAT': 'Gujarat',
  'MAHARASHTRA': 'Maharashtra',
  'PUNJAB': 'Punjab',
  'HARYANA': 'Haryana',
  'DELHI': 'Delhi',
  'KERALA': 'Kerala',
  'TAMIL NADU': 'Tamil Nadu',
  'TAMILNADU': 'Tamil Nadu',
  'KARNATAKA': 'Karnataka',
  'TELANGANA': 'Telangana',
  'GOA': 'Goa',
  'HIMACHAL PRADESH': 'Himachal Pradesh',
  'HIMACHALPRADESH': 'Himachal Pradesh',
  'UTTARAKHAND': 'Uttaranchal',
  'UTTARANCHAL': 'Uttaranchal',
  'JAMMU & KASHMIR': 'Jammu & Kashmir',
  'JAMMU AND KASHMIR': 'Jammu & Kashmir',
  'LADAKH': 'Ladakh',
};

export function normalizeStateName(name) {
  if (!name || typeof name !== 'string') return name;
  const stripped = name.trim().toUpperCase().replace(/\s+/g, '');
  const upper = name.trim().toUpperCase();
  return STATE_ALIASES[stripped] || STATE_ALIASES[upper] || name.trim();
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

export const NORTH_EAST_STATES = [
  'ASSAM',
  'TRIPURA',
  'MEGHALAYA',
  'MANIPUR',
  'MIZORAM',
  'NAGALAND',
  'ARUNACHAL PRADESH',
  'SIKKIM',
  'HAILAKANDI'
];

/**
 * Parses comma-separated state strings or arrays, automatically expanding region tokens
 * like "NORTH EAST" / "NORTHEAST" into all individual active North East states.
 * Returns a Set of normalized uppercase space-stripped state strings.
 */
export function getExpandedStatesSet(statesInput) {
  const set = new Set();
  if (!statesInput) return set;

  let rawList = [];
  if (Array.isArray(statesInput)) {
    statesInput.forEach(s => {
      if (typeof s === 'string') {
        s.split(',').forEach(item => rawList.push(item.trim()));
      }
    });
  } else if (typeof statesInput === 'string') {
    statesInput.split(',').forEach(item => rawList.push(item.trim()));
  }

  rawList.forEach(rawItem => {
    if (!rawItem) return;
    const cleanItem = rawItem.toUpperCase().replace(/\s+/g, '');
    
    // Check if token represents North East region
    if (
      cleanItem === 'NORTHEAST' || 
      cleanItem === 'NORTHEASTSTATES' || 
      cleanItem === 'NE' || 
      cleanItem === 'NORTH-EAST'
    ) {
      NORTH_EAST_STATES.forEach(neState => {
        set.add(neState.replace(/\s+/g, '').toUpperCase());
        const norm = normalizeStateName(neState);
        if (norm) set.add(norm.replace(/\s+/g, '').toUpperCase());
      });
    } else {
      set.add(cleanItem);
      const norm = normalizeStateName(rawItem);
      if (norm) {
        set.add(norm.replace(/\s+/g, '').toUpperCase());
      }
    }
  });

  return set;
}

export function isWestBengalUser(user, filterOptions) {
  if (!user || user.role === 'admin') return true;
  if (user.role === 'client') {
    const rawUserStates = Array.isArray(user.states) 
      ? user.states 
      : (typeof user.states === 'string' ? user.states.split(',') : []);
    const expandedSet = getExpandedStatesSet(rawUserStates);
    if (expandedSet.has('WESTBENGAL') || expandedSet.has('WB')) return true;

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

