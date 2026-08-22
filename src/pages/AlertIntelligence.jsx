import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { 
  AlertTriangle, 
  Search, 
  ChevronDown, 
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  Target,
  Map,
  Layers,
  FileText,
  Briefcase,
  ShieldAlert,
  Clock,
  MapPin,
  Info,
  X,
  Trash2,
  Package,
  Timer,
  BarChart3,
  Zap,
  Calendar,
} from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
} from 'recharts';
import SeverityBadge from '../components/common/SeverityBadge';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { calculateMoM, getBusinessImpact, getSeverityFromImpactScore, getSeverityTheme } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';
import { PRODUCT_LABELS } from '../utils/constants';
import { normalizeDistrict } from '../utils/districtNormalizer';

// ── Shared helpers ───────────────────────────────────────────────────────────
const formatNum = (num, fallback = '-') => (typeof num === 'number' ? num.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : fallback);

function getImpactScoreColor(score) {
  return getSeverityTheme(getSeverityFromImpactScore(score)).color;
}

// ── Business Priority helpers ────────────────────────────────────────────────
const BUSINESS_PRIORITY = {
  CRITICAL: { label: 'Urgent Action', icon: '🔴', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', color: '#fca5a5' },
  HIGH:     { label: 'Needs Attention', icon: '🟠', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', color: '#fdba74' },
  MEDIUM:   { label: 'Monitor', icon: '🟡', bg: 'rgba(234,179,8,0.10)', border: 'rgba(234,179,8,0.25)', color: '#fde68a' },
  LOW:      { label: 'On Track', icon: '🟢', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)', color: '#86efac' },
};

function getBusinessPriority(severity) {
  return BUSINESS_PRIORITY[severity] || BUSINESS_PRIORITY.LOW;
}

// ── Severity propagation helpers ─────────────────────────────────────────────
const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function getWorstSeverity(children = []) {
  let worst = 'LOW';
  for (const child of children) {
    const childSev = child.children?.length
      ? getWorstSeverity(child.children)
      : (child.severity || 'LOW');
    if ((SEVERITY_RANK[childSev] || 0) > (SEVERITY_RANK[worst] || 0)) worst = childSev;
  }
  return worst;
}

function getWorstImpactScore(children = []) {
  let best = 0;
  for (const child of children) {
    const score = child.children?.length
      ? getWorstImpactScore(child.children)
      : (child.impactScore ?? 0);
    if (score > best) best = score;
  }
  return best;
}

const cleanName = (name) => name ? String(name).split('—')[0].trim() : '';

// ── Entity Pending Orders helper for Dispatch mode ───────────────────────────
function getEntityPendingOrders(row, fullData) {
  if (!row || !fullData) return 0;
  const source = row._source;
  const level = row.level;
  const name = (row.entityName || '').trim().toUpperCase();

  if (level === 'DEALER') {
    if (source?.pendingQty !== undefined) return source.pendingQty;
    if (source?.data?.pendingQty !== undefined) return source.data.pendingQty;
    const dl = (fullData.dealers || []).find(d => (d.client || '').trim().toUpperCase() === name);
    return dl?.pendingQty ?? 0;
  }
  if (level === 'DISTRICT') {
    const dist = (fullData.districts || []).find(d => (d.district || '').trim().toUpperCase() === name);
    return dist?.pendingQty ?? 0;
  }
  if (level === 'STATE') {
    const st = (fullData.states || []).find(s => (s.state || '').trim().toUpperCase() === name);
    return st?.pendingQty ?? 0;
  }
  if (level === 'PRODUCT') {
    const pr = (fullData.products || []).find(p => (p.product || '').trim().toUpperCase() === name);
    return pr?.pendingQty ?? 0;
  }
  return source?.pendingQty ?? source?.data?.pendingQty ?? 0;
}

// ── Collapsible Hierarchy Tree Node Component ─────────────────────────────
function HierarchyTreeNodeItem({ node, depth = 1 }) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  // Initialize and sync isExpanded from node.autoExpand
  const [isExpanded, setIsExpanded] = useState(Boolean(node.autoExpand));

  useEffect(() => {
    if (node.autoExpand !== undefined) {
      setIsExpanded(Boolean(node.autoExpand));
    }
  }, [node.autoExpand]);

  const isProduct = node.type === 'PRODUCT';
  const labelText = isProduct ? (PRODUCT_LABELS[node.name] || node.name) : node.name;

  const toggleExpand = (e) => {
    e.stopPropagation();
    if (hasChildren) {
      setIsExpanded(prev => !prev);
    }
  };

  return (
    <div className="space-y-1 my-1">
      <div 
        onClick={hasChildren ? toggleExpand : undefined}
        className={`flex items-center justify-between gap-3 py-1 px-2 rounded-lg relative transition-colors ${
          hasChildren ? 'cursor-pointer hover:bg-bg-secondary/60' : ''
        } ${depth > 1 ? 'ml-3' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {depth === 1 && (
            <div className="absolute -left-3 top-0 w-3 h-1/2 border-l border-b border-border-accent rounded-bl"></div>
          )}

          {/* Collapsible arrow icon */}
          {hasChildren ? (
            <button 
              type="button"
              onClick={toggleExpand} 
              className="p-0.5 rounded hover:bg-border/40 text-accent-blue shrink-0 transition-all cursor-pointer"
              title={isExpanded ? "Collapse breakdown" : "Expand breakdown"}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          {/* Node Type Icon */}
          {node.type === 'DISTRICT' && <Map className="w-3.5 h-3.5 text-accent-blue z-10 shrink-0" />}
          {node.type === 'DEALER' && <Search className="w-3.5 h-3.5 text-text-muted z-10 shrink-0" />}
          {node.type === 'PRODUCT' && (
            <div className={`w-1.5 h-1.5 rounded-full ${node.drop > 0 ? 'bg-accent-blue/80' : 'bg-emerald-400'} shrink-0 ml-0.5`} />
          )}

          <span 
            className={`truncate select-none ${
              node.type === 'DISTRICT' 
                ? 'text-base text-text-primary font-bold' 
                : node.type === 'DEALER' 
                  ? 'text-sm text-text-primary font-bold' 
                  : 'text-sm text-text-primary font-semibold'
            }`} 
            title={labelText}
          >
            {labelText}
          </span>
          {hasChildren && !isExpanded && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue font-bold shrink-0">
              {node.children.length} {node.type === 'DISTRICT' ? (node.children.length === 1 ? 'dealer' : 'dealers') : (node.children.length === 1 ? 'product' : 'products')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
          {node.drop > 0 ? (
            <span className={`font-extrabold tracking-tight ${
              node.type === 'DISTRICT' 
                ? 'text-severity-critical text-lg' 
                : node.type === 'DEALER' 
                  ? 'text-severity-critical text-base' 
                  : 'text-severity-critical text-sm font-bold'
            }`}>
              -{formatNum(node.drop)} MT
            </span>
          ) : node.drop < 0 ? (
            <span className="text-emerald-400 font-extrabold text-sm">
              +{formatNum(-node.drop)} MT
            </span>
          ) : (
            <span className="text-text-muted font-bold text-sm">
              0 MT
            </span>
          )}

          {node.mom != null && node.mom !== 0 && (
            <span className={`font-mono font-semibold ${
              node.type === 'DISTRICT' 
                ? 'text-sm text-text-muted' 
                : node.type === 'DEALER' 
                  ? 'text-sm text-text-muted' 
                  : 'text-xs text-text-muted'
            }`}>
              ({node.mom > 0 ? `+${node.mom}` : node.mom}% MoM)
            </span>
          )}
        </div>
      </div>

      {/* Render children recursively when expanded */}
      {hasChildren && isExpanded && (
        <div className={`my-0.5 border-l-2 ${node.type === 'DISTRICT' ? 'border-accent-blue/30 ml-5 pl-2' : 'border-border/40 ml-7 pl-2 space-y-0.5'}`}>
          {node.children.map((childNode, idx) => (
            <HierarchyTreeNodeItem key={idx} node={childNode} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dynamic Hierarchy Generator (dispatch alerts) ────────────────────────────
const buildHierarchy = (alert, fullData, searchQuery = '') => {
  if (!fullData || !alert) return null;
  const level = (alert.level || alert.category || '').toUpperCase();
  const rawEntityName = (alert.dealer || alert.client || alert.district || alert.state || (alert.title ? alert.title.split(':')[0].trim() : '') || '').trim();
  const entityName = rawEntityName.toUpperCase();
  const query = (searchQuery || '').trim().toLowerCase();

  // Helper to build a Dealer node with its nested Product children
  const buildDealerNode = (dl, parentAutoExpand = false) => {
    const impactScore = dl.impactScore ?? 0;
    const severity = dl.severity || dl.healthStatus || dl.impactTier || getSeverityFromImpactScore(impactScore);
    const drop = dl.drop ?? Math.max(0, (dl.prev ?? 0) - (dl.cur ?? 0));
    const isInactive = (dl.cur ?? 0) === 0;
    const statusLabel = isInactive ? 'Inactive' : 'Active';
    
    const isDealerMatch = query ? (
      (dl.client || '').toLowerCase().includes(query) ||
      (dl.district || '').toLowerCase().includes(query) ||
      (dl.state || '').toLowerCase().includes(query)
    ) : false;

    const dealerProducts = (dl.products || [])
      .map(p => {
        const cur = p.cur ?? 0;
        const prev = p.prev ?? 0;
        const pDrop = prev - cur;
        return {
          type: 'PRODUCT',
          name: cleanName(typeof p === 'string' ? p : (p.product || p.name || '')),
          severity: getSeverityFromImpactScore(p.impactScore ?? 0),
          impactScore: p.impactScore ?? 0,
          drop: pDrop,
          cur,
          prev,
          mom: p.mom ?? calculateMoM(cur, prev)
        };
      })
      .filter(p => p.cur !== 0 || p.prev !== 0)
      .sort((a, b) => b.drop - a.drop);

    const autoExpand = Boolean(isDealerMatch || parentAutoExpand || (query.length > 0));

    return {
      type: 'DEALER',
      name: `${cleanName(dl.client)} (${statusLabel})`,
      severity,
      impactScore,
      drop,
      cur: dl.cur ?? 0,
      prev: dl.prev ?? 0,
      mom: dl.mom ?? calculateMoM(dl.cur ?? 0, dl.prev ?? 0),
      children: dealerProducts,
      autoExpand,
      isMatch: isDealerMatch
    };
  };

  if (level === 'STATE') {
    // State level hierarchy: STATE -> DISTRICT -> DEALER -> PRODUCT
    const stateNorm = entityName.replace(/\s+/g, '');
    const stateDistricts = (fullData.districts || [])
      .filter(d => d.state && d.state.replace(/\s+/g, '').toUpperCase() === stateNorm);

    const districtChildren = stateDistricts
      .map(d => {
        const distImpactScore = d.impactScore ?? 0;
        const distSeverity = getSeverityFromImpactScore(distImpactScore);
        const distDrop = Math.max(0, (d.prev ?? 0) - (d.cur ?? 0));

        const dNorm = normalizeDistrict(d.district).toUpperCase();
        // Find ALL dealers in this district (both active declining and inactive)
        let distDealers = (fullData.dealers || [])
          .filter(dl => {
            const dlNorm = normalizeDistrict(dl.district).toUpperCase();
            return (dlNorm === dNorm || dl.district?.toUpperCase() === d.district?.toUpperCase()) && 
                   ((dl.prev ?? 0) > (dl.cur ?? 0) || (dl.prev ?? 0) > 0 || (dl.cur ?? 0) > 0);
          })
          .sort((a, b) => ((b.prev ?? 0) - (b.cur ?? 0)) - ((a.prev ?? 0) - (a.cur ?? 0)))
          .map(dl => buildDealerNode(dl, query.length > 0));

        // When a search query is active, filter precisely to matching dealer(s) in this district
        const hasMatchingDealer = query && distDealers.some(dl => dl.isMatch || (dl.name || '').toLowerCase().includes(query));
        const isDistNameMatch = query && (d.district || '').toLowerCase().includes(query);

        if (query) {
          if (hasMatchingDealer) {
            distDealers = distDealers.filter(dl => dl.isMatch || (dl.name || '').toLowerCase().includes(query));
          } else if (!isDistNameMatch) {
            return null; // Omit non-matching districts when searching
          }
        }

        // If district has dealers, dealers are the children
        // If district has no dealers in data, fallback to district products
        let children = distDealers;
        if (children.length === 0) {
          const distProducts = (d.products || [])
            .filter(p => (p.cur ?? 0) !== 0 || (p.prev ?? 0) !== 0)
            .map(p => ({
              type: 'PRODUCT',
              name: cleanName(p.product),
              severity: getSeverityFromImpactScore(p.impactScore ?? 0),
              impactScore: p.impactScore ?? 0,
              drop: (p.prev ?? 0) - (p.cur ?? 0),
              cur: p.cur ?? 0,
              prev: p.prev ?? 0,
              mom: p.mom ?? calculateMoM(p.cur ?? 0, p.prev ?? 0)
            }))
            .sort((a, b) => b.drop - a.drop);
          children = distProducts;
        }

        if (distDrop === 0 && children.length === 0) return null;

        return {
          type: 'DISTRICT',
          name: cleanName(d.district),
          severity: distSeverity,
          impactScore: distImpactScore,
          drop: distDrop,
          cur: d.cur ?? 0,
          prev: d.prev ?? 0,
          mom: d.mom ?? calculateMoM(d.cur ?? 0, d.prev ?? 0),
          children,
          autoExpand: Boolean(query.length > 0)
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.drop - a.drop);

    if (districtChildren.length === 0) return null;

    return {
      type: 'STATE',
      name: cleanName(alert.state || entityName),
      children: districtChildren,
      severity: getWorstSeverity(districtChildren),
      impactScore: getWorstImpactScore(districtChildren),
      autoExpand: Boolean(query.length > 0)
    };
  }

  if (level === 'DISTRICT') {
    // District level hierarchy: DISTRICT -> DEALER -> PRODUCT
    const rawMatch = rawEntityName.split(',')[0].trim();
    const matchNorm = normalizeDistrict(rawMatch).toUpperCase();
    
    // Find all dealers in this district
    let distDealers = (fullData.dealers || [])
      .filter(dl => {
        const dlNorm = normalizeDistrict(dl.district).toUpperCase();
        return (dlNorm === matchNorm || dl.district?.toUpperCase() === rawMatch.toUpperCase()) && 
               ((dl.prev ?? 0) > (dl.cur ?? 0) || (dl.prev ?? 0) > 0 || (dl.cur ?? 0) > 0);
      })
      .sort((a, b) => ((b.prev ?? 0) - (b.cur ?? 0)) - ((a.prev ?? 0) - (a.cur ?? 0)))
      .map(dl => buildDealerNode(dl, query.length > 0));

    if (query) {
      const hasMatchingDealer = distDealers.some(dl => dl.isMatch || (dl.name || '').toLowerCase().includes(query));
      if (hasMatchingDealer) {
        distDealers = distDealers.filter(dl => dl.isMatch || (dl.name || '').toLowerCase().includes(query));
      }
    }

    let children = distDealers;
    if (children.length === 0) {
      const distObj = (fullData.districts || []).find(d => {
        const dNorm = normalizeDistrict(d.district).toUpperCase();
        return dNorm === matchNorm || d.district?.toUpperCase() === rawMatch.toUpperCase();
      });
      const products = (distObj?.products || [])
        .filter(p => (p.cur ?? 0) !== 0 || (p.prev ?? 0) !== 0)
        .sort((a, b) => ((b.prev ?? 0) - (b.cur ?? 0)) - ((a.prev ?? 0) - (a.cur ?? 0)))
        .map(p => ({
          type: 'PRODUCT',
          name: cleanName(p.product),
          severity: getSeverityFromImpactScore(p.impactScore ?? 0),
          impactScore: p.impactScore ?? 0,
          drop: (p.prev ?? 0) - (p.cur ?? 0),
          cur: p.cur ?? 0,
          prev: p.prev ?? 0,
          mom: p.mom ?? calculateMoM(p.cur ?? 0, p.prev ?? 0)
        }));
      children = products;
    }

    if (children.length === 0) return null;

    return {
      type: 'DISTRICT',
      name: cleanName(alert.district || rawMatch),
      children,
      severity: getWorstSeverity(children),
      impactScore: getWorstImpactScore(children),
      autoExpand: Boolean(query.length > 0)
    };
  }

  return null;
};

// ── Contextual Recommendation Generator (dispatch alerts) ────────────────────
const generateRecommendation = (alert) => {
  const impactScore = alert.data?.impactScore ?? alert.impactScore ?? 0;
  const sev = alert.severity || alert.data?.severity || getSeverityFromImpactScore(impactScore);
  const lvl = (alert.level || alert.category || '').toUpperCase();
  const rawMom = alert.data?.mom ?? alert.mom;
  const cur = alert.data?.cur ?? alert.cur ?? 0;
  const prev = alert.data?.prev ?? alert.prev ?? 0;
  const mom = rawMom != null ? rawMom : calculateMoM(cur, prev);
  
  if (sev === 'CRITICAL') {
    return "Escalate to regional leadership for immediate intervention. Verify supply lines and dealer operational status within 24 hours.";
  }
  if (lvl === 'STATE') {
    if (mom < -15) return "Review state-wide sales execution and major dealer inactivity trends. Re-allocate inventory if demand is structurally shifting.";
    return "Monitor state-level dispatch velocity and check for systemic logistics or pricing issues.";
  }
  if (lvl === 'DISTRICT') {
    return "Investigate district-level dispatch bottlenecks and local dealer performance anomalies.";
  }
  if (lvl === 'DEALER') {
    if (mom <= -50) return "Contact dealer immediately to verify operational or inventory issues. Prevent full churn.";
    return "Review dealer incentive alignment and competitor pricing pressure in the locality.";
  }
  if (lvl === 'PRODUCT') {
    return "Audit production allocation and regional supply chain pipelines for this product line.";
  }
  return "Review related operational metrics and investigate supply vs demand imbalances.";
};

// ── Risk dealer helpers (absorbed from RiskExplorer) ─────────────────────────
function getRiskColor(severity) {
  if (severity === 'CRITICAL') return { text: 'text-severity-critical', bg: 'bg-severity-critical/10', border: 'border-severity-critical/30', hex: '#ef4444' };
  if (severity === 'HIGH') return { text: 'text-severity-high', bg: 'bg-severity-high/10', border: 'border-severity-high/30', hex: '#f97316' };
  if (severity === 'MEDIUM') return { text: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', hex: '#eab308' };
  return { text: 'text-accent-blue', bg: 'bg-accent-blue/10', border: 'border-accent-blue/30', hex: '#3b82f6' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING ORDER RISK SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
// This is a COMPLETELY SEPARATE scoring system from dispatch alerts.
// Dispatch alerts measure: MoM despatch decline (cur vs prev).
// Pending risk measures: backlog age, fulfillment capacity, stuck orders.
// ═══════════════════════════════════════════════════════════════════════════════

const PENDING_SEVERITY_THRESHOLDS = { CRITICAL: 70, HIGH: 45, MEDIUM: 25 };

function getPendingSeverity(score) {
  if (score >= PENDING_SEVERITY_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= PENDING_SEVERITY_THRESHOLDS.HIGH) return 'HIGH';
  if (score >= PENDING_SEVERITY_THRESHOLDS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function computePendingRiskScore(dealer) {
  const pendingQty = dealer.pendingQty ?? 0;
  if (pendingQty <= 0) return { riskScore: 0, severity: 'LOW', backlogAgeDays: 0, fulfillmentRatio: 0, clearanceDays: 0, pendingMonths: 0, oldestMonth: null };

  const now = new Date();
  const pendingHistory = dealer.pendingHistory || {};
  const historyMonths = Object.keys(pendingHistory).sort();
  const pendingMonths = historyMonths.length;

  // 1. BACKLOG AGE (30% weight) — days since oldest pending order month
  let backlogAgeDays = 0;
  let oldestMonth = null;
  if (historyMonths.length > 0) {
    oldestMonth = historyMonths[0];
    const oldestDate = new Date(oldestMonth + '-01');
    backlogAgeDays = Math.max(0, Math.round((now - oldestDate) / (1000 * 60 * 60 * 24)));
  } else {
    backlogAgeDays = 30; // assume ~1 month if no history
  }
  // Score: 0-30d = 0-40, 31-60d = 40-75, 61-90d = 75-100, 90d+ = 100
  let ageScore = 0;
  if (backlogAgeDays >= 90) ageScore = 100;
  else if (backlogAgeDays >= 60) ageScore = 75 + ((backlogAgeDays - 60) / 30) * 25;
  else if (backlogAgeDays >= 30) ageScore = 40 + ((backlogAgeDays - 30) / 30) * 35;
  else ageScore = (backlogAgeDays / 30) * 40;

  // 2. CLEARANCE RUNWAY (40% weight) — days to clear backlog at current dispatch rate
  const dailyRate = dealer.currentDailyRate ?? dealer.dailyAvgQty ?? 0;
  let clearanceDays = 999;
  let runwayScore = 0;
  
  if (dailyRate <= 0) {
    clearanceDays = 999;
    runwayScore = pendingQty > 0 ? 100 : 0;
  } else {
    clearanceDays = Math.round(pendingQty / dailyRate);
    // Score: 0-7 days = 0-30, 8-15 days = 30-70, 16-30 days = 70-90, 30+ days = 90-100
    if (clearanceDays >= 30) runwayScore = 90 + Math.min(10, ((clearanceDays - 30) / 30) * 10);
    else if (clearanceDays >= 15) runwayScore = 70 + ((clearanceDays - 15) / 15) * 20;
    else if (clearanceDays >= 7) runwayScore = 30 + ((clearanceDays - 7) / 8) * 40;
    else runwayScore = (clearanceDays / 7) * 30;
  }

  // 3. STRATEGIC CLIENT VOLUME WEIGHT (30% weight) — size/importance of the dealer
  const dailyAvg = dealer.dailyAvgQty ?? 0;
  let clientVolumeWeightScore = 0;
  // Score: 0-5 MT/d = 0-30, 5-20 MT/d = 30-70, 20-50 MT/d = 70-100, 50+ MT/d = 100
  if (dailyAvg >= 50) clientVolumeWeightScore = 100;
  else if (dailyAvg >= 20) clientVolumeWeightScore = 70 + ((dailyAvg - 20) / 30) * 30;
  else if (dailyAvg >= 5) clientVolumeWeightScore = 30 + ((dailyAvg - 5) / 15) * 40;
  else clientVolumeWeightScore = (dailyAvg / 5) * 30;

  // WEIGHTED COMPOSITE
  let riskScore = (runwayScore * 0.40) + (ageScore * 0.30) + (clientVolumeWeightScore * 0.30);

  // CRITICAL FLOOR: zero dispatch + significant pending + aged = guaranteed critical
  const cur = dealer.cur ?? 0;
  if (cur === 0 && pendingQty >= 50 && backlogAgeDays >= 60) {
    riskScore = Math.max(riskScore, 75);
  }
  // HIGH FLOOR: zero dispatch + any meaningful pending
  if (cur === 0 && pendingQty >= 20) {
    riskScore = Math.max(riskScore, 50);
  }

  riskScore = Math.min(100, Math.round(riskScore));
  const severity = getPendingSeverity(riskScore);

  const monthlyCapacity = dailyAvg > 0 ? dailyAvg * 30 : (dealer.prev > 0 ? dealer.prev : 1);
  const fulfillmentRatio = pendingQty / monthlyCapacity;

  return { riskScore, severity, backlogAgeDays, fulfillmentRatio: Math.round(fulfillmentRatio * 100) / 100, clearanceDays, pendingMonths, oldestMonth };
}

function getPendingImpactSummary(dealer) {
  const { cur, pendingQty, pendingRisk } = dealer;
  const pendingStr = formatNum(pendingQty);
  const ageStr = pendingRisk.backlogAgeDays;

  if (pendingRisk.severity === 'CRITICAL') {
    if (cur === 0) {
      return `⚠️ Stuck Orders: ${pendingStr} MT pending with ZERO dispatch activity. Oldest order is ${ageStr} days old. At current rate, clearance is impossible — immediate intervention required.`;
    }
    return `⚠️ Severe Backlog: ${pendingStr} MT pending, aging ${ageStr} days. Current dispatch rate can only clear ${formatNum(dealer.dailyAvgQty)} MT/day — estimated ${pendingRisk.clearanceDays} days to clear at this pace.`;
  }
  if (pendingRisk.severity === 'HIGH') {
    return `${pendingStr} MT pending orders aging ${ageStr} days. Fulfillment ratio is ${pendingRisk.fulfillmentRatio}x monthly capacity. ${cur === 0 ? 'No volume shipped this period.' : `Current volume: ${formatNum(cur)} MT this period.`}`;
  }
  if (pendingRisk.severity === 'MEDIUM') {
    return `${pendingStr} MT pending with ${ageStr}-day backlog. ${pendingRisk.fulfillmentRatio <= 1 ? 'Volume is within monthly capacity but needs monitoring.' : `Volume exceeds monthly capacity by ${pendingRisk.fulfillmentRatio}x.`}`;
  }
  return `${pendingStr} MT pending — recent orders within normal fulfillment cycle. No immediate risk.`;
}

function generatePendingRecommendation(dealer) {
  const { pendingRisk } = dealer;
  if (!pendingRisk) return 'Review pending order status.';

  if (pendingRisk.severity === 'CRITICAL') {
    if (dealer.cur === 0) {
      return 'URGENT: Escalate to operations leadership. Dealer has zero dispatch with significant stuck orders. Verify supply chain blockage, credit holds, or dealer operational shutdown. Contact within 24 hours.';
    }
    if (pendingRisk.backlogAgeDays >= 90) {
      return 'Aged Backlog: Orders pending 90+ days indicate systemic fulfillment failure. Investigate production allocation, logistics bottleneck, or order cancellation eligibility. Engage supply chain team.';
    }
    return 'High Volume Backlog: Pending orders exceed fulfillment capacity significantly. Prioritize dispatch allocation, consider splitting orders across production batches, or negotiate revised delivery timelines.';
  }
  if (pendingRisk.severity === 'HIGH') {
    if (pendingRisk.pendingMonths >= 3) {
      return 'Recurring Backlog: Pending orders spanning 3+ months suggest persistent capacity mismatch. Review dealer ordering patterns vs actual fulfillment capability. Consider adjusting order acceptance criteria.';
    }
    return 'Monitor Closely: Pending volume is building up relative to dispatch capacity. Ensure priority allocation in next production cycle. Follow up with logistics for dispatch scheduling.';
  }
  if (pendingRisk.severity === 'MEDIUM') {
    return 'Moderate pending volume — ensure orders are queued for next dispatch cycle. Track clearance progress weekly. No immediate escalation needed.';
  }
  return 'Pending orders are within normal fulfillment cycle. Continue standard dispatch operations.';
}

// ── Scatter chart tooltip for pending risk ───────────────────────────────────
const PendingChartTooltipContent = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const d = data.dealer;
    if (!d) return null;
    return (
      <div className="glass-card p-3 border border-border/85 text-[10px] shadow-xl min-w-[200px] bg-bg-secondary">
        <div className="font-bold text-text-primary mb-2 truncate text-[11px]">{d.client}</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">Backlog Age:</span>
            <span className="font-semibold text-text-primary">{d.pendingRisk?.backlogAgeDays ?? 0} Days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Pending Volume (MT):</span>
            <span className="font-semibold text-text-primary">{formatNum(d.pendingQty)} MT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Backlog vs Capacity:</span>
            <span className="font-semibold text-text-primary">{d.pendingRisk?.fulfillmentRatio ?? 0}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Priority:</span>
            <span className="font-bold" style={{ color: getRiskColor(d.pendingRisk?.severity || 'LOW').hex }}>{getBusinessPriority(d.pendingRisk?.severity || 'LOW').label}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// ── Legacy scatter tooltip (for dispatch expanded detail) ────────────────────
const MiniChartTooltipContent = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const d = data.dealer;
    if (!d) return null;
    return (
      <div className="glass-card p-2 border border-border/85 text-[10px] shadow-xl min-w-[160px] bg-bg-secondary">
        <div className="font-bold text-text-primary mb-1 truncate">{d.client}</div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Drop:</span>
          <span className="font-semibold text-text-primary">{data.y}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Inactive:</span>
          <span className="font-semibold text-text-primary">{data.x} Days</span>
        </div>
      </div>
    );
  }
  return null;
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function AlertIntelligence() {
  const { data, rawData, loading, error, filterOptions } = useData();

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('DISPATCH'); // 'DISPATCH' | 'RISK'

  // ── Paging state (for RISK view) ──────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // ── Common state ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── SEPARATED severity filters (dispatch and risk are independent) ────────
  const [dispatchSeverityFilter, setDispatchSeverityFilter] = useState('ALL');
  const [riskSeverityFilter, setRiskSeverityFilter] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [expandedRows, setExpandedRows] = useState(new Set());

  // ── Dealer notes (absorbed from RiskExplorer) ──────────────────────────────
  const [dealerNotes, setDealerNotes] = useState({});
  const [noteTexts, setNoteTexts] = useState({}); // keyed by dealer client name

  const handleSaveNote = (client) => {
    const text = (noteTexts[client] || '').trim();
    if (!text) return;
    const newNote = { id: Date.now(), text, timestamp: new Date().toISOString() };
    setDealerNotes(prev => {
      const notes = prev[client] || [];
      return { ...prev, [client]: [newNote, ...notes] };
    });
    setNoteTexts(prev => ({ ...prev, [client]: '' }));
  };

  const handleDeleteNote = (client, noteId) => {
    setDealerNotes(prev => {
      const notes = (prev[client] || []).filter(n => n.id !== noteId);
      const updated = { ...prev };
      if (notes.length === 0) delete updated[client];
      else updated[client] = notes;
      return updated;
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPATCH ALERTS DATA
  // ═══════════════════════════════════════════════════════════════════════════
  const alerts = useMemo(() => {
    if (!rawData || !rawData.alerts) return [];
    return rawData.alerts.map((alert, idx) => {
      let productStr = alert.product || alert.products || alert.data?.product || '';
      if (!productStr) {
        const level = (alert.level || alert.category || '').toUpperCase();
        const stateName = (alert.state || '').toUpperCase();
        const districtName = (alert.district || '').toUpperCase();
        let products = [];
        if (level === 'STATE' && stateName) {
          const stateObj = (rawData.states || []).find(s => s.state?.toUpperCase() === stateName);
          products = stateObj?.products || [];
        } else if (level === 'DISTRICT' && districtName) {
          const distObj = (rawData.districts || []).find(d => d.district?.toUpperCase() === districtName && d.state?.toUpperCase() === stateName);
          products = distObj?.products || [];
        } else if (level === 'OVERALL') {
          products = rawData.products || [];
        }
        const decliningProds = products.filter(p => (p.cur ?? 0) < (p.prev ?? 0)).map(p => p.product);
        productStr = decliningProds.join(', ');
      }
      return { ...alert, _originalIdx: idx, product: productStr, products: productStr };
    });
  }, [rawData]);

  const alertSeverityMap = useMemo(() => {
    return alerts.map(alert => {
      const impactScore = alert.data?.impactScore ?? alert.impactScore ?? 0;
      const severity = alert.severity || alert.data?.severity || getSeverityFromImpactScore(impactScore);
      return { severity, impactScore };
    });
  }, [alerts]);

  // Responsive alerts list for counts (applies all filters EXCEPT selectedSeverity)
  const filteredAlertsForCounts = useMemo(() => {
    return alerts.filter((alert) => {
      const query = (debouncedSearchQuery || '').trim().toLowerCase();
      if (query) {
        const searchable = `${alert.dealer || alert.client || ''} ${alert.district || ''} ${alert.state || ''} ${alert.products || alert.product || ''} ${alert.reason || alert.title || ''}`.toLowerCase();
        let matchesQuery = searchable.includes(query);

        if (!matchesQuery) {
          const level = (alert.level || alert.category || '').toUpperCase();
          const alertState = (alert.state || alert.data?.state || '').toUpperCase();
          const alertDist = (alert.district || alert.data?.district || '').toUpperCase();
          const normDist = normalizeDistrict(alertDist).toUpperCase();

          const hasDealerMatch = (rawData?.dealers || []).some(dl => {
            if (!dl.client?.toLowerCase().includes(query)) return false;
            if (level === 'STATE') {
              return (dl.state || '').toUpperCase() === alertState;
            }
            if (level === 'DISTRICT') {
              const dlDistNorm = normalizeDistrict(dl.district).toUpperCase();
              return dlDistNorm === normDist || (dl.district || '').toUpperCase() === alertDist;
            }
            return false;
          });
          if (hasDealerMatch) matchesQuery = true;
        }

        if (!matchesQuery) return false;
      }

      const level = alert.level || alert.category || 'OVERALL';
      if (selectedLevel !== 'ALL' && level.toUpperCase() !== selectedLevel) return false;

      const alertState = alert.state || alert.data?.state || '';
      if (selectedState !== 'ALL' && alertState !== selectedState) return false;

      if (selectedProduct !== 'ALL') {
        const alertProd = alert.product || alert.products || alert.data?.product || '';
        if (Array.isArray(alertProd)) { if (!alertProd.includes(selectedProduct)) return false; }
        else if (typeof alertProd === 'string') { if (!alertProd.includes(selectedProduct)) return false; }
        else return false;
      }
      return true;
    });
  }, [alerts, rawData, debouncedSearchQuery, selectedLevel, selectedState, selectedProduct]);

  // Counts update dynamically based on filteredAlertsForCounts
  const dispatchCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    filteredAlertsForCounts.forEach(alert => {
      const originalIdx = alert._originalIdx;
      const precomputed = alertSeverityMap[originalIdx];
      const severity = precomputed?.severity || alert.severity || 'LOW';
      if (severity === 'CRITICAL') c.critical++;
      else if (severity === 'HIGH') c.high++;
      else if (severity === 'MEDIUM') c.medium++;
      else c.low++;
    });
    return c;
  }, [filteredAlertsForCounts, alertSeverityMap]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RISK DEALERS DATA — uses PENDING ORDER RISK SCORING (not dispatch MoM)
  // ═══════════════════════════════════════════════════════════════════════════
  const processedDealers = useMemo(() => {
    if (!rawData || !rawData.dealers) return [];
    return rawData.dealers
      .filter(d => (d.pendingQty ?? 0) > 0) // Only dealers with pending orders appear in Risk tab
      .map(d => {
        const cur = d.cur ?? 0;
        const prev = d.prev ?? 0;
        const pendingQty = d.pendingQty ?? 0;
        const pendingRisk = computePendingRiskScore(d);

        return {
          ...d,
          cur,
          prev,
          pendingQty,
          pendingRisk,
          severity: pendingRisk.severity,
          riskScore: pendingRisk.riskScore,
          _type: 'RISK',
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore); // Sort by pending risk score descending
  }, [rawData]);

  // Responsive risk list for counts (applies state and search query filters only, NOT severity)
  const filteredDealersForCounts = useMemo(() => {
    return processedDealers.filter(d => {
      const query = (debouncedSearchQuery || '').trim().toLowerCase();
      const searchable = `${d.client || ''} ${d.district || ''} ${d.state || ''}`.toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (selectedState !== 'ALL' && d.state !== selectedState) return false;
      return true;
    });
  }, [processedDealers, debouncedSearchQuery, selectedState]);

  const riskCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    filteredDealersForCounts.forEach(d => {
      if (d.severity === 'CRITICAL') c.critical++;
      else if (d.severity === 'HIGH') c.high++;
      else if (d.severity === 'MEDIUM') c.medium++;
      else c.low++;
    });
    return c;
  }, [filteredDealersForCounts]);

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED FILTERS
  // ═══════════════════════════════════════════════════════════════════════════
  const uniqueStates = useMemo(() => {
    if (filterOptions?.states?.length > 0) {
      return filterOptions.states;
    }
    const states = new Set();
    if (viewMode !== 'RISK') {
      alerts.forEach(a => {
        const st = a.state || a.data?.state;
        if (st) states.add(st);
      });
    }
    if (viewMode !== 'DISPATCH') {
      processedDealers.forEach(d => { if (d.state) states.add(d.state); });
    }
    return Array.from(states).sort();
  }, [alerts, processedDealers, viewMode, filterOptions]);

  const uniqueProducts = useMemo(() => {
    const prods = new Set();
    if (viewMode !== 'RISK') {
      alerts.forEach(a => {
        const val = a.product || a.products || a.data?.product || '';
        if (Array.isArray(val)) val.forEach(p => prods.add(p));
        else if (typeof val === 'string') val.split(/[\s,]+/).forEach(p => { const t = p.trim(); if (t) prods.add(t); });
      });
    }
    return Array.from(prods).sort();
  }, [alerts, viewMode]);

  // ── Filtered dispatch alerts (uses dispatchSeverityFilter ONLY) ─────────────
  const filteredAlerts = useMemo(() => {
    if (viewMode === 'RISK') return [];
    return alerts.filter((alert, originalIdx) => {
      const query = (debouncedSearchQuery || '').trim().toLowerCase();
      if (query) {
        const searchable = `${alert.dealer || alert.client || ''} ${alert.district || ''} ${alert.state || ''} ${alert.products || alert.product || ''} ${alert.reason || alert.title || ''}`.toLowerCase();
        let matchesQuery = searchable.includes(query);

        if (!matchesQuery) {
          const level = (alert.level || alert.category || '').toUpperCase();
          const alertState = (alert.state || alert.data?.state || '').toUpperCase();
          const alertDist = (alert.district || alert.data?.district || '').toUpperCase();
          const normDist = normalizeDistrict(alertDist).toUpperCase();

          const hasDealerMatch = (rawData?.dealers || []).some(dl => {
            if (!dl.client?.toLowerCase().includes(query)) return false;
            if (level === 'STATE') {
              return (dl.state || '').toUpperCase() === alertState;
            }
            if (level === 'DISTRICT') {
              const dlDistNorm = normalizeDistrict(dl.district).toUpperCase();
              return dlDistNorm === normDist || (dl.district || '').toUpperCase() === alertDist;
            }
            return false;
          });
          if (hasDealerMatch) matchesQuery = true;
        }

        if (!matchesQuery) return false;
      }

      const derivedSev = alertSeverityMap[originalIdx]?.severity || alert.severity || 'LOW';
      if (dispatchSeverityFilter !== 'ALL' && derivedSev !== dispatchSeverityFilter) return false;

      const level = alert.level || alert.category || 'OVERALL';
      if (selectedLevel !== 'ALL' && level.toUpperCase() !== selectedLevel) return false;

      const alertState = alert.state || alert.data?.state || '';
      if (selectedState !== 'ALL' && alertState !== selectedState) return false;

      if (selectedProduct !== 'ALL') {
        const alertProd = alert.product || alert.products || alert.data?.product || '';
        if (Array.isArray(alertProd)) { if (!alertProd.includes(selectedProduct)) return false; }
        else if (typeof alertProd === 'string') { if (!alertProd.includes(selectedProduct)) return false; }
        else return false;
      }
      return true;
    });
  }, [alerts, rawData, debouncedSearchQuery, dispatchSeverityFilter, selectedLevel, selectedState, selectedProduct, alertSeverityMap, viewMode]);

  // ── Filtered risk dealers (uses riskSeverityFilter ONLY) ───────────────────
  const filteredDealers = useMemo(() => {
    if (viewMode === 'DISPATCH') return [];
    return processedDealers.filter(d => {
      const query = (debouncedSearchQuery || '').trim().toLowerCase();
      const searchable = `${d.client || ''} ${d.district || ''} ${d.state || ''}`.toLowerCase();
      if (query && !searchable.includes(query)) return false;

      if (selectedState !== 'ALL' && d.state !== selectedState) return false;

      // Pending risk severity filter — uses independent riskSeverityFilter
      if (riskSeverityFilter !== 'ALL' && d.severity !== riskSeverityFilter) return false;

      return true;
    });
  }, [processedDealers, debouncedSearchQuery, selectedState, riskSeverityFilter, viewMode]);

  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD UNIFIED ROWS
  // ═══════════════════════════════════════════════════════════════════════════
  const unifiedRows = useMemo(() => {
    const dispatchRows = filteredAlerts.map(alert => {
      const originalIdx = alert._originalIdx ?? 0;
      const precomputed = alertSeverityMap[originalIdx] || { severity: 'LOW', impactScore: 0 };
      return {
        _type: 'DISPATCH',
        _source: alert,
        _originalIdx: originalIdx,
        severity: precomputed.severity,
        impactScore: precomputed.impactScore,
        level: (alert.level || alert.category || 'OVERALL').toUpperCase(),
        entityName: alert.dealer || alert.district || alert.state || alert.product || alert.products || (alert.title ? alert.title.split(':')[0] : 'Unknown'),
      };
    });

    const riskRows = filteredDealers.map(dealer => ({
      _type: 'RISK',
      _source: dealer,
      severity: dealer.severity,
      impactScore: dealer.riskScore,
      level: 'DEALER',
      entityName: dealer.client || 'Unknown',
    }));

    const all = [...dispatchRows, ...riskRows];
    return all.sort((a, b) => {
      const rankDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
      if (rankDiff !== 0) return rankDiff;
      return (b.impactScore || 0) - (a.impactScore || 0);
    });
  }, [filteredAlerts, filteredDealers, alerts, alertSeverityMap]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SCATTER CHART DATA — Pending Risk: X=Backlog Age, Y=Pending Volume
  // ═══════════════════════════════════════════════════════════════════════════
  const allRiskChartData = useMemo(() => {
    return processedDealers.slice(0, 50).map(d => ({
      x: d.pendingRisk?.backlogAgeDays ?? 0,
      y: d.pendingQty ?? 0,
      z: Math.max(12, d.riskScore ?? 0),
      severity: d.severity,
      fill: getRiskColor(d.severity).hex,
      dealer: d,
      name: d.client,
    }));
  }, [processedDealers]);

  // ── Toggle / expand helpers ────────────────────────────────────────────────
  const toggleRow = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) newExpanded.delete(index);
    else newExpanded.add(index);
    setExpandedRows(newExpanded);
  };

  const getIndentLevel = (alert) => {
    const lvl = (alert.level || alert.category || '').toUpperCase();
    if (lvl === 'DISTRICT') return 1;
    if (lvl === 'DEALER') return 2;
    return 0;
  };

  // Pagination calculation
  const paginatedRows = useMemo(() => {
    if (viewMode !== 'RISK') return unifiedRows;
    const startIndex = (currentPage - 1) * pageSize;
    return unifiedRows.slice(startIndex, startIndex + pageSize);
  }, [unifiedRows, currentPage, viewMode]);

  // Auto-expand rows when search query is active so hierarchy is immediately visible
  useEffect(() => {
    setCurrentPage(1);
    if (debouncedSearchQuery && debouncedSearchQuery.trim().length >= 2) {
      const indices = new Set();
      for (let i = 0; i < Math.min(25, paginatedRows.length); i++) {
        indices.add(i);
      }
      setExpandedRows(indices);
    } else {
      setExpandedRows(new Set());
    }
  }, [debouncedSearchQuery, selectedState, dispatchSeverityFilter, riskSeverityFilter, selectedLevel, selectedProduct, viewMode, paginatedRows.length]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-4">
        <SkeletonLoader variant="kpi" count={1} className="w-48 h-16" />
        <div className="flex gap-3">
          <SkeletonLoader variant="kpi" count={4} className="w-24 h-16 flex-row" />
        </div>
      </div>
      <div className="glass-card shadow-lg">
        <SkeletonLoader variant="table-row" count={6} />
      </div>
    </div>
  );
  if (error) return <div className="text-center text-severity-critical py-12">Error: {error}</div>;

  // ── Active counts for current view ─────────────────────────────────────────
  const totalActive = viewMode === 'DISPATCH'
    ? (dispatchCounts.critical + dispatchCounts.high + dispatchCounts.medium + dispatchCounts.low)
    : (riskCounts.critical + riskCounts.high + riskCounts.medium + riskCounts.low);

  return (
    <div className="animate-fade-in max-w-6xl mx-auto space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-4xl font-extrabold text-text-primary flex items-center gap-3 mb-2">
            <Activity className="w-7 h-7 text-accent-blue" />
            Alerts & Risks
          </h2>
        </div>
      </div>

      {/* ROW CONTAINING KPI PILLS (LEFT) AND SEGMENTED TOGGLE (RIGHT) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full">
        {/* KPI PILLS — BUSINESS GRADE COMPACT PILL DESIGN */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Total Active Pill */}
          <div
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border kpi-pill-total text-xs shadow-xs"
          >
            <Activity className="w-3.5 h-3.5 text-accent-blue" />
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {viewMode === 'DISPATCH' ? 'Dispatch Alerts' : 'At-Risk Dealers'}
            </span>
            <span className="font-extrabold text-xs px-2 py-0.5 rounded-full kpi-count-total">
              {totalActive}
            </span>
          </div>

          {/* Severity Pills — adapt per view mode */}
          {viewMode === 'DISPATCH' ? (
            <>
              {/* Critical */}
              <button
                onClick={() => setDispatchSeverityFilter(dispatchSeverityFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                  dispatchSeverityFilter === 'CRITICAL'
                    ? 'kpi-pill-critical-active'
                    : 'kpi-pill-critical'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-severity-critical animate-pulse-subtle"></div>
                <span className="text-[11px] uppercase tracking-wider font-bold">Critical</span>
                <span className="font-extrabold text-xs px-1.5 py-0.5 rounded-full kpi-count-critical">
                  {dispatchCounts.critical}
                </span>
              </button>

              {/* High */}
              <button
                onClick={() => setDispatchSeverityFilter(dispatchSeverityFilter === 'HIGH' ? 'ALL' : 'HIGH')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                  dispatchSeverityFilter === 'HIGH'
                    ? 'kpi-pill-high-active'
                    : 'kpi-pill-high'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-[#f97316]"></div>
                <span className="text-[11px] uppercase tracking-wider font-bold">High</span>
                <span className="font-extrabold text-xs px-1.5 py-0.5 rounded-full kpi-count-high">
                  {dispatchCounts.high}
                </span>
              </button>

              {/* Moderate */}
              <button
                onClick={() => setDispatchSeverityFilter(dispatchSeverityFilter === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                  dispatchSeverityFilter === 'MEDIUM'
                    ? 'kpi-pill-medium-active'
                    : 'kpi-pill-medium'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
                <span className="text-[11px] uppercase tracking-wider font-bold">Moderate</span>
                <span className="font-extrabold text-xs px-1.5 py-0.5 rounded-full kpi-count-medium">
                  {dispatchCounts.medium}
                </span>
              </button>
            </>
          ) : (
            <>
              {[
                { key: 'CRITICAL', label: 'Critical', dotColor: '#ef4444', count: riskCounts.critical, activeClass: 'kpi-pill-critical-active', inactiveClass: 'kpi-pill-critical', countClass: 'kpi-count-critical' },
                { key: 'HIGH', label: 'High', dotColor: '#f97316', count: riskCounts.high, activeClass: 'kpi-pill-high-active', inactiveClass: 'kpi-pill-high', countClass: 'kpi-count-high' },
                { key: 'MEDIUM', label: 'Moderate', dotColor: '#eab308', count: riskCounts.medium, activeClass: 'kpi-pill-medium-active', inactiveClass: 'kpi-pill-medium', countClass: 'kpi-count-medium' },
              ].map(cfg => {
                const isActive = riskSeverityFilter === cfg.key;
                return (
                  <button
                    key={cfg.key}
                    onClick={() => setRiskSeverityFilter(isActive ? 'ALL' : cfg.key)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                      isActive ? cfg.activeClass : cfg.inactiveClass
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ background: cfg.dotColor }}></div>
                    <span className="text-[11px] uppercase tracking-wider font-bold">{cfg.label}</span>
                    <span className={`font-extrabold text-xs px-1.5 py-0.5 rounded-full ${cfg.countClass}`}>
                      {cfg.count}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* SEGMENTED TOGGLE */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-bg-secondary border border-border/40 metric-toggle-container shadow-inner shrink-0 self-start lg:self-auto w-fit">
          {[
            { key: 'DISPATCH', label: 'Dispatch', icon: TrendingDown },
            { key: 'RISK', label: 'Risk', icon: ShieldAlert },
          ].map(({ key, label, icon: Icon }) => {
            const isActive = viewMode === key;
            return (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border ${
                  isActive 
                    ? 'toggle-pill-active' 
                    : 'toggle-pill-inactive'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* COMBINED FILTER BAR & TABLE MODULE */}
      <div className="glass-card overflow-hidden flex flex-col shadow-lg shadow-black/20">
        
        {/* SMART FILTER BAR */}
        <div className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between border-b border-border bg-bg-card">
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full lg:w-auto flex-1">
            <div className="relative flex-1 w-full sm:w-auto md:max-w-xs min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input 
                type="text" 
                placeholder={viewMode === 'RISK' ? "Search dealers, locations..." : "Search alerts, dealers, locations..."} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input w-full bg-bg-input border-border/50 focus:border-accent-blue"
              />
            </div>
            
            {/* Level filter — hidden in RISK mode (always DEALER) */}
            {viewMode !== 'RISK' && (
              <select 
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="filter-select bg-bg-input border-border/50 text-xs w-full sm:w-32"
              >
                <option value="ALL">All Levels</option>
                <option value="STATE">State</option>
                <option value="DISTRICT">District</option>
              </select>
            )}

            <select 
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="filter-select bg-bg-input border-border/50 text-xs w-full sm:w-40"
            >
              {uniqueStates.length !== 1 && <option value="ALL">All States</option>}
              {uniqueStates.map(st => <option key={st} value={st}>{st}</option>)}
            </select>

            {/* Product filter — hidden in RISK mode */}
            {viewMode !== 'RISK' && (
              <select 
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="filter-select bg-bg-input border-border/50 text-xs w-full sm:w-40"
              >
                <option value="ALL">All Products</option>
                {uniqueProducts.map(pr => <option key={pr} value={pr}>{pr}</option>)}
              </select>
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs font-semibold text-text-muted whitespace-nowrap bg-bg-secondary px-3 py-1.5 rounded-lg border border-border/50">
              Showing {unifiedRows.length} results
            </span>
            {viewMode === 'RISK' && (
              <div className="flex items-center gap-2">
<button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-2.5 py-1.5 rounded-lg border border-border/50 text-xs font-bold bg-bg-input hover:border-accent-blue disabled:opacity-40 disabled:cursor-not-allowed text-text-primary cursor-pointer transition-all"
                  >
                    Previous
                   </button>
                 <span className="text-xs font-bold text-text-muted min-w-[70px] text-center">
                   Page {currentPage} of {Math.ceil(unifiedRows.length / pageSize) || 1}
                 </span>
                 <button
                   disabled={currentPage >= Math.ceil(unifiedRows.length / pageSize)}
                   onClick={() => setCurrentPage(prev => prev + 1)}
                    className="px-2.5 py-1.5 rounded-lg border border-border/50 text-xs font-bold bg-bg-input hover:border-accent-blue disabled:opacity-40 disabled:cursor-not-allowed text-text-primary cursor-pointer transition-all"
                  >
                    Next
                  </button>
               </div>
             )}
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto relative" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 600px' }}>
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-bg-secondary/95 backdrop-blur-sm border-b border-border shadow-sm">
              <tr className="text-xs uppercase tracking-wider text-text-muted">
                <th className="p-4 font-bold w-12 text-center"></th>
                <th className="p-4 font-bold">Severity</th>
                <th className="p-4 font-bold">Level</th>
                <th className="p-4 font-bold">Entity</th>
                <th className="p-4 font-bold text-right">{viewMode === 'RISK' ? 'Backlog Age' : 'MoM %'}</th>
                <th className="p-4 font-bold text-right hidden md:table-cell">{viewMode === 'RISK' ? 'Pending Vol' : 'MT Loss'}</th>
                <th className="p-4 font-bold text-right">{viewMode === 'RISK' ? 'Est. Clearance' : 'Pending Orders'}</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-border/30">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-text-muted">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No alerts match the selected filters.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => {
                  const isExpanded = expandedRows.has(idx);
                  const isDispatch = row._type === 'DISPATCH';
                  const source = row._source;

                  return (
                    <React.Fragment key={`${row._type}-${idx}`}>
                      {/* MAIN ROW */}
                      <tr 
                        onClick={() => toggleRow(idx)}
                        className={`table-row-separator hover:bg-bg-secondary/60 cursor-pointer transition-colors group ${isExpanded ? 'bg-bg-secondary/40' : ''}`}
                      >
                        <td className="p-4 text-text-muted text-center">
                          {isExpanded ? <ChevronDown className="w-4 h-4 mx-auto text-accent-blue" /> : <ChevronRight className="w-4 h-4 mx-auto group-hover:text-text-primary transition-colors" />}
                        </td>

                        {/* SEVERITY */}
                        <td className="p-4">
                          <SeverityBadge severity={row.severity} color={getSeverityTheme(row.severity).color} />
                        </td>

                        {/* LEVEL */}
                        <td className="p-4">
                          <span className="text-xs font-bold text-text-muted">{row.level}</span>
                        </td>

                        {/* ENTITY */}
                        <td className="p-4">
                          <div className="flex items-center gap-2" style={{ paddingLeft: isDispatch ? `${getIndentLevel(source) * 1.25}rem` : '0' }}>
                            {isDispatch && getIndentLevel(source) > 0 && <div className="w-3 h-px bg-border-accent opacity-50"></div>}
                            {row.level === 'PRODUCT' && <Target className="w-3.5 h-3.5 text-text-muted" />}
                            {row.level === 'STATE' && <Map className="w-3.5 h-3.5 text-text-muted" />}
                            {row.level === 'DISTRICT' && <Map className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                            {row.level === 'DEALER' && (isDispatch ? <Search className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0" />)}
                            <span className="font-medium text-text-primary break-words line-clamp-2">{row.entityName}</span>
                            {!isDispatch && source.district && (
                              <span className="text-[10px] text-text-muted hidden sm:inline">{source.district}, {source.state}</span>
                            )}
                          </div>
                        </td>

                        {/* BACKLOG AGE / MOM% */}
                        <td className="p-4 text-right font-medium whitespace-nowrap">
                          {isDispatch ? (
                            (() => {
                              const rawMom = source.data?.mom ?? source.mom;
                              if (rawMom != null) {
                                const color = rawMom < 0 ? '#ef4444' : rawMom > 0 ? '#22c55e' : '#9ca3af';
                                const icon = rawMom < 0 ? <TrendingDown className="w-4 h-4" /> : rawMom > 0 ? <TrendingUp className="w-4 h-4" /> : <Minus className="w-4 h-4" />;
                                return <span style={{ color }} className="flex items-center justify-end gap-1 font-extrabold text-sm font-mono">{icon}{rawMom > 0 ? '+' : ''}{rawMom}%</span>;
                              }
                              return <MoMIndicator cur={source.data?.cur ?? source.cur} prev={source.data?.prev ?? source.prev} className="font-extrabold text-sm" />;
                            })()
                          ) : (
                            <span className="flex items-center justify-end gap-1 font-extrabold text-sm font-mono">
                              <Clock className="w-4 h-4 text-text-muted" />
                              <span style={{ color: source.pendingRisk?.backlogAgeDays >= 90 ? '#ef4444' : source.pendingRisk?.backlogAgeDays >= 60 ? '#f97316' : source.pendingRisk?.backlogAgeDays >= 30 ? '#eab308' : 'var(--color-text-secondary)' }}>
                                {source.pendingRisk?.backlogAgeDays ?? 0} Days
                              </span>
                            </span>
                          )}
                        </td>

                        {/* MT LOSS / PENDING VOLUME */}
                        <td className="p-4 text-right whitespace-nowrap hidden md:table-cell">
                          {isDispatch ? (
                            <span className="mt-loss-val font-mono text-sm font-bold">
                              {source.drop ? formatNum(source.drop) : (source.data?.drop ? formatNum(source.data.drop) : '-')}
                            </span>
                          ) : (
                            <span className="mt-loss-val font-mono text-sm font-bold">
                              {formatNum(source.pendingQty)} MT
                            </span>
                          )}
                        </td>

                        {/* PENDING ORDERS / EST. CLEARANCE */}
                        <td className="p-4 text-right whitespace-nowrap">
                          {isDispatch ? (
                            (() => {
                              const pendingQty = getEntityPendingOrders(row, data);
                              if (!pendingQty || pendingQty <= 0) {
                                return <span className="text-text-muted font-medium text-sm">—</span>;
                              }
                              return (
                                <span className="pending-orders-val font-mono text-sm font-bold">
                                  {formatNum(pendingQty)} MT
                                </span>
                              );
                            })()
                          ) : (
                            (() => {
                              const cur = source.cur ?? 0;
                              const pending = source.pendingQty ?? 0;
                              const days = source.pendingRisk?.clearanceDays;
                              if (cur === 0 && pending > 0) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold clearance-stuck">
                                    Stuck (0 MT/d)
                                  </span>
                                );
                              }
                              if (days == null || isNaN(days)) {
                                return <span className="text-text-muted font-medium text-sm">—</span>;
                              }
                              if (days >= 90) {
                                return <span className="clearance-crit font-mono text-sm font-bold">{days} Days</span>;
                              }
                              if (days >= 60) {
                                return <span className="clearance-high font-mono text-sm font-bold">{days} Days</span>;
                              }
                              if (days >= 30) {
                                return <span className="clearance-med font-mono text-sm font-bold">{days} Days</span>;
                              }
                              return <span className="clearance-good font-mono text-sm font-bold">{days} Days</span>;
                            })()
                          )}
                        </td>
                      </tr>

                      {/* EXPANDED DETAIL */}
                      {isExpanded && (
                        isDispatch
                          ? renderDispatchDetail(source, row._originalIdx, data, viewMode, rawData, debouncedSearchQuery)
                          : renderRiskDetail(source, allRiskChartData, dealerNotes, noteTexts, setNoteTexts, handleSaveNote, handleDeleteNote, data, viewMode, rawData)
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DISPATCH EXPANDED ROW
// ═════════════════════════════════════════════════════════════════════════════
function renderDispatchDetail(alert, originalIdx, data, viewMode, rawData, searchQuery = '') {
  const fullData = rawData || data;
  const hierarchy = buildHierarchy(alert, fullData, searchQuery);
  const rec = generateRecommendation(alert);

  const level = (alert.level || alert.category || '').toUpperCase();
  const rawEntity = alert.dealer || alert.district || alert.state || (alert.title ? alert.title.split(':')[0].trim() : '') || '';
  const entityName = rawEntity.toUpperCase();
  const matchName = level === 'DISTRICT' ? entityName.split(',')[0].trim() : entityName;
  const normMatch = normalizeDistrict(matchName).toUpperCase();

  const targetStateName = alert.state || alert.data?.state || (level === 'STATE' ? (alert.entity || alert.title?.split(':')[0]?.trim() || entityName) : (
    (fullData?.districts || []).find(d => normalizeDistrict(d.district).toUpperCase() === normMatch || d.district?.toUpperCase() === matchName)?.state ||
    (fullData?.dealers || []).find(d => normalizeDistrict(d.district).toUpperCase() === normMatch || d.client?.toUpperCase() === entityName)?.state || ''
  ));
  const cleanStateName = targetStateName ? targetStateName.trim() : '';

  // Find active declining dealers in state/district carrying top volume (cur > 0)
  const maxDealers = level === 'STATE' ? 10 : 3;
  const decliningDealers = (fullData?.dealers || [])
    .filter(d => {
      const match = level === 'STATE' 
        ? (d.state && d.state.replace(/\s+/g, '').toUpperCase() === entityName.replace(/\s+/g, ''))
        : (normalizeDistrict(d.district).toUpperCase() === normMatch || d.district?.toUpperCase() === matchName);
      return match && (d.cur ?? 0) > 0 && (d.cur ?? 0) < (d.prev ?? 0);
    })
    .map(d => {
      let prods = [];
      if (Array.isArray(d.products)) {
        prods = d.products
          .map(p => {
            const name = cleanName(typeof p === 'string' ? p : (p.product || p.name || ''));
            const cur = typeof p === 'object' ? (p.cur ?? 0) : 0;
            const prev = typeof p === 'object' ? (p.prev ?? 0) : 0;
            const drop = prev > cur ? (prev - cur) : 0;
            const mom = typeof p === 'object' ? (p.mom ?? calculateMoM(cur, prev)) : null;
            return { name, cur, prev, drop, mom };
          })
          .filter(p => p.name)
          .sort((a, b) => b.drop - a.drop);
      } else if (typeof d.products === 'string') {
        prods = d.products.split(',').map(s => ({ name: cleanName(s) })).filter(p => p.name);
      }

      return {
        name: d.client,
        drop: d.prev - d.cur,
        mom: d.mom,
        cur: d.cur,
        prev: d.prev,
        products: prods
      };
    })
    .sort((a, b) => (b.prev ?? 0) - (a.prev ?? 0))
    .slice(0, maxDealers);

  // Find active products in state/district (both declining and growing)
  let productBreakdown = [];
  if (level === 'STATE') {
    const stateObj = (fullData?.states || []).find(s => s.state && s.state.replace(/\s+/g, '').toUpperCase() === entityName.replace(/\s+/g, ''));
    productBreakdown = (stateObj?.products || [])
      .filter(p => (p.cur ?? 0) !== 0 || (p.prev ?? 0) !== 0)
      .map(p => ({
        name: p.product,
        drop: (p.prev ?? 0) - (p.cur ?? 0),
        mom: p.mom ?? calculateMoM(p.cur ?? 0, p.prev ?? 0),
        cur: p.cur ?? 0,
        prev: p.prev ?? 0
      }))
      .sort((a, b) => b.drop - a.drop);
  } else if (level === 'DISTRICT') {
    const distObj = (fullData?.districts || []).find(d => normalizeDistrict(d.district).toUpperCase() === normMatch || d.district?.toUpperCase() === matchName);
    productBreakdown = (distObj?.products || [])
      .filter(p => (p.cur ?? 0) !== 0 || (p.prev ?? 0) !== 0)
      .map(p => ({
        name: p.product,
        drop: (p.prev ?? 0) - (p.cur ?? 0),
        mom: p.mom ?? calculateMoM(p.cur ?? 0, p.prev ?? 0),
        cur: p.cur ?? 0,
        prev: p.prev ?? 0
      }))
      .sort((a, b) => b.drop - a.drop);
  }

  return (
    <tr className="bg-bg-primary/40 shadow-inner overflow-hidden transition-all duration-300">
      <td colSpan={7} className="p-0 border-b border-border/50">
        <div className="p-4 md:p-6 md:pl-14 border-l-2 border-accent-blue ml-5 my-2 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT COLUMN */}
            <div className="space-y-6">
              {/* Operational Context */}
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  <FileText className="w-4 h-4" /> Operational Context
                </h4>
                <p className="text-base text-text-primary font-medium leading-relaxed bg-bg-card p-4 rounded-lg border border-border/50">
                  {alert.reason || alert.detail || alert.title || "Contextual details unavailable for this alert entity."}
                </p>
              </div>

              {/* Dynamic Root Cause Hierarchy */}
              {hierarchy && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                    <Layers className="w-4 h-4" /> Root Cause Hierarchy
                  </h4>
                  <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-base font-mono space-y-2">
                    <div className="flex items-center gap-2 text-text-primary font-bold text-base border-b border-border/40 pb-2">
                      {hierarchy.type === 'STATE' && <Map className="w-4 h-4 text-accent-blue" />}
                      {hierarchy.type === 'DISTRICT' && <Map className="w-4 h-4 text-accent-blue" />}
                      {hierarchy.type === 'DEALER' && <Search className="w-4 h-4 text-accent-blue" />}
                      {hierarchy.name}
                    </div>

                    {hierarchy.children.map((child, idx) => (
                      <HierarchyTreeNodeItem key={idx} node={child} depth={1} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-6">
              {/* Recommended Actions */}
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  <Briefcase className="w-4 h-4" /> Recommended Actions
                </h4>
                <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-base">
                  <div className="flex gap-3 items-start">
                    <Activity className={`w-5 h-5 shrink-0 mt-0.5 ${(() => { const c = alert.data?.cur ?? alert.cur ?? 0; const p = alert.data?.prev ?? alert.prev ?? 0; return getBusinessImpact(c, p).severity === 'CRITICAL' ? 'text-severity-critical' : 'text-accent-blue'; })()}`} />
                    <span className="text-text-primary leading-relaxed font-semibold text-base">{rec}</span>
                  </div>
                </div>
              </div>

              {/* Escalation Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase font-bold mb-1">Business Impact</div>
                  <div className="text-base font-bold text-text-primary">
                    {alert.drop ? `${formatNum(alert.drop)} MT Lost` : 'Pending Assessment'}
                  </div>
                </div>
                <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase font-bold mb-1">Product Portfolio</div>
                  <div className="text-base font-bold text-text-primary truncate" title={alert.products || alert.product || 'Multiple'}>
                    {alert.products || alert.product || 'Multiple'}
                  </div>
                </div>
              </div>

              {/* Top Active Declining Dealers (Actionable Insight in Right Space) */}
              {decliningDealers.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                    <TrendingDown className="w-4 h-4 text-severity-high" /> Top Volume Active Declining Dealers {level === 'STATE' ? (cleanStateName ? `— ${cleanStateName}` : '') : (matchName ? `— ${matchName}` : (cleanStateName ? `— ${cleanStateName}` : ''))}
                  </h4>
                  <div className="bg-bg-card border border-border/50 rounded-lg p-4 space-y-3.5">
                    {decliningDealers.map((d, i) => (
                      <div key={i} className="border-b border-border/30 last:border-0 pb-3 last:pb-0 space-y-1.5">
                        <div className="flex justify-between items-start text-sm">
                          <div className="flex flex-col min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-text-primary truncate" title={d.name}>
                                {d.name}
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue border border-accent-blue/30">
                                Active
                              </span>
                            </div>
                            <span className="text-sm text-text-muted font-medium">
                              Prev: {formatNum(d.prev)} MT → Cur: {formatNum(d.cur)} MT
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                            <span className="text-severity-critical font-extrabold text-base">
                              -{formatNum(d.drop)} MT
                            </span>
                            <span className="text-sm text-text-muted font-medium">
                              ({d.mom}% MoM)
                            </span>
                          </div>
                        </div>

                        {/* Products along with dealer */}
                        {d.products && d.products.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {d.products.map((p, pi) => {
                              const pName = typeof p === 'string' ? p : p.name;
                              const pLabel = PRODUCT_LABELS[pName] || pName;
                              const pDrop = typeof p === 'object' ? p.drop : 0;
                              const pMom = typeof p === 'object' ? p.mom : null;

                              return (
                                <span 
                                  key={pi} 
                                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-bg-secondary/80 border border-border/40 text-text-secondary"
                                >
                                  <span className="text-text-primary font-bold">{pLabel}</span>
                                  {pDrop > 0 ? (
                                    <span className="text-severity-critical font-mono font-bold text-xs">
                                      -{formatNum(pDrop)} MT
                                    </span>
                                  ) : pDrop < 0 ? (
                                    <span className="text-emerald-400 font-mono font-bold text-xs">
                                      +{formatNum(-pDrop)} MT
                                    </span>
                                  ) : null}
                                  {pMom != null && pMom !== 0 && (
                                    <span className={`text-[10px] font-mono ${pMom < 0 ? 'text-text-muted' : 'text-emerald-400'}`}>
                                      ({pMom > 0 ? `+${pMom}` : pMom}%)
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Decline Breakdown */}
              {productBreakdown.length > 0 && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                    <Target className="w-4 h-4 text-accent-blue" /> Product Decline Breakdown
                  </h4>
                  <div className="bg-bg-card border border-border/50 rounded-lg p-4 space-y-3.5">
                    {productBreakdown.map((p, i) => (
                      <div key={i} className="flex justify-between items-center text-sm border-b border-border/30 last:border-0 pb-2.5 last:pb-0">
                        <div className="flex flex-col">
                          <span className="font-bold text-base text-text-primary">
                            {p.name}
                          </span>
                          <span className="text-sm text-text-muted font-medium">
                            Prev: {formatNum(p.prev)} MT → Cur: {formatNum(p.cur)} MT
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-severity-critical font-extrabold text-base">
                            -{formatNum(p.drop)} MT
                          </span>
                          <span className="text-sm text-text-muted font-medium">
                            ({p.mom}% MoM)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER METADATA */}
          <div className="flex gap-4 text-sm text-text-muted pt-4 mt-4 border-t border-border/30">
            <span>Share: <strong className="text-text-primary">{alert.share ? `${alert.share}%` : '-'}</strong></span>
            {alert.suppressedBy && <span>Suppressed By: <strong className="text-text-primary">{alert.suppressedBy}</strong></span>}
            <span>Generated At: <strong className="text-text-primary">{data?.meta?.generatedAt ? new Date(data.meta.generatedAt).toLocaleString() : 'N/A'}</strong></span>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// RISK DEALER EXPANDED ROW — Pending Order Focused
// ═════════════════════════════════════════════════════════════════════════════
function renderRiskDetail(dealer, allRiskChartData, dealerNotes, noteTexts, setNoteTexts, handleSaveNote, handleDeleteNote, data, viewMode, rawData) {
  const fullData = rawData || data;
  const theme = getRiskColor(dealer.severity);
  const notes = dealerNotes[dealer.client] || [];
  const noteText = noteTexts[dealer.client] || '';
  const pendingRisk = dealer.pendingRisk || {};
  const pendingHistory = dealer.pendingHistory || {};
  const historyMonths = Object.keys(pendingHistory).sort();
  const rec = generatePendingRecommendation(dealer);

  // Highlight this dealer in scatter chart with high-contrast, clean dots
  const highlightedChartData = allRiskChartData.map(d => {
    const isSelected = d.dealer?.client === dealer.client;
    return {
      ...d,
      fill: isSelected ? '#ffffff' : d.fill,
      opacity: isSelected ? 1 : 0.8,
      z: isSelected ? 280 : d.z,
      isSelected
    };
  });

  // Max values for chart domain
  const maxAge = Math.max(200, ...allRiskChartData.map(d => d.x));
  const maxVol = Math.max(100, ...allRiskChartData.map(d => d.y));

  return (
    <tr className="bg-bg-primary/40 shadow-inner overflow-hidden transition-all duration-300">
      <td colSpan={7} className="p-0 border-b border-border/50">
        <div className="p-4 md:p-6 md:pl-14 border-l-2 ml-5 my-2 space-y-6" style={{ borderColor: theme.hex }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* LEFT COLUMN — Pending Risk Profile + Aging */}
            <div className="space-y-5">
              {/* Key Metrics Grid */}
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  <Package className="w-4 h-4" /> Pending Order Risk Profile
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Pending Volume', value: `${formatNum(dealer.pendingQty)} MT`, icon: <Package className="w-3.5 h-3.5" />, highlight: dealer.pendingQty >= 100 },
                    { label: 'Backlog Age', value: `${pendingRisk.backlogAgeDays ?? 0} days`, icon: <Calendar className="w-3.5 h-3.5" />, highlight: pendingRisk.backlogAgeDays >= 60 },
                    { label: 'Priority', value: getBusinessPriority(pendingRisk.severity || 'LOW').label, icon: <Zap className="w-3.5 h-3.5" />, highlight: true },
                    { label: 'Backlog Load', value: `${pendingRisk.fulfillmentRatio ?? 0}x capacity`, icon: <BarChart3 className="w-3.5 h-3.5" />, highlight: pendingRisk.fulfillmentRatio >= 2 },
                    { label: 'Est. Days to Clear', value: pendingRisk.clearanceDays >= 999 ? 'No Despatch' : `${pendingRisk.clearanceDays} days`, icon: <Timer className="w-3.5 h-3.5" />, highlight: pendingRisk.clearanceDays >= 60 },
                    { label: 'Months Pending', value: `${pendingRisk.pendingMonths ?? 0} month${(pendingRisk.pendingMonths ?? 0) !== 1 ? 's' : ''}`, icon: <Clock className="w-3.5 h-3.5" />, highlight: pendingRisk.pendingMonths >= 3 },
                  ].map(item => (
                    <div key={item.label} className="bg-bg-card border border-border/50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs text-text-muted uppercase font-bold mb-1">
                        {item.icon}
                        {item.label}
                      </div>
                      <div className={`text-base font-extrabold ${item.highlight ? theme.text : 'text-text-primary'}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Business Impact Summary */}
              <div className="bg-bg-card p-4 rounded-lg border border-border/50 text-sm text-text-primary leading-relaxed">
                <h4 className="font-bold text-text-primary flex items-center gap-1.5 mb-1.5 uppercase text-xs tracking-wider">
                  <Info className="w-3.5 h-3.5 text-accent-blue shrink-0" /> Business Impact
                </h4>
                <p className="break-words text-base leading-relaxed text-text-primary font-medium">{getPendingImpactSummary(dealer)}</p>
              </div>

              {/* Pending Order Aging Breakdown with Product-wise Split */}
              {historyMonths.length > 0 && (
                <div>
                  <h4 className="text-xs text-text-muted font-extrabold uppercase tracking-widest mb-3">
                    Order Aging Breakdown
                  </h4>
                  <div className="space-y-3 bg-bg-card p-4 rounded-lg border border-border/50">
                    {historyMonths.map(month => {
                      const vol = pendingHistory[month] || 0;
                      const monthDate = new Date(month + '-01');
                      const ageDays = Math.round((new Date() - monthDate) / (1000 * 60 * 60 * 24));
                      const pctOfTotal = dealer.pendingQty > 0 ? Math.round((vol / dealer.pendingQty) * 100) : 0;
                      const ageColor = ageDays >= 120 ? '#ef4444' : ageDays >= 90 ? '#f97316' : ageDays >= 60 ? '#eab308' : ageDays >= 30 ? '#94a3b8' : '#22c55e';
                      const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

                      // Product-wise pending for this specific month
                      const pendingProds = (dealer.products || [])
                        .filter(p => (p.pendingQty ?? 0) > 0)
                        .sort((a, b) => (b.pendingQty ?? 0) - (a.pendingQty ?? 0));

                      const totalDealerPending = dealer.pendingQty || 1;

                      const monthProducts = pendingProds.map(p => {
                        const pMonthVol = p.pendingHistory?.[month] ?? (vol * ((p.pendingQty ?? 0) / totalDealerPending));
                        return {
                          product: p.product,
                          label: PRODUCT_LABELS[p.product] || p.product,
                          vol: pMonthVol,
                          pct: vol > 0 ? Math.round((pMonthVol / vol) * 100) : 0
                        };
                      }).filter(p => p.vol > 0.01);

                      return (
                        <div key={month} className="space-y-2 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                          <div className="flex justify-between text-sm items-center">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: ageColor }}></div>
                              <span className="font-bold text-base text-text-primary">{monthLabel}</span>
                              <span className="text-text-muted text-xs font-medium">({ageDays} Days Old)</span>
                            </div>
                            <span className="font-bold text-base text-text-primary">{formatNum(vol)} MT</span>
                          </div>

                          <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pctOfTotal)}%`, background: ageColor }}></div>
                          </div>

                          {/* Product-wise Breakdown for this month */}
                          {monthProducts.length > 0 && (
                            <div className="mt-2.5 pt-2 pl-3 space-y-1.5 border-l-2 border-border/60 bg-bg-secondary/40 p-2.5 rounded-r-lg">
                              <div className="text-[10px] font-extrabold uppercase text-text-muted tracking-wider mb-1 flex items-center justify-between">
                                <span>Product Breakdown ({monthLabel})</span>
                                <span className="font-mono text-text-secondary">{formatNum(vol)} MT</span>
                              </div>
                              {monthProducts.map(p => (
                                <div key={p.product} className="flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-1.5 h-1.5 rounded-full bg-accent-blue/80 shrink-0" />
                                    <span className="font-bold text-text-primary truncate" title={p.label}>{p.label}</span>
                                  </div>
                                  <div className="flex items-center gap-2 font-mono shrink-0">
                                    <span className="font-extrabold text-text-primary">{formatNum(p.vol)} MT</span>
                                    <span className="text-text-muted text-[11px] font-normal">({p.pct}%)</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Product-wise Pending Breakdown */}
              {dealer.products && dealer.products.length > 0 && dealer.products.some(p => (p.pendingQty ?? 0) > 0) && (
                <div>
                  <h4 className="text-xs text-text-muted font-extrabold uppercase tracking-widest mb-3">
                    Product-wise Pending
                  </h4>
                  <div className="space-y-2 bg-bg-card p-4 rounded-lg border border-border/50">
                    {dealer.products
                      .filter(p => (p.pendingQty ?? 0) > 0)
                      .sort((a, b) => (b.pendingQty ?? 0) - (a.pendingQty ?? 0))
                      .map(p => {
                        const pctOfTotal = dealer.pendingQty > 0 ? Math.round(((p.pendingQty ?? 0) / dealer.pendingQty) * 100) : 0;
                        const productLabel = PRODUCT_LABELS[p.product] || p.product;
                        return (
                          <div key={p.product} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ background: getRiskColor(dealer.severity).hex }}></div>
                                <span className="font-bold text-base text-text-primary">{productLabel}</span>
                              </div>
                              <span className="font-bold text-base text-text-primary">{formatNum(p.pendingQty)} MT <span className="text-text-muted font-normal text-xs">({pctOfTotal}%)</span></span>
                            </div>
                            <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pctOfTotal)}%`, background: getRiskColor(dealer.severity).hex }}></div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Dispatch Context */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase font-bold mb-1">Current Volume</div>
                  <div className={`text-base font-extrabold ${dealer.cur === 0 ? 'text-severity-critical' : 'text-text-primary'}`}>{formatNum(dealer.cur)} MT</div>
                </div>
                <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                  <div className="text-xs text-text-muted uppercase font-bold mb-1">Previous Volume</div>
                  <div className="text-base font-extrabold text-text-primary">{formatNum(dealer.prev)} MT</div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN — Chart + Recommendation + Notes */}
            <div className="space-y-5">
              {/* Pending Risk Matrix — Bigger Chart */}
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  <Activity className="w-4 h-4" /> Pending Risk Matrix
                </h4>
                <div className="bg-bg-card border border-border/50 rounded-lg p-4">
                  <div className="w-full h-[360px]">
                    {highlightedChartData.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-text-muted text-xs italic">No chart data available</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 25, right: 25, bottom: 30, left: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.35} />
                          {/* Risk zone backgrounds */}
                          <ReferenceArea x1={90} x2={maxAge + 10} y1={100} y2={maxVol + 50} fill="#ef4444" fillOpacity={0.08} />
                          <ReferenceArea x1={60} x2={90} y1={100} y2={maxVol + 50} fill="#f97316" fillOpacity={0.06} />
                          <ReferenceArea x1={90} x2={maxAge + 10} y1={0} y2={100} fill="#f97316" fillOpacity={0.05} />
                          <ReferenceArea x1={0} x2={60} y1={0} y2={100} fill="#3b82f6" fillOpacity={0.03} />

                          <XAxis 
                            type="number" 
                            dataKey="x" 
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} 
                            stroke="var(--color-border)" 
                            domain={[0, maxAge + 10]}
                            tickLine={false}
                            label={{ value: 'Backlog Age (days)', position: 'bottom', offset: 12, fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }} 
                          />
                          <YAxis 
                            type="number" 
                            dataKey="y" 
                            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} 
                            stroke="var(--color-border)" 
                            domain={[0, 'auto']}
                            tickLine={false}
                            tickFormatter={(v) => `${v}`}
                            label={{ value: 'Pending Volume (MT)', angle: -90, position: 'insideLeft', offset: -2, fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 600 }} 
                          />
                          <ZAxis type="number" dataKey="z" range={[50, 220]} />
                          <ChartTooltip content={<PendingChartTooltipContent />} />
                          
                          <ReferenceLine x={60} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '60d', position: 'top', fill: '#f97316', fontSize: 10, fontWeight: 600 }} />
                          <ReferenceLine x={90} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: '90d', position: 'top', fill: '#ef4444', fontSize: 10, fontWeight: 700 }} />
                          <ReferenceLine y={100} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" strokeWidth={1} label={{ value: '100 MT', position: 'right', fill: 'var(--color-text-muted)', fontSize: 10 }} />

                          <Scatter data={highlightedChartData} isAnimationActive={true} animationDuration={600}>
                            {highlightedChartData.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={entry.fill} 
                                fillOpacity={entry.opacity} 
                                stroke={entry.isSelected ? '#38bdf8' : 'none'}
                                strokeWidth={entry.isSelected ? 3 : 0}
                              />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {/* Zone legend */}
                  <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-semibold uppercase tracking-wider items-center">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }}></span><span className="text-text-muted">Critical Zone (90d+, 100MT+)</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#f97316' }}></span><span className="text-text-muted">High Risk (60-90d)</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }}></span><span className="text-text-muted">Normal (&lt;60d)</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-sky-400" style={{ background: '#ffffff' }}></span><span className="text-text-primary font-bold">Selected Account</span></span>
                  </div>
                </div>
              </div>

              {/* Recommended Actions */}
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  <Briefcase className="w-4 h-4" /> Recommended Actions
                </h4>
                <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-base">
                  <div className="flex gap-3 items-start">
                    <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${pendingRisk.severity === 'CRITICAL' ? 'text-severity-critical' : pendingRisk.severity === 'HIGH' ? 'text-severity-high' : 'text-accent-blue'}`} />
                    <span className="text-text-primary leading-relaxed font-semibold text-base">{rec}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <h4 className="text-[10px] text-text-muted font-extrabold uppercase tracking-widest mb-3">Notes</h4>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteTexts(prev => ({ ...prev, [dealer.client]: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Add an observation or note about this dealer..."
                  rows={3}
                  className="w-full bg-bg-card border border-border/50 focus:border-accent-blue outline-none p-3 rounded-lg text-xs text-text-primary placeholder-text-muted leading-relaxed resize-none"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveNote(dealer.client); }}
                  disabled={!noteText.trim()}
                  className="mt-2 px-4 py-2 text-xs font-bold bg-accent-blue hover:bg-accent-blue-strong text-white rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save Note <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <div className="space-y-2.5 mt-3 max-h-[200px] overflow-y-auto pr-1">
                  {notes.length === 0 ? (
                    <div className="text-center text-xs text-text-muted italic bg-bg-card p-3 rounded-lg border border-border/30">
                      No notes recorded yet.
                    </div>
                  ) : (
                    notes.map(note => (
                      <div key={note.id} className="p-3 bg-bg-card border border-border/40 rounded-lg text-xs space-y-1.5 relative group">
                        <div className="flex justify-between items-center text-[10px] text-text-muted border-b border-border/20 pb-1 mb-1">
                          <span className="font-bold uppercase tracking-wider text-accent-blue">Note</span>
                          <div className="flex items-center gap-2">
                            <span>{new Date(note.timestamp).toLocaleDateString()} {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteNote(dealer.client, note.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-severity-critical hover:bg-severity-critical/10 rounded transition-all cursor-pointer"
                              title="Delete note"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-text-primary leading-relaxed font-medium break-words">{note.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex gap-4 text-xs text-text-muted pt-4 mt-4 border-t border-border/30">
            <span>Location: <strong className="text-text-primary">{dealer.district}, {dealer.state}</strong></span>
            {pendingRisk.oldestMonth && <span>Oldest Pending: <strong className="text-text-primary">{new Date(pendingRisk.oldestMonth + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</strong></span>}
            <span>Generated At: <strong className="text-text-primary">{data?.meta?.generatedAt ? new Date(data.meta.generatedAt).toLocaleString() : 'N/A'}</strong></span>
          </div>
        </div>
      </td>
    </tr>
  );
}


