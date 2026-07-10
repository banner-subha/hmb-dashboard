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
} from 'recharts';
import SeverityBadge from '../components/common/SeverityBadge';
import ImpactBadge from '../components/common/ImpactBadge';
import MoMIndicator from '../components/common/MoMIndicator';
import { calculateMoM, getBusinessImpact, getSeverityFromImpactScore, getSeverityTheme } from '../utils/trendEngine';
import SkeletonLoader from '../components/common/SkeletonLoader';

// ── Shared helpers ───────────────────────────────────────────────────────────
const formatNum = (num, fallback = '-') => (typeof num === 'number' ? num.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : fallback);

function getImpactScoreColor(score) {
  return getSeverityTheme(getSeverityFromImpactScore(score)).color;
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

// ── Dynamic Hierarchy Generator (dispatch alerts) ────────────────────────────
const buildHierarchy = (alert, fullData) => {
  if (!fullData || !alert) return null;
  const level = (alert.level || alert.category || '').toUpperCase();
  const entityName = (alert.dealer || alert.district || alert.state || (alert.title ? alert.title.split(':')[0].trim() : '')).toUpperCase();
  const cleanName = (name) => name ? name.split('—')[0].trim() : '';

  if (level === 'STATE') {
    const districts = (fullData.districts || []).filter(d => d.state?.toUpperCase() === entityName);
    const stateObj = (fullData.states || []).find(s => s.state?.toUpperCase() === entityName);
    const products = stateObj?.products || [];
    if (districts.length === 0 && products.length === 0) return null;
    const children = [
      ...districts.map(d => {
        const impactScore = d.impactScore ?? 0;
        const severity = getSeverityFromImpactScore(impactScore);
        return { type: 'DISTRICT', name: cleanName(d.district), severity, impactScore };
      }),
      ...products.map(p => {
        const impactScore = p.impactScore ?? 0;
        const severity = getSeverityFromImpactScore(impactScore);
        return { type: 'PRODUCT', name: cleanName(p.product), severity, impactScore };
      }),
    ];
    return { type: 'STATE', name: cleanName(alert.state || entityName), children, severity: getWorstSeverity(children), impactScore: getWorstImpactScore(children) };
  }

  if (level === 'DISTRICT') {
    const matchName = entityName.split(',')[0].trim();
    const dealers = (fullData.dealers || []).filter(d => d.district?.toUpperCase() === matchName);
    const distObj = (fullData.districts || []).find(d => d.district?.toUpperCase() === matchName);
    const products = distObj?.products || [];
    if (dealers.length === 0 && products.length === 0) return null;
    const children = [
      ...dealers.map(d => {
        const impactScore = d.impactScore ?? 0;
        const severity = getSeverityFromImpactScore(impactScore);
        return { type: 'DEALER', name: cleanName(d.client), severity, impactScore };
      }),
      ...products.map(p => {
        const impactScore = p.impactScore ?? 0;
        const severity = getSeverityFromImpactScore(impactScore);
        return { type: 'PRODUCT', name: cleanName(p.product), severity, impactScore };
      }),
    ];
    return { type: 'DISTRICT', name: cleanName(alert.district || matchName), children, severity: getWorstSeverity(children), impactScore: getWorstImpactScore(children) };
  }

  if (level === 'DEALER') {
    const dealerObj = (fullData.dealers || []).find(d => d.client?.toUpperCase() === entityName);
    const products = dealerObj?.products || [];
    if (products.length === 0) return null;
    const children = products.map(p => {
      const impactScore = p.impactScore ?? 0;
      const severity = getSeverityFromImpactScore(impactScore);
      return { type: 'PRODUCT', name: cleanName(p.product), severity, impactScore };
    });
    return { type: 'DEALER', name: cleanName(alert.dealer || entityName), children, severity: getWorstSeverity(children), impactScore: getWorstImpactScore(children) };
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

  // 1. BACKLOG AGE (35% weight) — days since oldest pending order month
  let backlogAgeDays = 0;
  let oldestMonth = null;
  if (historyMonths.length > 0) {
    oldestMonth = historyMonths[0];
    const oldestDate = new Date(oldestMonth + '-01');
    backlogAgeDays = Math.max(0, Math.round((now - oldestDate) / (1000 * 60 * 60 * 24)));
  } else {
    backlogAgeDays = 30; // assume ~1 month if no history
  }
  // Score: 0-30d = 0-25, 31-60d = 25-50, 61-90d = 50-75, 91-120d = 75-90, 120d+ = 90-100
  let ageScore = 0;
  if (backlogAgeDays >= 120) ageScore = 100;
  else if (backlogAgeDays >= 90) ageScore = 75 + ((backlogAgeDays - 90) / 30) * 25;
  else if (backlogAgeDays >= 60) ageScore = 50 + ((backlogAgeDays - 60) / 30) * 25;
  else if (backlogAgeDays >= 30) ageScore = 25 + ((backlogAgeDays - 30) / 30) * 25;
  else ageScore = (backlogAgeDays / 30) * 25;

  // 2. FULFILLMENT RATIO (25% weight) — pending / monthly capacity
  const monthlyCapacity = dealer.dailyAvgQty > 0 ? dealer.dailyAvgQty * 30 : (dealer.prev > 0 ? dealer.prev : 1);
  const fulfillmentRatio = pendingQty / monthlyCapacity;
  // Score: 0-1x = 0-30, 1-2x = 30-60, 2-5x = 60-85, 5x+ = 85-100
  let fulfillmentScore = 0;
  if (fulfillmentRatio >= 5) fulfillmentScore = 100;
  else if (fulfillmentRatio >= 2) fulfillmentScore = 60 + ((fulfillmentRatio - 2) / 3) * 40;
  else if (fulfillmentRatio >= 1) fulfillmentScore = 30 + ((fulfillmentRatio - 1) / 1) * 30;
  else fulfillmentScore = fulfillmentRatio * 30;

  // 3. DISPATCH INACTIVITY (20% weight) — is the dealer dispatching at all?
  const cur = dealer.cur ?? 0;
  const prev = dealer.prev ?? 0;
  let inactivityScore = 0;
  if (cur === 0 && prev > 0) inactivityScore = 100; // Complete shutdown with history
  else if (cur === 0 && prev === 0) inactivityScore = 80; // No activity at all
  else if (cur > 0 && cur < prev * 0.3) inactivityScore = 60; // Severe slowdown (<30% of prev)
  else if (cur > 0 && cur < prev * 0.5) inactivityScore = 35; // Moderate slowdown
  else if (cur > 0 && cur < prev) inactivityScore = 15; // Minor slowdown
  else inactivityScore = 0; // Dispatching normally or growing

  // 4. PENDING VOLUME ABSOLUTE (10% weight) — raw business impact
  // Score: 0-20MT = 0-20, 20-50 = 20-40, 50-100 = 40-60, 100-300 = 60-80, 300+ = 80-100
  let volumeScore = 0;
  if (pendingQty >= 300) volumeScore = 80 + Math.min(20, (pendingQty - 300) / 200 * 20);
  else if (pendingQty >= 100) volumeScore = 60 + ((pendingQty - 100) / 200) * 20;
  else if (pendingQty >= 50) volumeScore = 40 + ((pendingQty - 50) / 50) * 20;
  else if (pendingQty >= 20) volumeScore = 20 + ((pendingQty - 20) / 30) * 20;
  else volumeScore = (pendingQty / 20) * 20;

  // 5. MULTI-MONTH ACCUMULATION (10% weight) — systemic fulfillment failure
  // Score: 1 month = 0, 2 months = 40, 3 months = 70, 4+ months = 100
  let accumulationScore = 0;
  if (pendingMonths >= 4) accumulationScore = 100;
  else if (pendingMonths >= 3) accumulationScore = 70;
  else if (pendingMonths >= 2) accumulationScore = 40;
  else accumulationScore = 0;

  // WEIGHTED COMPOSITE
  let riskScore = (ageScore * 0.35) + (fulfillmentScore * 0.25) + (inactivityScore * 0.20) + (volumeScore * 0.10) + (accumulationScore * 0.10);

  // CRITICAL FLOOR: zero dispatch + significant pending + aged = guaranteed critical
  if (cur === 0 && pendingQty >= 50 && backlogAgeDays >= 60) {
    riskScore = Math.max(riskScore, 75);
  }
  // HIGH FLOOR: zero dispatch + any meaningful pending
  if (cur === 0 && pendingQty >= 20) {
    riskScore = Math.max(riskScore, 50);
  }

  riskScore = Math.min(100, Math.round(riskScore));
  const severity = getPendingSeverity(riskScore);

  // Clearance estimate
  const dailyRate = dealer.currentDailyRate ?? dealer.dailyAvgQty ?? 0;
  const clearanceDays = dailyRate > 0 ? Math.round(pendingQty / dailyRate) : 999;

  return { riskScore, severity, backlogAgeDays, fulfillmentRatio: Math.round(fulfillmentRatio * 100) / 100, clearanceDays, pendingMonths, oldestMonth };
}

function getPendingImpactSummary(dealer) {
  const { cur, pendingQty, pendingRisk } = dealer;
  const pendingStr = formatNum(pendingQty);
  const ageStr = pendingRisk.backlogAgeDays;

  if (pendingRisk.severity === 'CRITICAL') {
    if (cur === 0) {
      return `⚠️ STUCK ORDERS: ${pendingStr} MT pending with ZERO dispatch activity. Oldest order is ${ageStr} days old. At current rate, clearance is impossible — immediate intervention required.`;
    }
    return `⚠️ SEVERE BACKLOG: ${pendingStr} MT pending, aging ${ageStr} days. Current dispatch rate can only clear ${formatNum(dealer.dailyAvgQty)} MT/day — estimated ${pendingRisk.clearanceDays} days to clear at this pace.`;
  }
  if (pendingRisk.severity === 'HIGH') {
    return `${pendingStr} MT pending orders aging ${ageStr} days. Fulfillment ratio is ${pendingRisk.fulfillmentRatio}x monthly capacity. ${cur === 0 ? 'No dispatch activity this month.' : `Current dispatch: ${formatNum(cur)} MT this month.`}`;
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
      return 'AGED BACKLOG: Orders pending 90+ days indicate systemic fulfillment failure. Investigate production allocation, logistics bottleneck, or order cancellation eligibility. Engage supply chain team.';
    }
    return 'HIGH VOLUME BACKLOG: Pending orders exceed fulfillment capacity significantly. Prioritize dispatch allocation, consider splitting orders across production batches, or negotiate revised delivery timelines.';
  }
  if (pendingRisk.severity === 'HIGH') {
    if (pendingRisk.pendingMonths >= 3) {
      return 'RECURRING BACKLOG: Pending orders spanning 3+ months suggest persistent capacity mismatch. Review dealer ordering patterns vs actual fulfillment capability. Consider adjusting order acceptance criteria.';
    }
    return 'Monitor closely: Pending volume is building up relative to dispatch capacity. Ensure priority allocation in next production cycle. Follow up with logistics for dispatch scheduling.';
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
        <div className="font-bold text-white mb-2 truncate text-[11px]">{d.client}</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-text-secondary">Pending:</span>
            <span className="font-semibold text-white">{formatNum(d.pendingQty)} MT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Backlog Age:</span>
            <span className="font-semibold text-white">{d.pendingRisk?.backlogAgeDays ?? 0}d</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Fulfillment:</span>
            <span className="font-semibold text-white">{d.pendingRisk?.fulfillmentRatio ?? 0}x capacity</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Risk Score:</span>
            <span className="font-bold" style={{ color: getRiskColor(d.pendingRisk?.severity || 'LOW').hex }}>{d.pendingRisk?.riskScore ?? 0}</span>
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
        <div className="font-bold text-white mb-1 truncate">{d.client}</div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Drop:</span>
          <span className="font-semibold text-white">{data.y}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Inactive:</span>
          <span className="font-semibold text-white">{data.x}d</span>
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
  const { data, rawData, loading, error } = useData();

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('DISPATCH'); // 'DISPATCH' | 'RISK'

  // ── Paging state (for RISK view) ──────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // ── Common state ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── SEPARATED severity filters (dispatch and risk are independent) ────────
  const [dispatchSeverityFilter, setDispatchSeverityFilter] = useState('ALL');
  const [riskSeverityFilter, setRiskSeverityFilter] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Reset pagination and expansions on filter / mode changes
  useEffect(() => {
    setCurrentPage(1);
    setExpandedRows(new Set());
  }, [selectedState, dispatchSeverityFilter, riskSeverityFilter, debouncedSearchQuery, selectedLevel, selectedProduct, viewMode]);

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
    return rawData.alerts.map(alert => {
      let productStr = alert.product || alert.products || alert.data?.product || '';
      if (!productStr) {
        const level = (alert.level || alert.category || '').toUpperCase();
        const stateName = (alert.state || '').toUpperCase();
        const districtName = (alert.district || '').toUpperCase();
        const dealerName = (alert.dealer || '').toUpperCase();
        let products = [];
        if (level === 'STATE' && stateName) {
          const stateObj = (rawData.states || []).find(s => s.state?.toUpperCase() === stateName);
          products = stateObj?.products || [];
        } else if (level === 'DISTRICT' && districtName) {
          const distObj = (rawData.districts || []).find(d => d.district?.toUpperCase() === districtName && d.state?.toUpperCase() === stateName);
          products = distObj?.products || [];
        } else if (level === 'DEALER' && dealerName) {
          const dealerObj = (rawData.dealers || []).find(d => d.client?.toUpperCase() === dealerName);
          products = dealerObj?.products || [];
        } else if (level === 'OVERALL') {
          products = rawData.products || [];
        }
        const decliningProds = products.filter(p => (p.cur ?? 0) < (p.prev ?? 0)).map(p => p.product);
        productStr = decliningProds.join(', ');
      }
      return { ...alert, product: productStr, products: productStr };
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
    return alerts.filter((alert, originalIdx) => {
      const query = debouncedSearchQuery.toLowerCase();
      const searchable = `${alert.dealer || ''} ${alert.district || ''} ${alert.state || ''} ${alert.products || alert.product || ''} ${alert.reason || alert.title || ''}`.toLowerCase();
      if (debouncedSearchQuery && !searchable.includes(query)) return false;

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
  }, [alerts, debouncedSearchQuery, selectedLevel, selectedState, selectedProduct]);

  // Counts update dynamically based on filteredAlertsForCounts
  const dispatchCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    filteredAlertsForCounts.forEach(alert => {
      const originalIdx = alerts.indexOf(alert);
      const precomputed = alertSeverityMap[originalIdx];
      const severity = precomputed?.severity || 'LOW';
      if (severity === 'CRITICAL') c.critical++;
      else if (severity === 'HIGH') c.high++;
      else if (severity === 'MEDIUM') c.medium++;
      else c.low++;
    });
    return c;
  }, [filteredAlertsForCounts, alertSeverityMap, alerts]);

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
      const query = debouncedSearchQuery.toLowerCase();
      const searchable = `${d.client || ''} ${d.district || ''} ${d.state || ''}`.toLowerCase();
      if (debouncedSearchQuery && !searchable.includes(query)) return false;
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
  }, [alerts, processedDealers, viewMode]);

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
      const query = debouncedSearchQuery.toLowerCase();
      const searchable = `${alert.dealer || ''} ${alert.district || ''} ${alert.state || ''} ${alert.products || alert.product || ''} ${alert.reason || alert.title || ''}`.toLowerCase();
      if (debouncedSearchQuery && !searchable.includes(query)) return false;

      const derivedSev = alertSeverityMap[originalIdx]?.severity || 'LOW';
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
  }, [alerts, debouncedSearchQuery, dispatchSeverityFilter, selectedLevel, selectedState, selectedProduct, alertSeverityMap, viewMode]);

  // ── Filtered risk dealers (uses riskSeverityFilter ONLY) ───────────────────
  const filteredDealers = useMemo(() => {
    if (viewMode === 'DISPATCH') return [];
    return processedDealers.filter(d => {
      const query = debouncedSearchQuery.toLowerCase();
      const searchable = `${d.client || ''} ${d.district || ''} ${d.state || ''}`.toLowerCase();
      if (debouncedSearchQuery && !searchable.includes(query)) return false;

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
      const originalIdx = alerts.indexOf(alert);
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
          <h2 className="text-2xl font-extrabold text-text-primary flex items-center gap-3 mb-2">
            <Activity className="w-6 h-6 text-accent-blue" />
            Alert Intelligence
          </h2>
          <p className="text-sm text-text-secondary">Enterprise operational explorer and root-cause investigation workspace</p>
        </div>
      </div>

      {/* SEGMENTED TOGGLE */}
      <div className="flex items-center gap-1 p-1 rounded-xl w-fit"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {[
          { key: 'DISPATCH', label: 'Dispatch', icon: TrendingDown },
          { key: 'RISK', label: 'Risk', icon: ShieldAlert },
        ].map(({ key, label, icon: Icon }) => {
          const isActive = viewMode === key;
          return (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer"
              style={{
                background: isActive ? 'rgba(59,130,246,0.18)' : 'transparent',
                color: isActive ? '#60a5fa' : 'rgba(148,163,184,0.7)',
                border: isActive ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
                boxShadow: isActive ? '0 0 16px rgba(59,130,246,0.08)' : 'none',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* KPI CHIPS — ADAPTIVE */}
      <div className="flex flex-wrap gap-3">
        {/* Active Count */}
        <div
          className="flex items-center gap-4 px-7 py-3 rounded-xl border transition-all"
          style={{
            background: 'rgba(59,130,246,0.07)',
            borderColor: 'rgba(59,130,246,0.2)',
            boxShadow: '0 0 16px rgba(59,130,246,0.06)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-accent-blue/70 uppercase tracking-widest mb-0.5">
              {viewMode === 'DISPATCH' ? 'Dispatch Alerts' : 'Risk Dealers'}
            </span>
            <span className="text-2xl font-extrabold text-text-primary leading-none">{totalActive}</span>
          </div>
          <Activity className="w-5 h-5 text-accent-blue/40" />
        </div>

        {/* Severity chips — adapt per view mode */}
        {viewMode === 'DISPATCH' && (
          <>
            {/* Critical */}
            <button
              onClick={() => setDispatchSeverityFilter(dispatchSeverityFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
              className="flex items-center gap-4 px-7 py-3 rounded-xl border transition-all hover:scale-[1.02]"
              style={{
                background: dispatchSeverityFilter === 'CRITICAL' ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)',
                borderColor: dispatchSeverityFilter === 'CRITICAL' ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.35)',
                boxShadow: dispatchSeverityFilter === 'CRITICAL' ? '0 0 20px rgba(239,68,68,0.15)' : '0 0 10px rgba(239,68,68,0.05)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(239,68,68,0.7)' }}>Critical</span>
                <span className="text-2xl font-extrabold text-text-primary leading-none">
                  {dispatchCounts.critical}
                </span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-severity-critical animate-pulse-subtle"></div>
            </button>

            {/* High */}
            <button
              onClick={() => setDispatchSeverityFilter(dispatchSeverityFilter === 'HIGH' ? 'ALL' : 'HIGH')}
              className="flex items-center gap-4 px-7 py-3 rounded-xl border transition-all hover:scale-[1.02]"
              style={{
                background: dispatchSeverityFilter === 'HIGH' ? 'rgba(249,115,22,0.18)' : 'rgba(249,115,22,0.12)',
                borderColor: dispatchSeverityFilter === 'HIGH' ? 'rgba(249,115,22,0.6)' : 'rgba(249,115,22,0.35)',
                boxShadow: dispatchSeverityFilter === 'HIGH' ? '0 0 20px rgba(249,115,22,0.12)' : '0 0 10px rgba(249,115,22,0.04)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(249,115,22,0.7)' }}>High</span>
                <span className="text-2xl font-extrabold text-text-primary leading-none">
                  {dispatchCounts.high}
                </span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f97316' }}></div>
            </button>

            {/* Medium (dispatch-relevant) */}
            <button
              onClick={() => setDispatchSeverityFilter(dispatchSeverityFilter === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
              className="flex items-center gap-4 px-7 py-3 rounded-xl border transition-all hover:scale-[1.02]"
              style={{
                background: dispatchSeverityFilter === 'MEDIUM' ? 'rgba(234,179,8,0.18)' : 'rgba(234,179,8,0.12)',
                borderColor: dispatchSeverityFilter === 'MEDIUM' ? 'rgba(234,179,8,0.6)' : 'rgba(234,179,8,0.35)',
                boxShadow: dispatchSeverityFilter === 'MEDIUM' ? '0 0 20px rgba(234,179,8,0.12)' : '0 0 10px rgba(234,179,8,0.04)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'rgba(234,179,8,0.7)' }}>Medium</span>
                <span className="text-2xl font-extrabold text-text-primary leading-none">
                  {dispatchCounts.medium}
                </span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#eab308' }}></div>
            </button>
          </>
        )}

        {/* Risk-only: show Critical/High/Medium/Low chips — uses riskSeverityFilter */}
        {viewMode === 'RISK' && (
          <>
            {[
              { key: 'CRITICAL', label: 'Critical', color: '#ef4444', count: riskCounts.critical },
              { key: 'HIGH', label: 'High', color: '#f97316', count: riskCounts.high },
              { key: 'MEDIUM', label: 'Medium', color: '#eab308', count: riskCounts.medium },
              { key: 'LOW', label: 'Low', color: '#22c55e', count: riskCounts.low },
            ].map(cfg => (
              <button
                key={cfg.key}
                onClick={() => setRiskSeverityFilter(riskSeverityFilter === cfg.key ? 'ALL' : cfg.key)}
                className="flex items-center gap-4 px-7 py-3 rounded-xl border transition-all hover:scale-[1.02]"
                style={{
                  background: riskSeverityFilter === cfg.key ? `${cfg.color}30` : `${cfg.color}1e`,
                  borderColor: riskSeverityFilter === cfg.key ? `${cfg.color}99` : `${cfg.color}59`,
                  boxShadow: riskSeverityFilter === cfg.key ? `0 0 20px ${cfg.color}26` : `0 0 10px ${cfg.color}0d`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: `${cfg.color}b3` }}>{cfg.label}</span>
                  <span className="text-2xl font-extrabold text-text-primary leading-none">{cfg.count}</span>
                </div>
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }}></div>
              </button>
            ))}
          </>
        )}
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
                placeholder={viewMode === 'RISK' ? "Search dealer, location..." : "Search alerts, entities..."} 
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
                <option value="DEALER">Dealer</option>
                <option value="PRODUCT">Product</option>
              </select>
            )}

            <select 
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="filter-select bg-bg-input border-border/50 text-xs w-full sm:w-40"
            >
              <option value="ALL">All States</option>
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
                  className="px-2.5 py-1.5 rounded-lg border border-border/50 text-xs font-bold bg-bg-input hover:border-accent-blue disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer transition-all"
                >
                  Prev
                 </button>
                 <span className="text-xs font-bold text-text-muted min-w-[70px] text-center">
                   Page {currentPage} of {Math.ceil(unifiedRows.length / pageSize) || 1}
                 </span>
                 <button
                   disabled={currentPage >= Math.ceil(unifiedRows.length / pageSize)}
                   onClick={() => setCurrentPage(prev => prev + 1)}
                   className="px-2.5 py-1.5 rounded-lg border border-border/50 text-xs font-bold bg-bg-input hover:border-accent-blue disabled:opacity-40 disabled:cursor-not-allowed text-white cursor-pointer transition-all"
                 >
                   Next
                 </button>
               </div>
             )}
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto relative">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-bg-secondary/95 backdrop-blur-sm border-b border-border shadow-sm">
              <tr className="text-xs uppercase tracking-wider text-text-muted">
                <th className="p-4 font-bold w-12 text-center"></th>
                <th className="p-4 font-bold">Severity</th>
                <th className="p-4 font-bold">Level</th>
                <th className="p-4 font-bold">Entity</th>
                <th className="p-4 font-bold text-right">{viewMode === 'RISK' ? 'Backlog Age' : 'MoM %'}</th>
                <th className="p-4 font-bold text-right hidden md:table-cell">{viewMode === 'RISK' ? 'Pending Vol' : 'MT Loss'}</th>
                <th className="p-4 font-bold text-center hidden md:table-cell">{viewMode === 'RISK' ? 'Risk Score' : 'Impact Score'}</th>
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
                        className={`hover:bg-bg-secondary/60 cursor-pointer transition-colors group ${isExpanded ? 'bg-bg-secondary/40' : ''}`}
                      >
                        <td className="p-4 text-text-muted text-center">
                          {isExpanded ? <ChevronDown className="w-4 h-4 mx-auto text-accent-blue" /> : <ChevronRight className="w-4 h-4 mx-auto group-hover:text-text-primary transition-colors" />}
                        </td>

                        {/* SEVERITY */}
                        <td className="p-4">
                          <SeverityBadge severity={getSeverityTheme(row.severity).severity} color={getSeverityTheme(row.severity).color} />
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
                                const color = rawMom < 0 ? '#ef4444' : rawMom > 0 ? '#22c55e' : '#6b7280';
                                const icon = rawMom < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : rawMom > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />;
                                return <span style={{ color }} className="flex items-center justify-end gap-1 font-semibold">{icon}{rawMom > 0 ? '+' : ''}{rawMom}%</span>;
                              }
                              return <MoMIndicator cur={source.data?.cur ?? source.cur} prev={source.data?.prev ?? source.prev} />;
                            })()
                          ) : (
                            <span className="flex items-center justify-end gap-1 font-semibold">
                              <Clock className="w-3.5 h-3.5 text-text-muted" />
                              <span style={{ color: source.pendingRisk?.backlogAgeDays >= 90 ? '#ef4444' : source.pendingRisk?.backlogAgeDays >= 60 ? '#f97316' : source.pendingRisk?.backlogAgeDays >= 30 ? '#eab308' : '#94a3b8' }}>
                                {source.pendingRisk?.backlogAgeDays ?? 0}d
                              </span>
                            </span>
                          )}
                        </td>

                        {/* MT LOSS / PENDING VOLUME */}
                        <td className="p-4 text-right text-text-secondary whitespace-nowrap hidden md:table-cell">
                          {isDispatch
                            ? (source.drop ? formatNum(source.drop) : (source.data?.drop ? formatNum(source.data.drop) : '-'))
                            : <span className="font-semibold text-text-primary">{formatNum(source.pendingQty)} MT</span>
                          }
                        </td>

                        {/* RISK SCORE / IMPACT SCORE */}
                        <td className="p-4 text-center hidden md:table-cell">
                          {isDispatch ? (
                            <span style={{ color: getImpactScoreColor(row.impactScore), fontWeight: 700 }}>{row.impactScore}</span>
                          ) : (
                            <span style={{ color: getRiskColor(source.severity).hex, fontWeight: 700 }}>{source.riskScore}</span>
                          )}
                        </td>
                      </tr>

                      {/* EXPANDED DETAIL */}
                      {isExpanded && (
                        isDispatch
                          ? renderDispatchDetail(source, row._originalIdx, data, viewMode)
                          : renderRiskDetail(source, allRiskChartData, dealerNotes, noteTexts, setNoteTexts, handleSaveNote, handleDeleteNote, data, viewMode)
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
function renderDispatchDetail(alert, originalIdx, data, viewMode) {
  const hierarchy = buildHierarchy(alert, data);
  const rec = generateRecommendation(alert);

  return (
    <tr className="bg-bg-primary/40 shadow-inner overflow-hidden transition-all duration-300">
      <td colSpan={viewMode === 'RISK' ? 6 : 7} className="p-0 border-b border-border/50">
        <div className="p-4 md:p-6 md:pl-14 border-l-2 border-accent-blue ml-5 my-2 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT COLUMN */}
            <div className="space-y-6">
              {/* Operational Context */}
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  <FileText className="w-4 h-4" /> Operational Context
                </h4>
                <p className="text-sm text-text-secondary leading-relaxed bg-bg-card p-4 rounded-lg border border-border/50">
                  {alert.reason || alert.detail || alert.title || "Contextual details unavailable for this alert entity."}
                </p>
              </div>

              {/* Dynamic Root Cause Hierarchy */}
              {hierarchy && (
                <div>
                  <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                    <Layers className="w-4 h-4" /> Root Cause Hierarchy
                  </h4>
                  <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-sm font-mono">
                    <div className="flex items-center gap-2 text-text-primary font-bold">
                      {hierarchy.type === 'STATE' && <Map className="w-3.5 h-3.5 text-accent-blue" />}
                      {hierarchy.type === 'DISTRICT' && <Map className="w-3.5 h-3.5 text-accent-blue" />}
                      {hierarchy.type === 'DEALER' && <Search className="w-3.5 h-3.5 text-accent-blue" />}
                      {hierarchy.name}
                    </div>
                    {hierarchy.children.map((child, i) => (
                      <div key={i} className="flex items-center gap-2 mt-2 ml-4 relative">
                        <div className="absolute -left-4 top-0 w-4 h-1/2 border-l border-b border-border-accent rounded-bl"></div>
                        {child.type === 'DISTRICT' && <Map className="w-3 h-3 text-text-muted z-10 bg-bg-card" />}
                        {child.type === 'DEALER' && <Search className="w-3 h-3 text-text-muted z-10 bg-bg-card" />}
                        {child.type === 'PRODUCT' && <Target className="w-3 h-3 text-text-muted z-10 bg-bg-card" />}
                        <span className="text-text-secondary">{child.name}</span>
                      </div>
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
                <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-sm">
                  <div className="flex gap-3 items-start">
                    <Activity className={`w-5 h-5 shrink-0 mt-0.5 ${(() => { const c = alert.data?.cur ?? alert.cur ?? 0; const p = alert.data?.prev ?? alert.prev ?? 0; return getBusinessImpact(c, p).severity === 'CRITICAL' ? 'text-severity-critical' : 'text-accent-blue'; })()}`} />
                    <span className="text-text-primary leading-relaxed font-medium">{rec}</span>
                  </div>
                </div>
              </div>

              {/* Escalation Metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                  <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Business Impact</div>
                  <div className="text-sm font-medium text-text-primary">
                    {alert.drop ? `${formatNum(alert.drop)} MT Lost` : 'Pending Assessment'}
                  </div>
                </div>
                <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                  <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Product Portfolio</div>
                  <div className="text-sm font-medium text-text-primary truncate" title={alert.products || alert.product || 'Multiple'}>
                    {alert.products || alert.product || 'Multiple'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER METADATA */}
          <div className="flex gap-4 text-xs text-text-muted pt-4 mt-4 border-t border-border/30">
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
function renderRiskDetail(dealer, allRiskChartData, dealerNotes, noteTexts, setNoteTexts, handleSaveNote, handleDeleteNote, data, viewMode) {
  const theme = getRiskColor(dealer.severity);
  const notes = dealerNotes[dealer.client] || [];
  const noteText = noteTexts[dealer.client] || '';
  const pendingRisk = dealer.pendingRisk || {};
  const pendingHistory = dealer.pendingHistory || {};
  const historyMonths = Object.keys(pendingHistory).sort();
  const rec = generatePendingRecommendation(dealer);

  // Highlight this dealer in scatter chart
  const highlightedChartData = allRiskChartData.map(d => ({
    ...d,
    fill: d.dealer?.client === dealer.client ? '#ffffff' : d.fill,
    opacity: d.dealer?.client === dealer.client ? 1 : 0.25,
  }));

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
                    { label: 'Risk Score', value: `${pendingRisk.riskScore ?? 0}/100`, icon: <Zap className="w-3.5 h-3.5" />, highlight: true },
                    { label: 'Fulfillment Ratio', value: `${pendingRisk.fulfillmentRatio ?? 0}x`, icon: <BarChart3 className="w-3.5 h-3.5" />, highlight: pendingRisk.fulfillmentRatio >= 2 },
                    { label: 'Clearance Est.', value: pendingRisk.clearanceDays >= 999 ? '∞ (no dispatch)' : `${pendingRisk.clearanceDays} days`, icon: <Timer className="w-3.5 h-3.5" />, highlight: pendingRisk.clearanceDays >= 60 },
                    { label: 'Months Pending', value: `${pendingRisk.pendingMonths ?? 0} month${(pendingRisk.pendingMonths ?? 0) !== 1 ? 's' : ''}`, icon: <Clock className="w-3.5 h-3.5" />, highlight: pendingRisk.pendingMonths >= 3 },
                  ].map(item => (
                    <div key={item.label} className="bg-bg-card border border-border/50 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted uppercase font-bold mb-1">
                        {item.icon}
                        {item.label}
                      </div>
                      <div className={`text-sm font-bold ${item.highlight ? theme.text : 'text-text-primary'}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Business Impact Summary */}
              <div className="bg-bg-card p-4 rounded-lg border border-border/50 text-xs text-text-secondary leading-relaxed">
                <h4 className="font-bold text-white flex items-center gap-1.5 mb-1.5 uppercase text-[10px] tracking-wider">
                  <Info className="w-3.5 h-3.5 text-accent-blue shrink-0" /> Business Impact
                </h4>
                <p className="break-words">{getPendingImpactSummary(dealer)}</p>
              </div>

              {/* Pending Order Aging Breakdown */}
              {historyMonths.length > 0 && (
                <div>
                  <h4 className="text-[10px] text-text-muted font-extrabold uppercase tracking-widest mb-3">
                    Order Aging Breakdown
                  </h4>
                  <div className="space-y-2 bg-bg-card p-4 rounded-lg border border-border/50">
                    {historyMonths.map(month => {
                      const vol = pendingHistory[month] || 0;
                      const monthDate = new Date(month + '-01');
                      const ageDays = Math.round((new Date() - monthDate) / (1000 * 60 * 60 * 24));
                      const pctOfTotal = dealer.pendingQty > 0 ? Math.round((vol / dealer.pendingQty) * 100) : 0;
                      const ageColor = ageDays >= 120 ? '#ef4444' : ageDays >= 90 ? '#f97316' : ageDays >= 60 ? '#eab308' : ageDays >= 30 ? '#94a3b8' : '#22c55e';
                      const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                      return (
                        <div key={month} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: ageColor }}></div>
                              <span className="font-bold text-slate-200">{monthLabel}</span>
                              <span className="text-text-muted text-[10px]">({ageDays}d old)</span>
                            </div>
                            <span className="font-semibold text-text-primary">{formatNum(vol)} MT</span>
                          </div>
                          <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pctOfTotal)}%`, background: ageColor }}></div>
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
                  <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Current Dispatch</div>
                  <div className={`text-sm font-bold ${dealer.cur === 0 ? 'text-severity-critical' : 'text-text-primary'}`}>{formatNum(dealer.cur)} MT</div>
                </div>
                <div className="bg-bg-card border border-border/50 rounded-lg p-3">
                  <div className="text-[10px] text-text-muted uppercase font-bold mb-1">Previous Dispatch</div>
                  <div className="text-sm font-bold text-text-primary">{formatNum(dealer.prev)} MT</div>
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
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 25, left: 10 }}>
                          {/* Risk zone backgrounds */}
                          <ReferenceArea x1={90} x2={maxAge + 10} y1={100} y2={maxVol + 50} fill="#ef4444" fillOpacity={0.06} />
                          <ReferenceArea x1={60} x2={90} y1={100} y2={maxVol + 50} fill="#f97316" fillOpacity={0.05} />
                          <ReferenceArea x1={90} x2={maxAge + 10} y1={0} y2={100} fill="#f97316" fillOpacity={0.04} />
                          <ReferenceArea x1={0} x2={60} y1={0} y2={100} fill="#3b82f6" fillOpacity={0.03} />
                          <XAxis type="number" dataKey="x" tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#1e293b" domain={[0, maxAge + 10]}
                            label={{ value: 'Backlog Age (days)', position: 'bottom', offset: 8, fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                          <YAxis type="number" dataKey="y" tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#1e293b" domain={[0, 'auto']}
                            label={{ value: 'Pending Volume (MT)', angle: -90, position: 'insideLeft', offset: 0, fill: '#64748b', fontSize: 10, fontWeight: 600 }} />
                          <ZAxis type="number" dataKey="z" range={[30, 200]} />
                          <ChartTooltip content={<PendingChartTooltipContent />} />
                          <ReferenceLine x={60} stroke="rgba(249,115,22,0.2)" strokeDasharray="4 4" />
                          <ReferenceLine x={90} stroke="rgba(239,68,68,0.2)" strokeDasharray="4 4" />
                          <ReferenceLine y={100} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                          <Scatter data={highlightedChartData}>
                            {highlightedChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={entry.opacity ?? 1} />
                            ))}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  {/* Zone legend */}
                  <div className="flex flex-wrap gap-3 mt-3 text-[9px] font-semibold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(239,68,68,0.3)' }}></span><span className="text-text-muted">Critical Zone (90d+, 100MT+)</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(249,115,22,0.3)' }}></span><span className="text-text-muted">High Risk (60-90d)</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: 'rgba(59,130,246,0.2)' }}></span><span className="text-text-muted">Normal (&lt;60d)</span></span>
                  </div>
                </div>
              </div>

              {/* Recommended Actions */}
              <div>
                <h4 className="flex items-center gap-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  <Briefcase className="w-4 h-4" /> Recommended Actions
                </h4>
                <div className="bg-bg-card border border-border/50 rounded-lg p-4 text-sm">
                  <div className="flex gap-3 items-start">
                    <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${pendingRisk.severity === 'CRITICAL' ? 'text-severity-critical' : pendingRisk.severity === 'HIGH' ? 'text-severity-high' : 'text-accent-blue'}`} />
                    <span className="text-text-primary leading-relaxed font-medium text-xs">{rec}</span>
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
                  className="w-full bg-bg-card border border-border/50 focus:border-accent-blue outline-none p-3 rounded-lg text-xs text-white placeholder-text-muted leading-relaxed resize-none"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); handleSaveNote(dealer.client); }}
                  disabled={!noteText.trim()}
                  className="mt-2 px-4 py-2 text-xs font-bold bg-accent-blue hover:bg-accent-blue/80 text-white rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                        <p className="text-slate-200 leading-relaxed font-medium break-words">{note.text}</p>
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


