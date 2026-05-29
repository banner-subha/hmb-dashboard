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

// Unified product color palette
export const PRODUCT_COLORS = {
  IG: '#3B82F6',   // Electric Blue
  GI: '#F97316',   // Premium Orange
  IGG: '#A3E635',  // Neon Lime
  HGI: '#8B5CF6',  // Violet Purple
  P: '#FB923C',    // Soft Amber Orange
  RS: '#EF4444',   // Rose Red
  SS: '#22D3EE',   // Slate Cyan
};

import { getSeverityTheme } from './trendEngine';

// Severity configuration — colors derived from trendEngine single source of truth
export const SEVERITY_CONFIG = {
  CRITICAL: { color: getSeverityTheme('CRITICAL').color, bg: 'bg-severity-critical/20', text: 'text-severity-critical', label: 'Critical' },
  HIGH:     { color: getSeverityTheme('HIGH').color,     bg: 'bg-severity-high/20',     text: 'text-severity-high',     label: 'High' },
  MEDIUM:   { color: getSeverityTheme('MEDIUM').color,   bg: 'bg-severity-medium/20',   text: 'text-severity-medium',   label: 'Medium' },
  LOW:      { color: getSeverityTheme('LOW').color,      bg: 'bg-severity-low/20',      text: 'text-severity-low',      label: 'Low' },
  NONE:     { color: '#6b7280',                          bg: 'bg-severity-none/20',      text: 'text-severity-none',     label: 'None' },
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

// Navigation items
export const NAV_ITEMS = [
  { path: '/',          label: 'Executive Summary', icon: 'LayoutDashboard' },
  { path: '/states',    label: 'State Performance', icon: 'Map' },
  { path: '/districts', label: 'District Performance', icon: 'MapPin' },
  { path: '/dealers',   label: 'Dealer Performance', icon: 'Store' },
  { path: '/war-room',  label: 'Smart Insights', icon: 'Brain' },
  { path: '/alerts',    label: 'Active Alerts', icon: 'Activity' },
  { path: '/geo',       label: 'Regional Map', icon: 'Globe' },
];
