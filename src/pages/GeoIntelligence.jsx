import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import { scaleQuantile } from 'd3-scale';
import { feature } from 'topojson-client';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, MapPin, BarChart2, Loader2, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';

const STATE_GEO_URL = '/geo/india_state.geojson';

const geoCache = {};
const projectionCache = {};

const districtTopoUrl = (stateName, slug) => {
  let activeSlug = slug || stateName
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z]/g, '');
  if (activeSlug === 'orissa' || activeSlug === 'orrisa') {
    activeSlug = 'odisha';
  }
  // Local-first: try /geo/{slug}.json, caller handles fallback
  return {
    local: `/geo/${activeSlug}.json`,
    remote: `https://raw.githubusercontent.com/guneetnarula/indian-district-boundaries/master/topojson/state-wise/${activeSlug}.json`,
  };
};

// ─── Douglas-Peucker Simplification ──────────────────────────────────────────
function simplifyPath(points, tolerance) {
  if (points.length <= 2) return points;
  let maxSqDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const sqDist = getSqSegDist(points[i], points[0], points[end]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }
  if (maxSqDist > tolerance * tolerance) {
    const results1 = simplifyPath(points.slice(0, index + 1), tolerance);
    const results2 = simplifyPath(points.slice(index), tolerance);
    return results1.slice(0, results1.length - 1).concat(results2);
  }
  return [points[0], points[end]];
}

function getSqSegDist(p, p1, p2) {
  let x = p1[0], y = p1[1];
  let dx = p2[0] - x, dy = p2[1] - y;
  if (dx !== 0 || dy !== 0) {
    let t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[0];
      y = p2[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyGeometry(geom, tolerance = 0.01) {
  if (!geom) return null;
  if (geom.type === 'Polygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map(ring => simplifyPath(ring, tolerance))
    };
  }
  if (geom.type === 'MultiPolygon') {
    return {
      ...geom,
      coordinates: geom.coordinates.map(polygon => 
        polygon.map(ring => simplifyPath(ring, tolerance))
      )
    };
  }
  return geom;
}

function simplifyFeatureCollection(features, tolerance = 0.01) {
  return features.map(f => ({
    ...f,
    geometry: simplifyGeometry(f.geometry, tolerance)
  }));
}

// ─── Key Normalization Helper ────────────────────────────────────────────────
const normalizeKey = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');
};

function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const districtAliases = {
  // ── West Bengal ──
  'paschimmedinipur':  'medinipurwest',
  'purbamedinipur':    'medinipureast',
  'southtwentyfourparganas': 'south24parganas',
  'northtwentyfourparganas': 'north24parganas',
  'westmidnapore': 'medinipurwest',
  'eastmidnapore': 'medinipureast',
  'westmidnapur': 'medinipurwest',
  'eastmidnapur': 'medinipureast',
  'paschimmidnapore': 'medinipurwest',
  'purbamidnapore': 'medinipureast',
  'purgamedinipur': 'medinipureast',
  // ── Arunachal Pradesh — cities → parent district ──
  'itanagar':   'papumpare',
  'hollongi':   'papumpare',
  'naharlagun': 'papumpare',
  // ── Assam ──
  'guwahati':        'kamrup',
  'dispur':          'kamrup',
  'kamrupmetro':     'kamrupmetropolitan',
  'silchar':         'cachar',
  // ── Bihar ──
  'patna':           'patna',
  'purbichamparan':  'eastchamparan',
  // ── Jharkhand ──
  'jamshedpur':      'purbisinghbhum',
  'eastsinghbhum':   'purbisinghbhum',
  'koderma':         'kodarma',
  'seraikelakharsawan': 'saraikelakharsawan',
  // ── Odisha ──
  'balasore':        'baleshwar',
  'baleswar':        'baleshwar',
  'berhampur':       'ganjam',
  'bhubaneswar':     'khordha',
  'jagatsinghpur':   'jagatsinghapur',
  'jajpur':          'jajapur',
  'keshpur':         'khordha',
  // ── Rajasthan ──
  'junjhunu':        'jhunjhunu',
  // Fix: raw CSV stores "CHURU DISTRICT" → lookupKey "churudistrict" but TopoJSON polygon is "Churu"
  // These backward-compat aliases handle existing Supabase data until the KPI node is re-run
  'churudistrict':   'churu',
  'jaipurdistrict':  'jaipur',
  'jodhpurdistrict': 'jodhpur',
  'udaipurdistrict': 'udaipur',
  'bikanerdistrict': 'bikaner',
  'kotadistrict':    'kota',
  'alwardistrict':   'alwar',
  'ajmerdistrict':   'ajmer',
  'sikardistrict':   'sikar',
  'nagaurdistrict':  'nagaur',
};

function resolveDistrict(name) {
  const n = normalizeName(name).replace(/district$/, '');
  return districtAliases[n] ?? n;
}

// ─── Geo Visualization Layer (isolated — never mutates global state) ──────────
const NO_DATA_COLOR = '#1e2535';
const HEAT_COLORS = [
  '#1e3a8a', // Dark blue — lowest risk / growing
  '#1d4ed8', // Strong blue — low risk
  '#2563eb', // Rich royal blue — moderate risk
  '#3b82f6', // Medium blue — high risk
  '#60a5fa', // Sky blue — critical risk (vibrant, not white)
];
const HEAT_LABELS = [
  'Lowest Risk',
  'Low Risk',
  'Moderate Risk',
  'High Risk',
  'Critical Risk',
];

// ─── Map dimensions ───────────────────────────────────────────────────────────
const STATE_W = 900;
const STATE_H = 700;
const DIST_W = 950;
const DIST_H = 750;
const INDIA_CENTER = [82.8, 22.5];
const INDIA_SCALE  = 1050;

// Build a Mercator projection fitted to the SVG viewport
function makeProjection(center = INDIA_CENTER, scale = INDIA_SCALE, w = STATE_W, h = STATE_H) {
  return geoMercator()
    .center(center)
    .scale(scale)
    .translate([w / 2, h / 2]);
}

// ─── Utility: normalise name for fuzzy matching ───────────────────────────────
function norm(s = '') {
  let key = s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '');
  if (key === 'orissa' || key === 'orrisa') return 'odisha';
  return key;
}

const normKey = (value = "") => {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/paraganas|paragans|pargans|paragnas|prgs/g, "parganas");
};

import { calculateMoM, getTrendColor as _getTrendColor, formatTrend, getBusinessImpact } from '../utils/trendEngine';
import { useData } from '../context/DataContext';
import ImpactBadge from '../components/common/ImpactBadge';
import SeverityBadge from '../components/common/SeverityBadge';
import { getSeverityMeta } from '../utils/severity';
import { formatMT, formatNumber } from '../utils/formatters';
import { getPendingForPeriod, getTotalPendingForPeriod, getSharePctForPeriod, getBacklogClearance, isAgingPeriod } from '../utils/pending';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTrendColor(t, cur, prev) {
  if (t == null) return '#94a3b8';
  return _getTrendColor(t, cur, prev);
}

function trendStr(t) {
  if (t == null) return 'N/A';
  const val = Number(t);
  if (val > 0) return `+${val.toFixed(1)}%`;
  if (val < 0) return `↓ ${Math.abs(val).toFixed(1)}%`;
  return `0.0%`;
}

// getBacklogClearance is imported from utils/pending.js


// ─── Tooltip (fixed-positioned, follows mouse) ────────────────────────────────
function Tooltip({ tooltipRef, visible, name, data, filterType, totalPending, selectedPendingMonth }) {
  if (!visible || !name) return null;
  
  const isPending = filterType === "PENDING";
  const pendingQty = isPending ? getPendingForPeriod(data, selectedPendingMonth) : (data ? (data.volume ?? 0) : 0);
  const dailyAvg = data ? (data.dailyAvgQty ?? 0) : 0;
  const clearance = getBacklogClearance(pendingQty, dailyAvg);
  const sharePct = isPending ? getSharePctForPeriod(data, selectedPendingMonth, totalPending) : 0;

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none fixed z-[9999] border transition-transform duration-75 bg-bg-elevated border-border-accent rounded-lg px-3.5 py-2.5 text-xs shadow-none"
      style={{
        left: 0,
        top:  0,
        transform: 'translate3d(0, 0, 0)',
        minWidth: 190,
      }}
    >
      <div className="font-bold text-text-primary mb-2 text-sm truncate">{name}</div>
      {data ? (
        <div className="space-y-1.5">
          <Row 
            label={isPending ? "Pending" : "Volume"} 
            value={formatMT(isPending ? pendingQty : data.volume)} 
          />
          {isPending ? (
            <>
              {selectedPendingMonth !== 'ALL' && (
                <Row 
                  label="Total Backlog" 
                  value={formatMT(getPendingForPeriod(data, 'ALL'))} 
                />
              )}
              <Row 
                label="Share" 
                value={`${sharePct.toFixed(1)}%`} 
              />
              <div className="flex justify-between gap-6 items-center">
                <span className="text-text-muted">Clearance</span>
                <span className="font-semibold text-text-secondary">
                  {clearance.text}
                </span>
                <SeverityBadge severity={clearance.status} />
              </div>
            </>
          ) : (
            <>
              <Row 
                label="Change" 
                value={trendStr(data.trend)} 
              />
              <div className="flex justify-between gap-6 items-center">
                <span className="text-text-muted">Alert</span>
                <SeverityBadge severity={data.impactTier || 'LOW'} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="text-text-muted italic">No data</div>
      )}
    </div>
  );
}
function Row({ label, value, valueColor }) {
  return (
    <div className="flex justify-between gap-6 items-center">
      <span className="text-text-muted">{label}</span>
      <span className="font-semibold text-text-primary" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
    </div>
  );
}

// ─── Legend strip (adaptive business risk) ───────────────────────────────────
function Legend({ colors = HEAT_COLORS, labels = HEAT_LABELS }) {
  const items = [
    { color: NO_DATA_COLOR, label: 'No Data' },
    ...colors.map((c, i) => ({ color: c, label: labels[i] || '' })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1 text-xs text-text-secondary font-medium">
          <div className="w-3 h-3 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

// ─── Ranked entry row ─────────────────────────────────────────────────────────
function RankRow({ rank, name, volume, trend, cur, prev, isTop }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg-card transition-colors">
      <span className={`w-5 h-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center ${
        isTop ? 'bg-severity-none/15 text-severity-none' : 'bg-severity-critical/15 text-severity-critical'
      }`}>
        {rank}
      </span>
      <span className="flex-1 text-xs text-text-secondary truncate">{name}</span>
      <span className="text-xs font-semibold text-text-primary shrink-0">
        {formatNumber(volume)}
      </span>
      {trend != null && (
        <span className="text-[10px] shrink-0 font-bold" style={{ color: getTrendColor(trend, cur, prev) }}>
          {trendStr(trend)}
        </span>
      )}
    </div>
  );
}

const capitalizeWord = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// ─── Main Component ───────────────────────────────────────────────────────────
function parseMonthKey(periodStr) {
  if (!periodStr) return "";
  const parts = periodStr.split(/\s*(?:[-–—]|to)\s*/);
  if (parts.length < 2) return "";
  const endPart = parts[parts.length - 1];
  const match = endPart.match(/([a-zA-Z]{3,9})\s+(\d{4})/);
  if (match) {
    const month = match[1];
    const year = match[2];
    return `${month} ${year}`;
  }
  return "";
}

function findAvailableMonth(selMonth, availMonths) {
  if (!selMonth || !availMonths?.length) return null;
  const match = selMonth.match(/([a-zA-Z]+)\s+(\d{4})/);
  if (!match) return null;

  const selMonthStr = match[1].toLowerCase();
  const selYear = parseInt(match[2], 10);

  const shortMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const longMonths = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

  let selMonthIdx = shortMonths.findIndex(m => selMonthStr.startsWith(m));
  if (selMonthIdx === -1) {
    selMonthIdx = longMonths.findIndex(m => selMonthStr.startsWith(m));
  }
  if (selMonthIdx === -1) return null;

  const targetMonthNum = selMonthIdx + 1; // 1-indexed
  return availMonths.find(m => m.year === selYear && m.month === targetMonthNum);
}

export default function GeoIntelligence({ salesData: propSalesData, pendingAvailableMonths = [] }) {
  const { rawData } = useData();

  // ── filter state ──
  const [filterState, setFilterState] = useState({
    type: "DESPATCH",
    item: [],
  });
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedPendingMonth, setSelectedPendingMonth] = useState(() => pendingAvailableMonths[0]?.periodKey || '');

  useEffect(() => {
    if (pendingAvailableMonths && pendingAvailableMonths.length > 0 && !selectedPendingMonth) {
      setSelectedPendingMonth(pendingAvailableMonths[0].periodKey);
    }
  }, [pendingAvailableMonths, selectedPendingMonth]);

  const sortedPendingMonths = useMemo(() => {
    return [...pendingAvailableMonths].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [pendingAvailableMonths]);

  // ── parse periods from metadata & build dynamic months list ──
  const monthButtons = useMemo(() => {
    if (!rawData) return { buttons: [], curMonthLabel: "", prevMonthLabel: "", curMonthKey: "", prevMonthKey: "" };
    
    const curPeriod = rawData.meta?.curPeriod || rawData.curPeriod || "";
    const prevPeriod = rawData.meta?.prevPeriod || rawData.prevPeriod || "";
    const ytdPeriod = rawData.meta?.ytdPeriod || rawData.ytdPeriod || "1 Jan 2026 - 31 May 2026";

    const curMonthKey = parseMonthKey(curPeriod);
    const prevMonthKey = parseMonthKey(prevPeriod);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const list = [];

    const parseDateString = (str) => {
      const matches = str.match(/([a-zA-Z]+)\s+(\d{4})/);
      if (matches) {
        const monthStr = matches[1];
        const year = parseInt(matches[2], 10);
        const monthIdx = months.findIndex(m => monthStr.toLowerCase().startsWith(m.toLowerCase()));
        if (monthIdx !== -1) {
          return { monthIdx, year, monthName: months[monthIdx] };
        }
      }
      return null;
    };

    const ytdParts = ytdPeriod.split(/\s*(?:[-–—]|to)\s*/).map(s => s.trim());
    let startInfo = null;
    let endInfo = null;
    if (ytdParts.length === 2) {
      startInfo = parseDateString(ytdParts[0]);
      endInfo = parseDateString(ytdParts[1]);
    }

    if (startInfo && endInfo) {
      let currYear = startInfo.year;
      let currMonth = startInfo.monthIdx;
      const endYear = endInfo.year;
      const endMonth = endInfo.monthIdx;

      while (currYear < endYear || (currYear === endYear && currMonth <= endMonth)) {
        const name = months[currMonth];
        const key = `${name} ${currYear}`;
        list.push({
          value: key,
          label: key,
          fullName: key,
        });
        currMonth++;
        if (currMonth > 11) {
          currMonth = 0;
          currYear++;
        }
      }
    }

    if (curMonthKey && !list.some(item => item.value === curMonthKey)) {
      list.push({
        value: curMonthKey,
        label: `${curMonthKey} (MTD)`,
        fullName: `${curMonthKey} (MTD)`,
      });
    }

    return {
      buttons: list,
      curMonthLabel: curMonthKey ? `${curMonthKey} (MTD)` : "Current (MTD)",
      prevMonthLabel: prevMonthKey || "Previous Month",
      curMonthKey,
      prevMonthKey,
    };
  }, [rawData]);

  useEffect(() => {
    if (monthButtons.curMonthKey && !selectedMonth) {
      setSelectedMonth(monthButtons.curMonthKey);
    }
  }, [monthButtons.curMonthKey, selectedMonth]);

  // ── dynamic total volume calculation for share percentage ──
  const totalVolume = useMemo(() => {
    if (!rawData) return { cur: 1, prev: 1 };
    
    if (filterState.type === "PENDING") {
      const statesList = (rawData.states || []).filter(s => s.state && s.state.toLowerCase() !== 'unknown');
      let totalCur = 0;
      statesList.forEach(rawState => {
        let cur = getPendingForPeriod(rawState, selectedPendingMonth);
        if (filterState.item.length > 0) {
          const productCurTotal = (rawState.products || [])
            .filter(p => filterState.item.includes(p.product))
            .reduce((sum, p) => sum + (p.cur || 0), 0);
          const stateCurTotal = (rawState.products || [])
            .reduce((sum, p) => sum + (p.cur || 0), 0);
          const ratio = stateCurTotal > 0 ? (productCurTotal / stateCurTotal) : 0;
          cur = cur * ratio;
        }
        totalCur += cur;
      });
      return {
        cur: totalCur || 1,
        prev: 1
      };
    }
    
    const isCur = selectedMonth === monthButtons.curMonthKey;
    const isPrev = selectedMonth === monthButtons.prevMonthKey;
    if (!isCur && !isPrev && rawData.availableMonths && rawData.monthlyHistory) {
      const avail = findAvailableMonth(selectedMonth, rawData.availableMonths);
      const periodKey = avail ? avail.periodKey : null;
      const slice = periodKey ? rawData.monthlyHistory[periodKey] : null;
      if (slice) {
        let totalCur = slice.total || 0;
        if (filterState.item.length > 0) {
          totalCur = (slice.products || [])
            .filter(p => filterState.item.includes(p.product?.toUpperCase()))
            .reduce((sum, p) => sum + (p.qty || 0), 0);
        }
        return {
          cur: totalCur || 1,
          prev: 1
        };
      }
    }

    let totalCur = 0;
    let totalPrev = 0;
    
    const statesList = (rawData.states || []).filter(s => s.state && s.state.toLowerCase() !== 'unknown');
    totalCur = statesList.reduce((sum, s) => sum + (s.cur || 0), 0);
    totalPrev = statesList.reduce((sum, s) => sum + (s.prev || 0), 0);
    
    return {
      cur: totalCur || 1,
      prev: totalPrev || 1
    };
  }, [rawData, filterState.type, filterState.item, selectedMonth, monthButtons, selectedPendingMonth]);

  // ── aggregate filtered salesData ──
  const filteredSalesData = useMemo(() => {
    if (!propSalesData || !rawData) return { states: {}, districts: {} };

    const states = {};
    const districts = {};

    if (filterState.type === "PENDING") {
      const statesList = (rawData.states || []).filter(s => s.state && s.state.toLowerCase() !== 'unknown');
      
      statesList.forEach(rawState => {
        const stateName = rawState.state;
        const s = propSalesData.states[stateName] || {};
        
        let cur = getPendingForPeriod(rawState, selectedPendingMonth);
        
        if (filterState.item.length > 0) {
          const productCurTotal = (rawState.products || [])
            .filter(p => filterState.item.includes(p.product))
            .reduce((sum, p) => sum + (p.cur || 0), 0);
          const stateCurTotal = (rawState.products || [])
            .reduce((sum, p) => sum + (p.cur || 0), 0);
          const ratio = stateCurTotal > 0 ? (productCurTotal / stateCurTotal) : 0;
          cur = cur * ratio;
        }

        const sharePct = (cur / (totalVolume.cur || 1)) * 100;
        const { impactScore, severity, theme } = getBusinessImpact(cur, 0, sharePct, 'STATE', stateName);

        states[stateName] = {
          ...s,
          name: stateName,
          cur,
          prev: 0,
          volume: cur,
          pendingQty: rawState.pendingQty ?? 0,
          pendingHistory: rawState.pendingHistory ?? {},
          trend: null,
          impactScore,
          impact: severity,
          impactTier: severity,
          healthStatus: severity,
          healthColor: theme.color,
        };
      });

      Object.entries(propSalesData.districts || {}).forEach(([stateName, districtMap]) => {
        if (!stateName || stateName.toLowerCase() === 'unknown') return;
        districts[stateName] = {};

        Object.entries(districtMap).forEach(([districtName, d]) => {
          if (!districtName || districtName.toLowerCase() === 'unknown') return;
          const rawDist = (rawData.districts || []).find(rd => rd.lookupKey === d.lookupKey) || {};

          let cur = getPendingForPeriod(rawDist, selectedPendingMonth);
          
          if (filterState.item.length > 0) {
            const productCurTotal = (rawDist.products || [])
              .filter(p => filterState.item.includes(p.product))
              .reduce((sum, p) => sum + (p.cur || 0), 0);
            const distCurTotal = (rawDist.products || [])
              .reduce((sum, p) => sum + (p.cur || 0), 0);
            const ratio = distCurTotal > 0 ? (productCurTotal / distCurTotal) : 0;
            cur = cur * ratio;
          }

          const distShare = (cur / (totalVolume.cur || 1)) * 100;
          const { impactScore, severity, theme } = getBusinessImpact(cur, 0, distShare, 'DISTRICT', stateName);

          districts[stateName][districtName] = {
            ...d,
            name: districtName,
            cur,
            prev: 0,
            volume: cur,
            pendingQty: rawDist.pendingQty ?? 0,
            pendingHistory: rawDist.pendingHistory ?? {},
            trend: null,
            impactScore,
            impact: severity,
            impactTier: severity,
            healthStatus: severity,
            healthColor: theme.color,
          };
        });
      });

      return { states, districts };
    }

    // Despatch / All filter Month
    const isCur = selectedMonth === monthButtons.curMonthKey;
    const isPrev = selectedMonth === monthButtons.prevMonthKey;

    const getPrevPeriodKey = (pKey) => {
      if (!pKey) return null;
      const [year, month] = pKey.split('-').map(Number);
      if (month === 1) return `${year - 1}-12`;
      return `${year}-${String(month - 1).padStart(2, '0')}`;
    };

    if (!isCur && !isPrev && rawData.availableMonths && rawData.monthlyHistory) {
      const avail = findAvailableMonth(selectedMonth, rawData.availableMonths);
      const periodKey = avail ? avail.periodKey : null;
      const historySlice = periodKey ? rawData.monthlyHistory[periodKey] : null;
      const prevPeriodKey = getPrevPeriodKey(periodKey);
      const prevHistorySlice = prevPeriodKey ? rawData.monthlyHistory[prevPeriodKey] : null;

      // Compile states from the selected month's historical snapshot
      (historySlice?.states || []).forEach(hs => {
        const stateName = hs.state;
        if (!stateName || stateName.toLowerCase() === 'unknown') return;

        const prevHistState = (prevHistorySlice?.states || []).find(phs => phs.state?.toLowerCase() === stateName.toLowerCase());

        let cur = hs.qty || 0;
        let prev = prevHistState ? prevHistState.qty : 0;

        if (filterState.item.length > 0) {
          cur = 0; prev = 0;
          (hs.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) cur += p.qty || 0;
          });
          (prevHistState?.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) prev += p.qty || 0;
          });
        }

        const displayVolume = cur;
        const trend = calculateMoM(cur, prev);
        const sharePct = (cur / (totalVolume.cur || 1)) * 100;
        const { impactScore, severity, theme } = getBusinessImpact(cur, prev, sharePct, 'STATE', stateName);

        states[stateName] = {
          cur,
          prev,
          volume: displayVolume,
          trend,
          impactScore,
          impact: severity,
          impactTier: severity,
          healthStatus: severity,
          healthColor: theme.color,
          slug: hs.slug || '',
        };
      });

      // Compile districts from the selected month's historical snapshot
      (historySlice?.districts || []).forEach(hd => {
        const stateName = hd.state;
        const districtName = hd.district;
        if (!stateName || stateName.toLowerCase() === 'unknown') return;
        if (!districtName || districtName.toLowerCase() === 'unknown') return;

        if (!districts[stateName]) districts[stateName] = {};

        const prevHistDist = (prevHistorySlice?.districts || []).find(phd => phd.state?.toLowerCase() === stateName.toLowerCase() && phd.district?.toLowerCase() === districtName.toLowerCase());

        let cur = hd.qty || 0;
        let prev = prevHistDist ? prevHistDist.qty : 0;

        if (filterState.item.length > 0) {
          cur = 0; prev = 0;
          (hd.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) cur += p.qty || 0;
          });
          (prevHistDist?.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) prev += p.qty || 0;
          });
        }

        const displayVolume = cur;
        const trend = calculateMoM(cur, prev);
        const distShare = (cur / (totalVolume.cur || 1)) * 100;
        const { impactScore, severity, theme } = getBusinessImpact(cur, prev, distShare, 'DISTRICT', stateName);

        districts[stateName][districtName] = {
          lookupKey: hd.lookupKey,
          cur,
          prev,
          volume: displayVolume,
          trend,
          impactScore,
          impact: severity,
          impactTier: severity,
          healthStatus: severity,
          healthColor: theme.color,
          slug: hd.slug || '',
        };
      });

      return { states, districts };
    }

    Object.entries(propSalesData.states || {}).forEach(([stateName, s]) => {
      if (!stateName || stateName.toLowerCase() === 'unknown') return;

      const rawState = (rawData.states || []).find(rs => rs.state === stateName) || {};
      
      let cur = s.cur;
      let prev = s.prev;

      // Product Filter
      if (filterState.item.length > 0) {
        cur = 0; prev = 0;
        (rawState.products || []).forEach(p => {
          if (filterState.item.includes(p.product)) {
            cur += p.cur || 0;
            prev += p.prev || 0;
          }
        });
      }

      let displayVolume = 0;
      if (isCur) displayVolume = cur;
      else if (isPrev) displayVolume = prev;

      let trend = (isCur || isPrev) ? calculateMoM(cur, prev) : null;
      const sharePct = (cur / (totalVolume.cur || 1)) * 100;
      const { impactScore, severity, theme } = getBusinessImpact(cur, prev, sharePct, 'STATE', stateName, rawState.expectedMtd || s.expectedMtd);

      states[stateName] = {
        ...s,
        name: stateName,
        cur,
        prev,
        volume: displayVolume,
        trend,
        impactScore,
        impact: severity,
        impactTier: severity,
        healthStatus: severity,
        healthColor: theme.color,
      };
    });

    Object.entries(propSalesData.districts || {}).forEach(([stateName, districtMap]) => {
      if (!stateName || stateName.toLowerCase() === 'unknown') return;

      districts[stateName] = {};
      Object.entries(districtMap).forEach(([districtName, d]) => {
        if (!districtName || districtName.toLowerCase() === 'unknown') return;

        const rawDist = (rawData.districts || []).find(rd => rd.lookupKey === d.lookupKey) || {};
        
        let cur = d.cur;
        let prev = d.prev;

        // Product Filter
        if (filterState.item.length > 0) {
          cur = 0; prev = 0;
          (rawDist.products || []).forEach(p => {
            if (filterState.item.includes(p.product)) {
              cur += p.cur || 0;
              prev += p.prev || 0;
            }
          });
        }

        let displayVolume = 0;
        if (isCur) displayVolume = cur;
        else if (isPrev) displayVolume = prev;

        let trend = (isCur || isPrev) ? calculateMoM(cur, prev) : null;
        const distShare = (cur / (totalVolume.cur || 1)) * 100;
        const { impactScore, severity, theme } = getBusinessImpact(cur, prev, distShare, 'DISTRICT', stateName, rawDist.expectedMtd || d.expectedMtd);

        districts[stateName][districtName] = {
          ...d,
          name: districtName,
          cur,
          prev,
          volume: displayVolume,
          trend,
          impactScore,
          impact: severity,
          impactTier: severity,
          healthStatus: severity,
          healthColor: theme.color,
        };
      });
    });

    return { states, districts };
  }, [propSalesData, rawData, monthButtons, filterState, totalVolume, selectedMonth, selectedPendingMonth]);

  const isMonthAvailable = useMemo(() => {
    if (filterState.type === "PENDING") return true;
    if (selectedMonth === monthButtons.curMonthKey) return true;
    if (selectedMonth === monthButtons.prevMonthKey) return true;
    if (rawData && rawData.availableMonths) {
      return !!findAvailableMonth(selectedMonth, rawData.availableMonths);
    }
    return false;
  }, [selectedMonth, monthButtons, filterState.type, rawData]);

  const salesData = filteredSalesData;
  const availableProducts = useMemo(() => {
    if (!rawData || !rawData.products) return [];
    return rawData.products.map(p => p.product);
  }, [rawData]);

  // ── view state ──
  const [selectedState, setSelectedState]   = useState(null);
  const [stateGeo,      setStateGeo]        = useState(null);   // GeoJSON features[]
  const [districtGeo,   setDistrictGeo]     = useState(null);   // GeoJSON features[]
  const [geoLoading,    setGeoLoading]      = useState(true);
  const [distLoading,   setDistLoading]     = useState(false);
  const [distError,     setDistError]       = useState(null);

  // ── zoom/pan refs ──
  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const isDragging  = useRef(false);
  const dragStart   = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const zoomIndicatorRef = useRef(null);

  // ── hover tooltip content state ──
  const [tooltip, setTooltip] = useState({ visible: false, name: '', data: null });
  const tooltipRef = useRef(null);

  const applyTransform = useCallback(() => {
    if (gRef.current) {
      gRef.current.setAttribute("transform", `translate(${panXRef.current},${panYRef.current}) scale(${zoomRef.current})`);
    }
    if (zoomIndicatorRef.current) {
      zoomIndicatorRef.current.textContent = `${Math.round(zoomRef.current * 100)}%`;
    }
  }, []);

  // ── salesData lookup maps ──
  const stateMap = useMemo(() => {
    if (!salesData?.states) return {};
    const m = {};
    Object.entries(salesData.states).forEach(([k, v]) => {
      m[norm(k)] = { name: k, ...v };
    });
    return m;
  }, [salesData]);

  const districtMap = useMemo(() => {
    if (!salesData?.districts || !selectedState) return {};
    const src = salesData.districts[selectedState] ?? {};
    const m = {};
    // Aggregate volumes when multiple city entries resolve to the same district polygon
    Object.entries(src).forEach(([name, district]) => {
      const key = resolveDistrict(district.lookupKey || name);
      if (m[key]) {
        // Merge: sum cur/prev/volume, recalculate trend
        m[key].cur = (m[key].cur || 0) + (district.cur || 0);
        m[key].prev = (m[key].prev || 0) + (district.prev || 0);
        m[key].volume = (m[key].volume || 0) + (district.volume || 0);
        m[key].trend = calculateMoM(m[key].cur, m[key].prev);
        
        m[key].pendingQty = (m[key].pendingQty || 0) + (district.pendingQty || 0);
        if (district.pendingHistory) {
          if (!m[key].pendingHistory) m[key].pendingHistory = {};
          Object.entries(district.pendingHistory).forEach(([pk, val]) => {
            m[key].pendingHistory[pk] = (m[key].pendingHistory[pk] || 0) + val;
          });
        }
        
        const share = (m[key].cur / (totalVolume.cur || 1)) * 100;

        const bi = getBusinessImpact(m[key].cur, m[key].prev, share, 'DISTRICT', selectedState, m[key].expectedMtd);
        m[key].impactScore = bi.impactScore;
        m[key].impact = bi.severity;
        m[key].impactTier = bi.severity;
        m[key].healthStatus = bi.severity;
        m[key].healthColor = bi.theme.color;
        // Track sub-cities for display
        if (!m[key]._subCities) m[key]._subCities = [m[key].name];
        m[key]._subCities.push(name);
        m[key].name = m[key].name; // keep first name as primary
      } else {
        m[key] = { ...district, name };
        if (district.pendingHistory) {
          m[key].pendingHistory = { ...district.pendingHistory };
        }
      }
      
      const nameKey = resolveDistrict(name);
      if (nameKey !== key && !m[nameKey]) {
        // Also store under the name key for direct lookups
        m[nameKey] = m[key];
      }
    });
    return m;
  }, [salesData, selectedState, totalVolume]);

  // ── load state GeoJSON on mount ──
  useEffect(() => {
    if (geoCache['__states__']) {
      setStateGeo(geoCache['__states__']);
      setGeoLoading(false);
      return;
    }
    fetch(STATE_GEO_URL)
      .then(r => r.json())
      .then(gj => {
        const simplified = simplifyFeatureCollection(gj.features, 0.01);
        geoCache['__states__'] = simplified;
        setStateGeo(simplified);
      })
      .catch(console.error)
      .finally(() => setGeoLoading(false));
  }, []);


  // ── district name comparison log ──
  useEffect(() => {
    if (selectedState && districtGeo && salesData?.districts?.[selectedState]) {
      const topoNames = districtGeo.map(d => d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || "");
      const resolvedTopoNames = topoNames.map(name => resolveDistrict(name));
      const rawDataNames = Object.keys(salesData.districts[selectedState]);
      const resolvedRawDataNames = rawDataNames.map(name => resolveDistrict(name));
      
      console.log(`[GeoIntelligence] District names in TopoJSON for ${selectedState}:`, topoNames);
      console.log(`[GeoIntelligence] Resolved District names in TopoJSON:`, resolvedTopoNames);
      console.log(`[GeoIntelligence] District names in rawData for ${selectedState}:`, rawDataNames);
      console.log(`[GeoIntelligence] Resolved District names in rawData:`, resolvedRawDataNames);
    }
  }, [selectedState, districtGeo, salesData]);

  // ── load district TopoJSON when state selected ──
  const handleStateClick = useCallback(async (name) => {
    const stateEntry = stateMap[norm(name)];
    const canonicalName = stateEntry ? stateEntry.name : name;
    const slug = stateEntry ? stateEntry.slug : null;

    setSelectedState(canonicalName);
    setDistrictGeo(null);
    setDistError(null);
    setDistLoading(true);
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;

    if (geoCache[canonicalName]) {
      setDistrictGeo(geoCache[canonicalName]);
      setDistLoading(false);
      return;
    }
    try {
      const urls = districtTopoUrl(canonicalName, slug);
      let topo;
      try {
        // Try local file first
        const localRes = await fetch(urls.local);
        if (!localRes.ok) throw new Error(`Local ${localRes.status}`);
        topo = await localRes.json();
      } catch {
        // Fallback to remote GitHub
        const remoteRes = await fetch(urls.remote);
        if (!remoteRes.ok) throw new Error(`HTTP ${remoteRes.status}`);
        topo = await remoteRes.json();
      }
      const key  = Object.keys(topo.objects)[0];
      const geo  = feature(topo, topo.objects[key]);
      const simplified = simplifyFeatureCollection(geo.features, 0.01);
      geoCache[canonicalName] = simplified;
      setDistrictGeo(simplified);
    } catch (e) {
      setDistError(e.message);
    } finally {
      setDistLoading(false);
    }
  }, [stateMap]);

  const handleBack = useCallback(() => {
    setSelectedState(null);
    setDistrictGeo(null);
    setDistError(null);
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
  }, []);

  // ── zoom controls ──
  const zoomIn  = useCallback(() => {
    zoomRef.current = Math.min(zoomRef.current * 1.4, 10);
    applyTransform();
  }, [applyTransform]);

  const zoomOut = useCallback(() => {
    zoomRef.current = Math.max(zoomRef.current / 1.4, 0.5);
    applyTransform();
  }, [applyTransform]);

  const resetView = useCallback(() => {
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
    applyTransform();
  }, [applyTransform]);

  // ── drag handlers ──
  const onMouseDown = useCallback((e) => {
    isDragging.current = true;
    dragStart.current  = { x: e.clientX, y: e.clientY, px: panXRef.current, py: panYRef.current };
  }, []);

  const onMouseMove = useCallback((e) => {
    if (isDragging.current) {
      panXRef.current = dragStart.current.px + (e.clientX - dragStart.current.x);
      panYRef.current = dragStart.current.py + (e.clientY - dragStart.current.y);
      applyTransform();
    }
  }, [applyTransform]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // ── wheel zoom ──
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    zoomRef.current = Math.min(Math.max(zoomRef.current * factor, 0.5), 10);
    applyTransform();
  }, [applyTransform]);

  // ── Dynamic Map Size ──
  const W = selectedState ? DIST_W : STATE_W;
  const H = selectedState ? DIST_H : STATE_H;

  // ── projection (for state/district auto-fit) ──
  const projection = useMemo(() => {
    const key = selectedState ? `dist_${selectedState}` : 'state_national';
    if (projectionCache[key]) {
      return projectionCache[key];
    }
    const features = selectedState ? districtGeo : stateGeo;
    if (!features?.length) {
      return geoMercator()
        .center(INDIA_CENTER)
        .scale(INDIA_SCALE)
        .translate([W / 2, H / 2]);
    }
    const proj = geoMercator().fitSize([W, H], { type: 'FeatureCollection', features });
    projectionCache[key] = proj;
    return proj;
  }, [selectedState, stateGeo, districtGeo, W, H]);

  const pathGen = useMemo(() => geoPath().projection(projection), [projection]);

  // ── normalized key lookup maps ──
  const normalizedStateDataMap = useMemo(() => {
    if (!salesData?.states) return {};
    const map = {};
    Object.entries(salesData.states).forEach(([name, data]) => {
      map[normalizeKey(name)] = { name, ...data };
    });
    return map;
  }, [salesData]);

  const normalizedDistrictDataMap = useMemo(() => {
    if (!salesData?.districts || !selectedState) return {};
    const src = salesData.districts[selectedState] ?? {};
    const map = {};
    // Aggregate city entries into parent district polygons
    Object.entries(src).forEach(([name, data]) => {
      const key1 = resolveDistrict(data.lookupKey);
      const key2 = resolveDistrict(name);
      const keys = new Set([key1, key2].filter(Boolean));
      keys.forEach(key => {
        if (map[key]) {
          // Merge volumes
          map[key].cur = (map[key].cur || 0) + (data.cur || 0);
          map[key].prev = (map[key].prev || 0) + (data.prev || 0);
          map[key].volume = (map[key].volume || 0) + (data.volume || 0);
          map[key].trend = calculateMoM(map[key].cur, map[key].prev);
          
          map[key].pendingQty = (map[key].pendingQty || 0) + (data.pendingQty || 0);
          if (data.pendingHistory) {
            if (!map[key].pendingHistory) map[key].pendingHistory = {};
            Object.entries(data.pendingHistory).forEach(([pk, val]) => {
              map[key].pendingHistory[pk] = (map[key].pendingHistory[pk] || 0) + val;
            });
          }
          
          const share = (map[key].cur / (totalVolume.cur || 1)) * 100;

          const bi = getBusinessImpact(map[key].cur, map[key].prev, share, 'DISTRICT', selectedState, map[key].expectedMtd);
          map[key].impactScore = bi.impactScore;
          map[key].impact = bi.severity;
          map[key].healthColor = bi.theme.color;
        } else {
          map[key] = { name, ...data };
          if (data.pendingHistory) {
            map[key].pendingHistory = { ...data.pendingHistory };
          }
        }
      });
    });
    return map;
  }, [salesData, selectedState, totalVolume]);

  // ── ranked lists ──
  const rankedStates = useMemo(() => {
    const list = Object.values(stateMap)
      .filter(e => e.volume != null && (filterState.type !== "PENDING" || e.volume > 0))
      .sort((a, b) => b.volume - a.volume);
    
    const seen = new Set();
    const deduped = [];
    for (const item of list) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        deduped.push(item);
      }
    }
    return deduped;
  }, [stateMap, filterState.type]);

  const rankedDistricts = useMemo(() => {
    if (!selectedState) return [];
    const src = districtMap;
    const list = Object.values(src)
      .filter(e => e.volume != null && (filterState.type !== "PENDING" || e.volume > 0))
      .sort((a, b) => b.volume - a.volume);
      
    const seen = new Set();
    const deduped = [];
    for (const item of list) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        deduped.push(item);
      }
    }
    return deduped;
  }, [selectedState, districtMap, filterState.type]);

  const rankedList = selectedState ? rankedDistricts : rankedStates;

  const totalPendingVolume = useMemo(() => {
    if (filterState.type !== "PENDING") return 0;
    return getTotalPendingForPeriod(rankedList, selectedPendingMonth);
  }, [rankedList, filterState.type, selectedPendingMonth]);

  // ── tooltip helpers ──
  const showTip = useCallback((e, name, entry) => {
    const clientX = e.clientX;
    const clientY = e.clientY;
    setTooltip({ visible: true, name, data: entry ?? null });
    requestAnimationFrame(() => {
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${clientX + 16}px`;
        tooltipRef.current.style.top = `${clientY - 12}px`;
      }
    });
  }, []);

  const moveTip = useCallback((e) => {
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX + 16}px`;
      tooltipRef.current.style.top = `${e.clientY - 12}px`;
    }
  }, []);

  const hideTip = useCallback(() => {
    setTooltip(t => t.visible ? { ...t, visible: false } : t);
  }, []);

  // ── render features ──
  const activeFeatures = selectedState ? districtGeo : stateGeo;
  const activeMap      = selectedState ? districtMap : stateMap;

  // ── Adaptive Geo Heat Scoring (local visualization layer — NEVER mutates global state) ──
  const { heatColorScale, geoHeatMap } = useMemo(() => {
    const entries = Object.entries(activeMap);
    const heatMap = {};
    
    const isMtd = selectedMonth === monthButtons.curMonthKey || selectedMonth === "MTD";
    const isPrevMonth = selectedMonth === monthButtons.prevMonthKey || selectedMonth === monthButtons.prevMonthLabel;
    const isHistorical = !isMtd && !isPrevMonth;

    if (isHistorical && filterState.type !== "PENDING") {
      // Detect whether we have REAL historical data: if ANY entry has volume > 0,
      // real monthlyHistory was loaded. If all volume=0, it's a fallback to MTD cur
      // values — in that case the linear scale makes small states like Rajasthan (35 MT)
      // invisible against large states like West Bengal (9000+ MT) at <0.4% of the scale.
      const hasRealHistoricalData = entries.some(([_, e]) => (e.volume || 0) > 0);

      if (hasRealHistoricalData) {
        // Real monthly data: use volume-based linear scale
        const volumes = entries.map(([_, e]) => e.volume || 0);
        const maxVol = Math.max(...volumes, 1);
        entries.forEach(([key, e]) => {
          heatMap[key] = { geoHeatScore: e.volume || 0 };
        });
        const baseScale = d3.scaleLinear()
          .domain([0, maxVol * 0.3, maxVol])
          .range(['#1d4ed8', '#3b82f6', '#60a5fa']) // Starts at strong blue instead of dark background color
          .interpolate(d3.interpolateHcl)
          .clamp(true);
        const colorScale = (vol) => {
          if (!vol) return '#1e2535'; // Return grey only for true 0/no data
          return baseScale(vol);
        };
        return { heatColorScale: colorScale, geoHeatMap: heatMap };
      }
      // No real historical data — fall through to impactScore path below
      // so states with cur>0 (e.g. Rajasthan) still appear visibly colored.
    }
    
    if (filterState.type === "PENDING") {
      entries.forEach(([key, e]) => {
        const pendingQty = e.volume || e.cur || 0;
        heatMap[key] = {
          geoHeatScore: pendingQty,
          pendingQty
        };
      });

      const baseScale = d3.scaleLinear()
        .domain([0, 100, 300])
        .range(['#fee2e2', '#f97316', '#ef4444'])
        .interpolate(d3.interpolateHcl)
        .clamp(true);

      const colorScale = (val) => {
        if (!val || val <= 0) return '#1e2535';
        return baseScale(val);
      };

      return { heatColorScale: colorScale, geoHeatMap: heatMap };
    }

    // Step 1: Gather impactScore per district/state (e.impactScore) using getBusinessImpact logic
    const scored = entries
      .map(([key, e]) => {
        const impactScore = e.impactScore != null && Number.isFinite(e.impactScore) ? e.impactScore : 0;
        return { key, impactScore };
      });

    scored.forEach(({ key, impactScore }) => {
      const e = activeMap[key];
      const hasCurVolume = e && ((e.cur || 0) > 0 || (e.volume || 0) > 0);
      // States/districts with actual volume but impactScore=0 are new/growing regions
      // (prev=0 means no risk of decline). Give them a minimum visible score so they
      // appear colored instead of blending into the no-data dark background.
      const effectiveScore = (impactScore === 0 && hasCurVolume) ? 15 : impactScore;
      heatMap[key] = {
        geoHeatScore: effectiveScore,
        impactScore
      };
    });

    // Replace fixed thresholds with absolute severity threshold scaling
    const colorScale = (score) => {
      if (score == null) return NO_DATA_COLOR;
      if (score === 0) return NO_DATA_COLOR;   // True no-data (cur=0 AND prev=0)
      if (score <= 15) return HEAT_COLORS[0];  // New/growing — lowest visible shade
      if (score < 40) return HEAT_COLORS[1];   // Low Risk
      if (score < 50) return HEAT_COLORS[2];   // Moderate Risk
      if (score < 75) return HEAT_COLORS[3];   // High Risk
      return HEAT_COLORS[4];                   // Critical Risk
    };

    return { heatColorScale: colorScale, geoHeatMap: heatMap };
  }, [activeMap, filterState.type, selectedMonth, monthButtons, selectedPendingMonth]);

  const gRef = useRef(null);

  useEffect(() => {
    // Reset zoom and pan on state switch
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
    applyTransform();
  }, [selectedState, applyTransform]);

  // Main map drawing logic inside requestAnimationFrame
  useEffect(() => {
    if (!gRef.current || !activeFeatures) return;
    
    let animId;
    const drawMap = () => {
      const g = d3.select(gRef.current);
      
      // 1. Bind path data
      const paths = g.selectAll("path.map-path")
        .data(activeFeatures);
        
      paths.exit().remove();
      
      const newPaths = paths.enter().append("path")
        .attr("class", "map-path")
        .attr("fill", "#1e2535"); // Default dark color for no-data / initial enter
        
      const allPaths = newPaths.merge(paths);
      
      allPaths
        .attr("d", pathGen)
        .attr("stroke", "#0f1117")
        .attr("stroke-width", selectedState ? 0.4 : 0.7)
        .style("cursor", selectedState ? "default" : "pointer")
        .style("transition", "fill 450ms ease") // Native smooth transition style
        .on("click", (event, d) => {
          if (!selectedState) {
            const topoName = d.properties?.ST_NM || d.properties?.state_name || d.properties?.NAME || d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || "";
            handleStateClick(topoName);
          }
        })
        .on("mouseover", (event, d) => {
          const topoName = d.properties?.ST_NM || d.properties?.state_name || d.properties?.NAME || d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || "";
          const normTopo = selectedState ? resolveDistrict(topoName) : normalizeKey(topoName);
          const entry = selectedState 
            ? normalizedDistrictDataMap[normTopo] 
            : (normalizedStateDataMap[normTopo] || Object.values(normalizedStateDataMap).find(s => normalizeKey(s.geoKey) === normTopo));
            
          const selection = d3.select(event.currentTarget);
          
          // Store original attributes
          const origFill = selection.attr("fill") || "#1e2535";
          const origStroke = selection.attr("stroke") || "#0f1117";
          const origStrokeWidth = selection.attr("stroke-width") || (selectedState ? 0.4 : 0.7);
          
          selection
            .property("__origFill", origFill)
            .property("__origStroke", origStroke)
            .property("__origStrokeWidth", origStrokeWidth);
            
          const c = d3.color(origFill);
          const hoverFill = c ? c.brighter(0.6).toString() : origFill;
          
          selection
            .attr("fill", hoverFill)
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 1.5)
            .style("opacity", "0.85");
            
          showTip(event, topoName, entry);
        })
        .on("mousemove", (event) => {
          moveTip(event);
        })
        .on("mouseleave", (event, d) => {
          const selection = d3.select(event.currentTarget);
          const origFill = selection.property("__origFill") || "#1e2535";
          const origStroke = selection.property("__origStroke") || "#0f1117";
          const origStrokeWidth = selection.property("__origStrokeWidth") || (selectedState ? 0.4 : 0.7);
          
          selection
            .attr("fill", origFill)
            .attr("stroke", origStroke)
            .attr("stroke-width", origStrokeWidth)
            .style("opacity", "1");
            
          hideTip();
        });
 
      allPaths.attr("fill", d => {
        const topoName = d.properties?.ST_NM || d.properties?.state_name || d.properties?.NAME || d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || "";
        const normTopo = selectedState ? resolveDistrict(topoName) : normalizeKey(topoName);
        const entry = selectedState 
          ? normalizedDistrictDataMap[normTopo] 
          : (normalizedStateDataMap[normTopo] || Object.values(normalizedStateDataMap).find(s => normalizeKey(s.geoKey) === normTopo));
          
        if (entry) {
          if (filterState.type === "PENDING") {
            const pendingQty = entry.volume || entry.cur || 0;
            return heatColorScale(pendingQty);
          } else if (entry.cur > 0 || entry.prev > 0) {
            const heatKey = selectedState ? normTopo : norm(topoName);
            if (geoHeatMap[heatKey] != null && geoHeatMap[heatKey].geoHeatScore != null) {
              return heatColorScale(geoHeatMap[heatKey].geoHeatScore);
            }
          }
        }
        return '#1e2535';
      });
    };
    
    animId = requestAnimationFrame(drawMap);
    return () => cancelAnimationFrame(animId);
  }, [
    activeFeatures, 
    pathGen, 
    projection,
    selectedState, 
    normalizedStateDataMap, 
    normalizedDistrictDataMap, 
    geoHeatMap, 
    heatColorScale,
    filterState.type,
    selectedPendingMonth
  ]);

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {selectedState && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-text-muted hover:border-accent-blue transition-colors cursor-pointer bg-bg-card"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to India
          </button>
        )}
        <div>
          <h2 className="text-3xl font-extrabold text-text-primary flex items-center gap-2">
            <MapPin className="w-7 h-7 text-accent-blue" />
            {selectedState ? selectedState : 'Regional Sales Distribution'}
          </h2>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-row items-center gap-3 flex-wrap w-full mb-4 p-4 rounded-xl bg-bg-card/60 border border-border/50">
        <span className="text-xs font-bold uppercase text-text-secondary tracking-wider whitespace-nowrap">
          Filters
        </span>

        {/* TYPE group */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase text-text-muted whitespace-nowrap">
            Type
          </span>
          {[
            { value: "DESPATCH", label: "Despatch" },
            { value: "PENDING", label: "Pending" }
          ].map(opt => {
            const active = filterState.type === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilterState(s => ({ ...s, type: opt.value }))}
                className={`text-xs px-4 py-1.5 rounded-full border transition-all cursor-pointer ${
                  active 
                    ? 'bg-accent-blue-soft text-blue-300 border-accent-blue/60' 
                    : 'bg-transparent text-text-muted border-border/60 hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-border/50 self-center" />

        {/* VIEWING LABEL & MONTH dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase text-text-secondary tracking-wider whitespace-nowrap">
            Viewing:
          </span>
          <select
            value={filterState.type === "PENDING" ? selectedPendingMonth : selectedMonth}
            onChange={(e) => {
              if (filterState.type === "PENDING") {
                setSelectedPendingMonth(e.target.value);
              } else {
                setSelectedMonth(e.target.value);
              }
            }}
            className="text-xs px-3 py-1.5 rounded-full border border-border/70 text-purple-300 bg-purple-950/30 cursor-pointer outline-none appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23c4b5fd' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
              backgroundSize: '14px',
              paddingRight: '32px'
            }}
          >
            {filterState.type === "PENDING" ? (
              <>
                <option value="ALL" style={{ background: '#1a1f2c', color: '#f1f5f9' }}>Total Backlog</option>
                {sortedPendingMonths.map(opt => (
                  <option key={opt.periodKey} value={opt.periodKey} style={{ background: '#1a1f2c', color: '#f1f5f9' }}>
                    {opt.label}
                  </option>
                ))}
              </>
            ) : (
              monthButtons.buttons?.map(opt => (
                <option key={opt.value} value={opt.value} style={{ background: '#1a1f2c', color: '#f1f5f9' }}>
                  {opt.fullName}
                </option>
              ))
            )}
          </select>
        </div>

          {/* Divider */}
        <div className="w-px h-7 bg-border/50 self-center" />

        {/* PRODUCTS group */}
        <div className="flex items-center gap-1.5 flex-nowrap">
          <span className="text-xs font-bold uppercase text-text-muted whitespace-nowrap">
            Products
          </span>
          {availableProducts.map(prod => {
            const active = filterState.item.includes(prod);
            return (
              <button
                key={prod}
                onClick={() => {
                  setFilterState(s => {
                    const alreadySelected = s.item.includes(prod);
                    const newItem = alreadySelected
                      ? s.item.filter(x => x !== prod)
                      : [...s.item, prod];
                    return { ...s, item: newItem };
                  });
                }}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                  active 
                    ? 'bg-green-950/30 text-green-300 border-severity-none/60' 
                    : 'bg-transparent text-text-muted border-border/60 hover:text-text-primary'
                }`}
              >
                {prod}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-border/50 self-center" />

        {/* Reset button */}
        <button
          onClick={() => {
            setFilterState({ type: "DESPATCH", item: [] });
            if (monthButtons.curMonthKey) {
              setSelectedMonth(monthButtons.curMonthKey);
            }
          }}
          className="text-xs text-text-dim hover:text-text-muted transition-colors border-none bg-transparent cursor-pointer px-1.5"
        >
          Reset
        </button>
      </div>

      {/* Main body: Map container width W, height H | 28% panel */}
      <div className="flex flex-col lg:flex-row gap-4 lg:min-h-[560px]">

        {/* ── MAP ── */}
        <div
          className="rounded-xl border border-border overflow-hidden relative flex-shrink-0 bg-bg-secondary"
          style={{ 
            width: `${W}px`,
            height: `${H}px`
          }}
        >
          {/* Loading state */}
          {(geoLoading || distLoading) && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3"
              style={{ background: 'rgba(22,27,34,0.85)', backdropFilter: 'blur(4px)' }}>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#3b82f6' }} />
              <span className="text-sm" style={{ color: '#64748b' }}>
                {distLoading ? `Loading ${selectedState} districts…` : 'Loading India map…'}
              </span>
            </div>
          )}

          {/* Coming Soon overlay */}
          {!isMonthAvailable && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3"
              style={{ background: 'rgba(22,27,34,0.92)', backdropFilter: 'blur(6px)' }}>
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <span className="text-sm font-semibold text-white">Historical Data Coming Soon</span>
              <span className="text-xs text-slate-500 text-center max-w-[250px]">
                Detailed geographic charts for {selectedMonth} will be available in the next cycle.
              </span>
            </div>
          )}



          {/* District error */}
          {distError && !distLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4"
              style={{ background: 'rgba(22,27,34,0.95)' }}>
              <AlertTriangle className="w-10 h-10" style={{ color: '#fbbf24' }} />
              <div className="text-center">
                <p className="text-sm font-semibold text-white mb-1">District data unavailable</p>
                <p className="text-xs mb-4" style={{ color: '#475569' }}>
                  Boundaries for <strong className="text-white">{selectedState}</strong> could not be loaded
                </p>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                  style={{ background: '#3b82f6' }}
                >
                  ← Return to India map
                </button>
              </div>
            </div>
          )}

          {/* SVG Map */}
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${W} ${H}`}
            style={{ 
              cursor: isDragging.current ? 'grabbing' : 'grab', 
              display: (geoLoading || distLoading || distError) ? 'none' : 'block' 
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          >
            <g ref={gRef} style={{ transformOrigin: '50% 50%' }} />
          </svg>

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col gap-1">
            {[
              { icon: <ZoomIn className="w-3.5 h-3.5" />,  fn: zoomIn,    title: 'Zoom in' },
              { icon: <ZoomOut className="w-3.5 h-3.5" />, fn: zoomOut,   title: 'Zoom out' },
              { icon: <RotateCcw className="w-3.5 h-3.5" />, fn: resetView, title: 'Reset' },
            ].map(({ icon, fn, title }) => (
              <button key={title} onClick={fn} title={title}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                style={{ background: '#0d1526', border: '1px solid #1e293b', color: '#94a3b8' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#161b22'; e.currentTarget.style.color = '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#0d1526'; e.currentTarget.style.color = '#94a3b8'; }}>
                {icon}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 rounded-lg px-3 py-2 border"
            style={{ background: 'rgba(13,21,38,0.92)', borderColor: '#1e293b' }}>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>
              {filterState.type === "PENDING" ? "Pending Orders (MT)" : "Business Risk"}
            </div>
            {filterState.type === "PENDING" ? (
              <Legend 
                colors={['#1e2535', '#fdba74', '#f97316', '#ef4444']} 
                labels={['0 MT', 'Low (<100)', 'Moderate (100-300)', 'High (>300)']} 
              />
            ) : (
              <Legend colors={HEAT_COLORS} labels={HEAT_LABELS} />
            )}
          </div>

          {/* Zoom indicator */}
          <div 
            ref={zoomIndicatorRef} 
            className="absolute bottom-3 right-3 text-[10px] px-2 py-1 rounded" 
            style={{ background: '#0d1526', color: '#475569' }}
          >
            100%
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col gap-3" style={{ maxHeight: `${H}px` }}>

          {/* Summary / Header Cards */}
          <div className="rounded-xl border p-4 flex-shrink-0" style={{ background: '#161b22', borderColor: '#1e293b' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4" style={{ color: '#3b82f6' }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
                Summary
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard 
                label={selectedState ? "Active Districts" : "Active States"} 
                value={
                  filterState.type === "PENDING"
                    ? (selectedState ? rankedDistricts : rankedStates).filter(e => getPendingForPeriod(e, selectedPendingMonth) > 0).length
                    : (selectedState ? rankedDistricts.length : rankedStates.length)
                } 
                sub={selectedState ? "districts" : "states"} 
              />
              <StatCard
                label={filterState.type === "PENDING" ? "Total Pending" : "Total Volume"}
                value={formatNumber(
                  filterState.type === "PENDING"
                    ? getTotalPendingForPeriod(selectedState ? rankedDistricts : rankedStates, selectedPendingMonth)
                    : (selectedState ? rankedDistricts : rankedStates).reduce((s, e) => s + (e.volume ?? 0), 0)
                )}
                sub={
                  filterState.type === "PENDING" && selectedPendingMonth !== 'ALL'
                    ? `MT (Total Backlog: ${formatNumber(getTotalPendingForPeriod(selectedState ? rankedDistricts : rankedStates, 'ALL'))})`
                    : "MT"
                }
              />
            </div>
          </div>

          {/* Scrollable List Card */}
          <div className="rounded-xl border p-4 flex-1 flex flex-col overflow-hidden" style={{ background: '#161b22', borderColor: '#1e293b' }}>
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {selectedState ? `${selectedState.toUpperCase()} DISTRICTS` : 'STATE PERFORMANCE'}
              </span>
              {selectedState && (
                <button
                  onClick={handleBack}
                  className="text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
                  style={{ background: '#0d1526', border: '1px solid #1e293b', color: '#94a3b8' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#1e293b'}
                >
                  ← Back to States
                </button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1">
              {rankedList.map((item, idx) => {
                const isPending = filterState.type === "PENDING";
                const trendColor = isPending ? '#3b82f6' : getTrendColor(item.trend, item.cur, item.prev);
                const trendVal = isPending
                  ? `${getSharePctForPeriod(item, selectedPendingMonth, totalPendingVolume)}%`
                  : trendStr(item.trend);
                
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between"
                    style={{
                      fontSize: '13px',
                      padding: '12px 0',
                      borderBottom: '0.5px solid #1e2a3a',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span style={{ color: '#94a3b8', minWidth: '20px' }}>#{idx + 1}</span>
                      <span className="font-semibold text-white truncate" title={item.name}>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-right flex-shrink-0">
                      <div className="flex flex-col text-right">
                        <span className="text-slate-300 font-semibold whitespace-nowrap">
                          {formatMT(isPending ? getPendingForPeriod(item, selectedPendingMonth) : item.volume)}
                        </span>
                        {isPending && selectedPendingMonth !== 'ALL' && (
                          <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                            Total Backlog: {formatMT(getPendingForPeriod(item, 'ALL'))}
                          </span>
                        )}
                      </div>
                      <span className="font-bold whitespace-nowrap text-right" style={{ color: trendColor, minWidth: '45px' }}>
                        {trendVal}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!rankedList.length && (
                <div className="text-xs text-center py-6 italic text-slate-500">No data available</div>
              )}
            </div>
          </div>
        </div>
      </div>
 
      {/* Floating tooltip */}
      <Tooltip tooltipRef={tooltipRef} {...tooltip} filterType={filterState.type} totalPending={totalPendingVolume} selectedPendingMonth={selectedPendingMonth} />
    </div>
  );
}

// ── Small card helper ──
function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-lg p-4 border flex flex-col justify-between" style={{ background: '#0d1526', borderColor: '#1e293b', minHeight: '100px' }}>
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</div>
      <div className="text-2xl font-bold text-white my-1">{value}</div>
      <div className="text-[11px] font-medium leading-normal" style={{ color: '#94a3b8' }}>{sub}</div>
    </div>
  );
}
