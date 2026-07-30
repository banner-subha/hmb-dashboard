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
  'paschimmedinipur':        'medinipurwest',
  'purbamedinipur':          'medinipureast',
  'southtwentyfourparganas': 'south24parganas',
  'northtwentyfourparganas': 'north24parganas',
  'westmidnapore':           'medinipurwest',
  'eastmidnapore':           'medinipureast',
  'westmidnapur':            'medinipurwest',
  'eastmidnapur':            'medinipureast',
  'paschimmidnapore':        'medinipurwest',
  'purbamidnapore':          'medinipureast',
  'purgamedinipur':          'medinipureast',
  'paschimbardhaman':        'paschimbardhaman',
  'purbabardhaman':          'purbabardhaman',
  'westbardhaman':           'paschimbardhaman',
  'eastbardhaman':           'purbabardhaman',
  'burdwan':                 'purbabardhaman',
  'bardhaman':               'purbabardhaman',
  'malda':                   'maldah',
  'coochbehar':              'coochbehar',

  // ── Arunachal Pradesh — cities → parent district ──
  'itanagar':   'papumpare',
  'hollongi':   'papumpare',
  'naharlagun': 'papumpare',

  // ── Assam ──
  'guwahati':        'kamrupmetropolitan',
  'dispur':          'kamrupmetropolitan',
  'kamrup':          'kamrupmetropolitan',
  'kamrupmetro':     'kamrupmetropolitan',
  'silchar':         'cachar',

  // ── Bihar ──
  'patna':           'patna',
  'purbichamparan':  'eastchamparan',
  'paschimchamparan':'westchamparan',

  // ── Jharkhand ──
  'jamshedpur':         'purbisinghbhum',
  'eastsinghbhum':      'purbisinghbhum',
  'eastsinghbhoom':     'purbisinghbhum',
  'purbisinghbhoom':    'purbisinghbhum',
  'westsinghbhum':      'paschimisinghbhum',
  'westsinghbhoom':     'paschimisinghbhum',
  'paschimisinghbhoom': 'paschimisinghbhum',
  'koderma':            'kodarma',
  'seraikelakharsawan': 'saraikelakharsawan',
  'seraikela':          'saraikelakharsawan',
  'hazaribag':          'hazaribagh',

  // ── Odisha ──
  'balasore':        'baleshwar',
  'baleswar':        'baleshwar',
  'berhampur':       'ganjam',
  'bhubaneswar':     'khordha',
  'bhubneswar':      'khordha',
  'jagatsinghpur':   'jagatsinghapur',
  'jajpur':          'jajapur',
  'keshpur':         'khordha',
  'anugul':          'angul',
  'sundergarh':      'sundargarh',
  'rourkela':        'sundargarh',

  // ── Rajasthan ──
  'junjhunu':        'jhunjhunu',
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

  // ── Manipur ──
  'westimphal':      'imphalwest',
  'eastimphal':      'imphaleast',

  // ── Uttar Pradesh ──
  'kanpur':          'kanpurnagar',
  'allahabad':       'prayagraj',
  'banaras':         'varanasi',
  'noida':           'gautambuddhanagar',
  'faizabad':        'ayodhya',

  // ── Chhattisgarh ──
  'bhilai':          'durg',
  'jagdalpur':       'bastar',
};

function resolveDistrict(name) {
  const n = normalizeName(name).replace(/district$/, '');
  return districtAliases[n] ?? n;
}

// ─── Geo Visualization Layer (isolated — never mutates global state) ──────────
const NO_DATA_COLOR = '#1e2535';
const HEAT_COLORS = [
  '#bfdbfe', // Soft light blue — lowest volume
  '#60a5fa', // Sky blue — low-med volume
  '#3b82f6', // Medium blue — moderate volume
  '#2563eb', // Royal blue — high volume
  '#1e3a8a', // Rich dark navy — top volume (lighter navy, readable)
];
const HEAT_LABELS = [
  'Lowest Vol',
  'Low Vol',
  'Moderate Vol',
  'High Vol',
  'Top Vol',
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
import { formatMT, formatNumber, formatDays } from '../utils/formatters';
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
function Tooltip({ tooltipRef, visible, name, data, filterType, totalPending, selectedPendingMonth, isDistrictView }) {
  const isPending = filterType === "PENDING";

  const despatchQty = data ? (data.despatchQty ?? (isPending ? (data.rawCur ?? data.despatchCur ?? 0) : (data.volume ?? data.cur ?? 0))) : 0;
  const pendingQty = data ? (data.pendingQty ?? getPendingForPeriod(data, selectedPendingMonth || 'ALL')) : 0;
  
  const dailyAvg = data ? (data.dailyAvgQty ?? 0) : 0;
  const rawAvgPeriod = data?.avgPeriod ?? (dailyAvg > 0 && pendingQty > 0 ? (pendingQty / dailyAvg) : null);
  const clearanceText = rawAvgPeriod != null ? formatDays(rawAvgPeriod) : getBacklogClearance(pendingQty, dailyAvg).text;

  const trendVal = data ? (data.trend ?? data.mom ?? null) : null;
  const riskTier = data ? (data.impactTier || data.impact || (pendingQty > 0 ? getBacklogClearance(pendingQty, dailyAvg).status : 'STABLE')) : 'STABLE';

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none fixed z-[9999] border bg-[#060d1d]/98 backdrop-blur-md border-border-accent/80 rounded-xl p-4 shadow-2xl map-tooltip-container space-y-2.5 min-w-[240px]"
      style={{
        left: 0,
        top:  0,
        display: (visible && name) ? 'block' : 'none'
      }}
    >
      {/* Entity Title & Type Badge */}
      <div className="flex items-center justify-between border-b border-border/50 pb-2 gap-3">
        <div className="font-black text-text-primary text-base truncate tracking-tight">{name}</div>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-bg-card border border-border/50 text-text-muted shrink-0">
          {isDistrictView ? 'District' : 'State'}
        </span>
      </div>

      {data ? (
        <div className="space-y-2 text-sm">
          {/* Despatch Volume */}
          <Row 
            label="Despatch Vol" 
            value={formatMT(despatchQty)} 
          />

          {/* Pending Orders Volume */}
          <Row 
            label="Pending Orders" 
            value={pendingQty > 0 ? formatMT(pendingQty) : '0 MT'} 
          />

          {/* Avg Period of Orders */}
          <Row 
            label="Avg Order Period" 
            value={clearanceText} 
            valueColor="#38bdf8"
          />

          {/* MoM Trend */}
          <Row
            label="MoM Trend"
            value={trendStr(trendVal)}
            valueColor={trendVal > 0 ? '#22c55e' : trendVal < 0 ? '#ef4444' : undefined}
          />

          {/* Risk Level Badge */}
          <div className="flex justify-between gap-4 items-center pt-1.5 border-t border-border/30">
            <span className="text-text-muted font-medium text-xs sm:text-sm">Risk Level</span>
            <SeverityBadge severity={riskTier} />
          </div>
        </div>
      ) : (
        <div className="text-text-muted italic py-1.5 text-center text-sm">No data available</div>
      )}
    </div>
  );
}
function Row({ label, value, valueColor }) {
  return (
    <div className="flex justify-between gap-6 items-center">
      <span className="text-text-muted font-medium text-xs sm:text-sm">{label}</span>
      <span className="font-bold text-text-primary text-xs sm:text-sm" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
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

  const keyMatch = availMonths.find(m => 
    m.periodKey === selMonth || 
    m.key === selMonth || 
    m.label === selMonth
  );
  if (keyMatch) return keyMatch;

  const match = String(selMonth).match(/([a-zA-Z]+)\s+(\d{4})/);
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

function resolvePeriodKey(selectedMonth, availableMonths, monthlyHistory) {
  if (availableMonths?.length) {
    const match = findAvailableMonth(selectedMonth, availableMonths);
    if (match?.periodKey) {
      console.log(`[resolvePeriodKey] Found via availableMonths: "${selectedMonth}" → periodKey="${match.periodKey}"`);
      return match.periodKey;
    }
  }
  if (selectedMonth && monthlyHistory) {
    const parsed = String(selectedMonth).match(/([a-zA-Z]+)\s+(\d{4})/);
    if (parsed) {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const idx = months.findIndex(m => parsed[1].toLowerCase().startsWith(m));
      if (idx !== -1) {
        const key = `${parsed[2]}-${String(idx + 1).padStart(2, '0')}`;
        const exists = !!monthlyHistory[key];
        console.log(`[resolvePeriodKey] Fallback: "${selectedMonth}" → key="${key}" exists=${exists}`);
        if (monthlyHistory[key]) return key;
      } else {
        console.log(`[resolvePeriodKey] Fallback FAILED: could not parse month from "${selectedMonth}"`);
      }
    } else {
      console.log(`[resolvePeriodKey] Fallback FAILED: regex no match for "${selectedMonth}"`);
    }
  } else {
    console.log(`[resolvePeriodKey] No monthlyHistory available, selectedMonth="${selectedMonth}"`);
  }
  return null;
}

export default function GeoIntelligence({ salesData: propSalesData, pendingAvailableMonths = [] }) {
  const { rawData } = useData();

  // ── filter state ──
  const [filterState, setFilterState] = useState({
    type: "DESPATCH",
    item: [],
  });
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedPendingMonth, setSelectedPendingMonth] = useState('ALL');

  useEffect(() => {
    if (filterState.type === 'PENDING') {
      setSelectedPendingMonth('ALL');
    }
  }, [filterState.type]);

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

    let curMonthKey = parseMonthKey(curPeriod);
    const prevMonthKey = parseMonthKey(prevPeriod);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const list = [];
    const seen = new Set();

    if (!curMonthKey) {
      curMonthKey = "Jul 2026";
    }

    // 1. Place Current MTD first
    if (curMonthKey) {
      seen.add(curMonthKey);
      list.push({
        value: curMonthKey,
        label: `${curMonthKey} (MTD)`,
        fullName: `${curMonthKey} (MTD)`,
      });
    }

    // 2. Add availableMonths from rawData
    if (Array.isArray(rawData.availableMonths) && rawData.availableMonths.length > 0) {
      rawData.availableMonths.forEach(m => {
        let key = m.label;
        if (m.month && m.year) {
          key = `${months[m.month - 1]} ${m.year}`;
        }
        if (key && !seen.has(key)) {
          seen.add(key);
          list.push({
            value: key,
            label: key,
            fullName: key,
            periodKey: m.periodKey
          });
        }
      });
    }

    // 3. Parse ytdPeriod as fallback for any additional periods
    const ytdPeriod = rawData.meta?.ytdPeriod || rawData.ytdPeriod || "1 Jan 2026 - 31 Jul 2026";
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
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            value: key,
            label: key,
            fullName: key,
          });
        }
        currMonth++;
        if (currMonth > 11) {
          currMonth = 0;
          currYear++;
        }
      }
    }

    return {
      buttons: list,
      curMonthLabel: curMonthKey ? `${curMonthKey} (MTD)` : "Current (MTD)",
      prevMonthLabel: prevMonthKey || "Previous Month",
      curMonthKey: curMonthKey || (list[0]?.value || ""),
      prevMonthKey: prevMonthKey || (list[1]?.value || ""),
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
    
    if (rawData.availableMonths && rawData.monthlyHistory && !(selectedMonth === monthButtons.curMonthKey)) {
      const periodKey = resolvePeriodKey(selectedMonth, rawData.availableMonths, rawData.monthlyHistory);
      const slice = periodKey ? rawData.monthlyHistory[periodKey] : null;
      if (slice) {
        let totalCur = slice.total || 0;
        if (filterState.item.length > 0) {
          totalCur = (slice.products || [])
            .filter(p => filterState.item.includes(p.product?.toUpperCase()))
            .reduce((sum, p) => sum + (p.cur ?? p.qty ?? 0), 0);
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
          despatchQty: rawState.cur ?? s.cur ?? s.volume ?? 0,
          cur,
          prev: 0,
          volume: cur,
          pendingQty: cur,
          pendingHistory: rawState.pendingHistory ?? {},
          trend: s.trend ?? s.mom ?? null,
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
            despatchQty: rawDist.cur ?? d.cur ?? d.volume ?? 0,
            cur,
            prev: 0,
            volume: cur,
            pendingQty: cur,
            pendingHistory: rawDist.pendingHistory ?? {},
            trend: d.trend ?? d.mom ?? null,
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
    console.log(`[filteredSalesData] type=DESPATCH selectedMonth="${selectedMonth}" isCur=${isCur} isPrev=${isPrev} curKey="${monthButtons.curMonthKey}" prevKey="${monthButtons.prevMonthKey}"`);

    const getPrevPeriodKey = (pKey) => {
      if (!pKey) return null;
      const [year, month] = pKey.split('-').map(Number);
      if (month === 1) return `${year - 1}-12`;
      return `${year}-${String(month - 1).padStart(2, '0')}`;
    };

    if (rawData.availableMonths && rawData.monthlyHistory && !isCur) {
      const periodKey = resolvePeriodKey(selectedMonth, rawData.availableMonths, rawData.monthlyHistory);
      const historySlice = periodKey ? rawData.monthlyHistory[periodKey] : null;
      if (historySlice) {
        const prevPeriodKey = getPrevPeriodKey(periodKey);
        const prevHistorySlice = prevPeriodKey ? rawData.monthlyHistory[prevPeriodKey] : null;

      // Compile states from the selected month's historical snapshot
      (historySlice?.states || []).forEach(hs => {
        const stateName = hs.state;
        if (!stateName || stateName.toLowerCase() === 'unknown') return;

        const prevHistState = (prevHistorySlice?.states || []).find(phs => phs.state?.toLowerCase() === stateName.toLowerCase());

        let cur = hs.cur ?? hs.qty ?? 0;
        let prev = prevHistState ? (prevHistState.cur ?? prevHistState.qty ?? 0) : 0;

        if (filterState.item.length > 0) {
          cur = 0; prev = 0;
          (hs.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) cur += p.cur ?? p.qty ?? 0;
          });
          (prevHistState?.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) prev += p.cur ?? p.qty ?? 0;
          });
        }

        const displayVolume = cur;
        const trend = calculateMoM(cur, prev);
        const sharePct = (cur / (totalVolume.cur || 1)) * 100;
        const { impactScore, severity, theme } = getBusinessImpact(cur, prev, sharePct, 'STATE', stateName);

        const stateObj = {
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
          slug: hs.slug || '',
        };

        states[stateName] = stateObj;
        states[stateName.toLowerCase()] = stateObj;
        if (stateName.toUpperCase() !== stateName) {
          states[stateName.toUpperCase()] = stateObj;
        }
      });

      // Compile districts from the selected month's historical snapshot
      (historySlice?.districts || []).forEach(hd => {
        const stateName = hd.state;
        const districtName = hd.district;
        if (!stateName || stateName.toLowerCase() === 'unknown') return;
        if (!districtName || districtName.toLowerCase() === 'unknown') return;

        if (!districts[stateName]) districts[stateName] = {};
        if (!districts[stateName.toLowerCase()]) districts[stateName.toLowerCase()] = districts[stateName];
        if (!districts[stateName.toUpperCase()]) districts[stateName.toUpperCase()] = districts[stateName];

        const prevHistDist = (prevHistorySlice?.districts || []).find(phd => phd.state?.toLowerCase() === stateName.toLowerCase() && phd.district?.toLowerCase() === districtName.toLowerCase());

        let cur = hd.cur ?? hd.qty ?? 0;
        let prev = prevHistDist ? (prevHistDist.cur ?? prevHistDist.qty ?? 0) : 0;

        if (filterState.item.length > 0) {
          cur = 0; prev = 0;
          (hd.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) cur += p.cur ?? p.qty ?? 0;
          });
          (prevHistDist?.products || []).forEach(p => {
            if (filterState.item.includes(p.product?.toUpperCase())) prev += p.cur ?? p.qty ?? 0;
          });
        }

        const displayVolume = cur;
        const trend = calculateMoM(cur, prev);
        const distShare = (cur / (totalVolume.cur || 1)) * 100;
        const { impactScore, severity, theme } = getBusinessImpact(cur, prev, distShare, 'DISTRICT', stateName);

        const distObj = {
          name: districtName,
          lookupKey: hd.lookupKey || normalizeName(districtName),
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

        districts[stateName][districtName] = distObj;
      });

        console.log('[GEO DEBUG] Returning historical states:', Object.keys(states), states['West Bengal'] || states['WEST BENGAL']);
        return { states, districts };
      }
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

      let displayVolume = isPrev ? prev : cur;
      let trend = calculateMoM(cur, prev);
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
      if (stateName.toUpperCase() !== stateName) {
        states[stateName.toUpperCase()] = states[stateName];
      }
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

        let displayVolume = isPrev ? prev : cur;
        let trend = calculateMoM(cur, prev);
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
    if (selectedMonth && monthButtons.curMonthKey && selectedMonth === monthButtons.curMonthKey) return true;
    if (selectedMonth && rawData) {
      return !!resolvePeriodKey(selectedMonth, rawData.availableMonths, rawData.monthlyHistory);
    }
    return true;
  }, [selectedMonth, monthButtons.curMonthKey, filterState.type, rawData]);

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
  const dragDistanceRef = useRef(0);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const dragStart   = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const zoomIndicatorRef = useRef(null);

  // ── hover tooltip content state ──
  const [tooltip, setTooltip] = useState({ visible: false, name: '', data: null });
  const tooltipRef = useRef(null);

  // rAF-coalesced transform writes. drag/move/wheel events fire 100+ times/sec,
  // but the screen only refreshes 60 times/sec, so we collapse every burst of
  // pan/zoom updates into a single paint per frame. Without this, the SVG
  // attribute writes trigger re-rasterisation on every event and we blow past
  // the 60fps ceiling — also visible as judder on trackpad two-finger pans.
  const transformRafRef = useRef(0);
  // Stores the live SVG viewport dimensions so writeTransformNow can compute
  // the correct centre pivot without needing W/H in its dependency array.
  const mapSizeRef = useRef({ w: STATE_W, h: STATE_H });

  const writeTransformNow = useCallback(() => {
    transformRafRef.current = 0;
    const g = gRef.current;
    if (!g) return;
    const z = zoomRef.current;
    const x = panXRef.current;
    const y = panYRef.current;
    // Scale strictly around the viewport centre so zoom stays perfectly centered.
    // SVG transform order: translate to centre → scale → translate back → apply pan.
    const cx = mapSizeRef.current.w / 2;
    const cy = mapSizeRef.current.h / 2;
    g.setAttribute(
      'transform',
      `translate(${cx + x},${cy + y}) scale(${z}) translate(${-cx},${-cy})`
    );
    if (zoomIndicatorRef.current) {
      zoomIndicatorRef.current.textContent = `${Math.round(z * 100)}%`;
    }
  }, []);

  const applyTransform = useCallback(() => {
    if (transformRafRef.current) return;
    transformRafRef.current = requestAnimationFrame(writeTransformNow);
  }, [writeTransformNow]);

  // Flush any pending transform on unmount to avoid stray rAF writes.
  useEffect(() => () => {
    if (transformRafRef.current) cancelAnimationFrame(transformRafRef.current);
  }, []);

  const getDistrictMapForState = useCallback((districtsObj, targetState) => {
    if (!districtsObj || !targetState) return {};
    if (districtsObj[targetState]) return districtsObj[targetState];
    const targetNorm = normalizeKey(targetState);
    const matchedKey = Object.keys(districtsObj).find(
      k => normalizeKey(k) === targetNorm || norm(k) === norm(targetState)
    );
    return matchedKey ? districtsObj[matchedKey] : {};
  }, []);

  // ── salesData lookup maps ──
  const stateMap = useMemo(() => {
    if (!salesData?.states) return {};
    const m = {};
    Object.entries(salesData.states).forEach(([k, v]) => {
      const key = norm(k);
      if (!m[key] || (v.name && v.name !== k.toUpperCase())) {
        m[key] = { name: v.name || k, ...v };
      }
    });
    return m;
  }, [salesData]);

  const districtMap = useMemo(() => {
    if (!salesData?.districts || !selectedState) return {};
    const src = getDistrictMapForState(salesData.districts, selectedState);
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

    // Force-hide tooltip immediately before any async work so state tooltip
    // never bleeds into the district view.
    setTooltip({ visible: false, name: '', data: null });
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
    // Force-hide tooltip so district tooltip never bleeds into India view.
    setTooltip({ visible: false, name: '', data: null });
    setSelectedState(null);
    setDistrictGeo(null);
    setDistError(null);
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
  }, []);

  // ── zoom controls ──
  const zoomIn  = useCallback(() => {
    zoomRef.current = Math.min(zoomRef.current * 1.35, 10);
    writeTransformNow();
  }, [writeTransformNow]);

  const zoomOut = useCallback(() => {
    zoomRef.current = Math.max(zoomRef.current / 1.35, 0.5);
    writeTransformNow();
  }, [writeTransformNow]);

  const resetView = useCallback(() => {
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
    writeTransformNow();
  }, [writeTransformNow]);

  // ── Keyboard zoom: Num +/-, 0 to zoom in/out/reset ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      const c = e.code;
      const kc = e.keyCode;

      // Numpad + (107) or regular + (187/61)
      if (c === 'NumpadAdd' || kc === 107 || kc === 187 || kc === 61) {
        e.preventDefault();
        zoomIn();
      // Numpad - (109) or regular - (189/173)
      } else if (c === 'NumpadSubtract' || kc === 109 || kc === 189 || kc === 173) {
        e.preventDefault();
        zoomOut();
      // Numpad 0 (96) or regular 0 (48)
      } else if (c === 'Numpad0' || kc === 96 || kc === 48) {
        e.preventDefault();
        resetView();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [zoomIn, zoomOut, resetView]);

  // ── drag & pan handlers ──
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragDistanceRef.current = 0;
    setIsDraggingState(true);
    dragStart.current  = { x: e.clientX, y: e.clientY, px: panXRef.current, py: panYRef.current };
    setTooltip({ visible: false, name: '', data: null });
  }, []);

  const onMouseMove = useCallback((e) => {
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      dragDistanceRef.current = Math.hypot(dx, dy);
      panXRef.current = dragStart.current.px + dx;
      panYRef.current = dragStart.current.py + dy;
      writeTransformNow();
      setTooltip({ visible: false, name: '', data: null });
    }
  }, [writeTransformNow]);

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDraggingState(false);
  }, []);

  // ── wheel & trackpad pan/zoom ──
  const onWheel = useCallback((e) => {
    setTooltip({ visible: false, name: '', data: null });

    // Trackpad pinch-in / pinch-out gestures dispatch wheel events with ctrlKey = true (or metaKey)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomRef.current = Math.min(Math.max(zoomRef.current * factor, 0.5), 10);
      writeTransformNow();
    } else {
      // 2-finger drag/scroll: pan the map horizontally and vertically without zooming
      panXRef.current -= e.deltaX * 0.85;
      panYRef.current -= e.deltaY * 0.85;
      writeTransformNow();
    }
  }, [writeTransformNow]);

  // ── Responsive Map Sizing ──
  // The map fills its fluid container; we track the real pixel box via ResizeObserver
  // so the D3 projection always fits the actual viewport rather than a fixed box.
  const mapContainerRef = useRef(null);
  const [mapSize, setMapSize] = useState({ w: STATE_W, h: STATE_H });

  useEffect(() => {
    const node = mapContainerRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setMapSize(prev => {
          if (Math.abs(prev.w - rect.width) < 1 && Math.abs(prev.h - rect.height) < 1) return prev;
          const next = { w: Math.round(rect.width), h: Math.round(rect.height) };
          mapSizeRef.current = next;
          return next;
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const W = mapSize.w;
  const H = mapSize.h;

  // ── projection (auto-fit with prominent, business-grade default scaling) ──
  const projection = useMemo(() => {
    const features = selectedState ? districtGeo : stateGeo;
    if (!features?.length) {
      return geoMercator()
        .center(INDIA_CENTER)
        .scale(INDIA_SCALE)
        .translate([W / 2, H / 2]);
    }

    // Optimal padding so shapes fill the map canvas prominently by default
    const padX = selectedState ? Math.max(28, W * 0.04) : Math.max(20, W * 0.025);
    const padY = selectedState ? Math.max(28, H * 0.04) : Math.max(20, H * 0.025);

    return geoMercator().fitExtent(
      [[padX, padY], [W - padX, H - padY]],
      { type: 'FeatureCollection', features }
    );
  }, [selectedState, stateGeo, districtGeo, W, H]);

  const pathGen = useMemo(() => geoPath().projection(projection), [projection]);

  // ── normalized key lookup maps ──
  const normalizedStateDataMap = useMemo(() => {
    if (!salesData?.states) return {};
    const map = {};
    const stateAliases = {
      'odisha': 'orissa',
      'orissa': 'orissa',
      'orrisa': 'orissa',
      'uttarakhand': 'uttaranchal',
      'uttaranchal': 'uttaranchal',
      'pondicherry': 'puducherry',
      'puducherry': 'puducherry',
      'andamanandnicobar': 'andamanandnicobarislands',
      'andamanandnicobarislands': 'andamanandnicobarislands',
      'dadraandnagarhaveli': 'dadraandnagarhaveli',
      'damananddiu': 'damananddiu',
      'jammuandkashmir': 'jammukashmir',
      'jammukashmir': 'jammukashmir',
    };
    Object.entries(salesData.states).forEach(([name, data]) => {
      const norm = normalizeKey(name);
      const alias = stateAliases[norm] || norm;
      map[norm] = { name, ...data };
      map[alias] = { name, ...data };
    });
    return map;
  }, [salesData]);

  const normalizedDistrictDataMap = useMemo(() => {
    if (!salesData?.districts || !selectedState) return {};
    const src = getDistrictMapForState(salesData.districts, selectedState);
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
    console.log('[GEO DEBUG] rankedStates output:', deduped);
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
    return rankedList.reduce((sum, e) => sum + (e.volume ?? e.cur ?? 0), 0);
  }, [rankedList, filterState.type]);

  // ── tooltip helpers ──
  const showTip = useCallback((e, name, entry) => {
    // Skip on touch/pen — tooltip doesn't make sense without a persistent cursor.
    // D3 synthetic events don't always carry pointerType, so also check touches.
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    if (e.touches && e.touches.length > 0) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (clientX == null || clientY == null) return;
    setTooltip({ visible: true, name, data: entry ?? null });
    requestAnimationFrame(() => {
      if (tooltipRef.current) {
        const vw = window.innerWidth;
        const tw = tooltipRef.current.offsetWidth || 220;
        // Flip tooltip to left side if it would overflow the right edge
        const left = clientX + 16 + tw > vw ? clientX - tw - 8 : clientX + 16;
        tooltipRef.current.style.left = `${left}px`;
        tooltipRef.current.style.top = `${Math.max(8, clientY - 12)}px`;
      }
    });
  }, []);

  const moveTip = useCallback((e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    if (e.touches && e.touches.length > 0) return;
    if (!tooltipRef.current) return;
    const vw = window.innerWidth;
    const tw = tooltipRef.current.offsetWidth || 220;
    const left = e.clientX + 16 + tw > vw ? e.clientX - tw - 8 : e.clientX + 16;
    tooltipRef.current.style.left = `${left}px`;
    tooltipRef.current.style.top = `${Math.max(8, e.clientY - 12)}px`;
  }, []);

  const hideTip = useCallback(() => {
    setTooltip({ visible: false, name: '', data: null });
  }, []);

  // ── render features ──
  const activeFeatures = selectedState ? districtGeo : stateGeo;
  const activeMap      = selectedState ? districtMap : stateMap;

  // ── Adaptive Geo Heat Scoring (local visualization layer — NEVER mutates global state) ──
  const { heatColorScale, geoHeatMap } = useMemo(() => {
    const entries = Object.entries(activeMap);
    const heatMap = {};
    const isPending = filterState.type === "PENDING";

    if (isPending) {
      const pendings = entries.map(([_, e]) => (e.volume !== undefined ? e.volume : (e.cur !== undefined ? e.cur : (e.pendingQty || 0))));
      const maxPending = Math.max(...pendings, 1);

      entries.forEach(([key, e]) => {
        const pendingQty = e.volume !== undefined ? e.volume : (e.cur !== undefined ? e.cur : (e.pendingQty || 0));
        heatMap[key] = {
          geoHeatScore: pendingQty,
          pendingQty
        };
      });

      const baseScale = d3.scaleLinear()
        .domain([0, maxPending * 0.2, maxPending * 0.45, maxPending * 0.75, maxPending])
        .range(['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#b91c1c'])
        .interpolate(d3.interpolateHcl)
        .clamp(true);

      const colorScale = (val) => {
        if (!val || val <= 0) return NO_DATA_COLOR;
        return baseScale(val);
      };

      return { heatColorScale: colorScale, geoHeatMap: heatMap };
    }

    // Despatch volume weight-based scale
    const volumes = entries.map(([_, e]) => e.volume || e.cur || 0);
    const maxVol = Math.max(...volumes, 1);

    entries.forEach(([key, e]) => {
      const vol = e.volume || e.cur || 0;
      heatMap[key] = {
        geoHeatScore: vol,
        volume: vol
      };
    });

    const baseScale = d3.scaleLinear()
      .domain([0, maxVol * 0.15, maxVol * 0.4, maxVol * 0.7, maxVol])
      .range(['#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb', '#1e3a8a'])
      .interpolate(d3.interpolateHcl)
      .clamp(true);

    const colorScale = (vol) => {
      if (!vol || vol <= 0) return NO_DATA_COLOR;
      return baseScale(vol);
    };

    return { heatColorScale: colorScale, geoHeatMap: heatMap };
  }, [activeMap, filterState.type, selectedMonth, monthButtons, selectedPendingMonth]);

  const gRef = useRef(null);

  // Use a ref so D3 event-handler closures always read the *current*
  // selectedState without needing to be re-created every render.
  const selectedStateRef = useRef(selectedState);
  useEffect(() => { selectedStateRef.current = selectedState; }, [selectedState]);

  // Force-clear tooltip whenever the view switches (India ↔ state).
  // This is the safety net for any path that doesn't call hideTip() directly.
  useEffect(() => {
    setTooltip({ visible: false, name: '', data: null });
  }, [selectedState]);

  // Reset zoom + pan and clear stale paths whenever the projection recomputes.
  useEffect(() => {
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
    writeTransformNow();
    if (gRef.current) {
      d3.select(gRef.current).selectAll('path.map-path').remove();
    }
  }, [projection, writeTransformNow]);

  // Main map drawing logic
  useEffect(() => {
    if (!gRef.current || !activeFeatures) return;

    let animId;
    const drawMap = () => {
      const g = d3.select(gRef.current);

      // Helper to resolve fill color for a datum
      const getFill = (d) => {
        const topoName = d.properties?.ST_NM || d.properties?.state_name || d.properties?.NAME || d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || '';
        const normTopo = selectedState ? resolveDistrict(topoName) : normalizeKey(topoName);
        const entry = selectedState
          ? normalizedDistrictDataMap[normTopo]
          : (normalizedStateDataMap[normTopo] || Object.values(normalizedStateDataMap).find(s => normalizeKey(s.geoKey) === normTopo));
        if (entry) {
          const heatKey = selectedState ? normTopo : norm(topoName);
          if (filterState.type === 'PENDING') {
            const pendingQty = geoHeatMap[heatKey]?.geoHeatScore ?? entry.volume ?? entry.cur ?? entry.pendingQty ?? 0;
            if (pendingQty > 0) {
              return heatColorScale(pendingQty);
            }
          } else {
            const curVol = entry.cur ?? entry.volume ?? 0;
            if (curVol > 0) {
              const score = geoHeatMap[heatKey]?.geoHeatScore ?? curVol;
              if (score > 0) {
                return heatColorScale(score);
              }
            }
          }
        }
        return NO_DATA_COLOR;
      };

      // 1. Bind data — interrupt any in-flight transitions on exit paths
      const paths = g.selectAll('path.map-path').data(activeFeatures);

      paths.exit()
        .interrupt()
        .transition().duration(150).ease(d3.easeCubicIn)
        .style('opacity', 0)
        .remove();

      // 2. Enter — start invisible for entrance animation
      const newPaths = paths.enter().append('path')
        .attr('class', 'map-path map-paths')
        .attr('d', pathGen)
        .attr('stroke', '#0f1117')
        .attr('stroke-width', selectedState ? 0.4 : 0.7)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .style('cursor', selectedState ? 'default' : 'pointer')
        .style('opacity', 0)
        .attr('fill', getFill);

      // 3. Merge enter + update
      const allPaths = newPaths.merge(paths);

      // 3a. Update geometry / stroke on existing paths instantly
      paths
        .attr('d', pathGen)
        .attr('stroke', '#0f1117')
        .attr('stroke-width', selectedState ? 0.4 : 0.7)
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .style('cursor', selectedState ? 'default' : 'pointer');

      // 3b. Animate fill change on existing (update) paths
      paths.interrupt()
        .transition('fill').duration(300).ease(d3.easeCubicOut)
        .attr('fill', getFill);

      // 4. Staggered entrance — each path blooms in with a tiny delay
      const total = activeFeatures.length;
      newPaths.each(function(_, i) {
        d3.select(this)
          .interrupt()
          .transition('enter')
          .delay(Math.min(i * (280 / total), 220)) // max 220ms spread
          .duration(380)
          .ease(d3.easeCubicOut)
          .style('opacity', 1);
      });

      // 5. Event handlers — use D3 transitions for smooth hover/leave
      allPaths
        .on('click', (event, d) => {
          if (dragDistanceRef.current > 5) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (!selectedStateRef.current) {
            const topoName = d.properties?.ST_NM || d.properties?.state_name || d.properties?.NAME || d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || '';
            handleStateClick(topoName);
          }
        })
        .on('mouseover', (event, d) => {
          if (isDragging.current) return;
          const isSel = selectedStateRef.current;
          const topoName = d.properties?.ST_NM || d.properties?.state_name || d.properties?.NAME || d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || '';
          const normTopo = isSel ? resolveDistrict(topoName) : normalizeKey(topoName);
          const entry = isSel
            ? normalizedDistrictDataMap[normTopo]
            : (normalizedStateDataMap[normTopo] || Object.values(normalizedStateDataMap).find(s => normalizeKey(s.geoKey) === normTopo));

          const sel = d3.select(event.currentTarget);
          const origFill = sel.attr('fill') || NO_DATA_COLOR;
          sel.property('__origFill', origFill)
             .property('__origStroke', sel.attr('stroke') || '#0f1117')
             .property('__origStrokeWidth', sel.attr('stroke-width') || (isSel ? 0.4 : 0.7));

          const isNoData = origFill === NO_DATA_COLOR || origFill === '#1e2535';
          const c = d3.color(origFill);
          const hoverFill = isNoData ? '#2a364a' : (c ? c.brighter(0.7).toString() : origFill);

          // Snappy hover in — 100ms
          sel.interrupt('hover')
            .transition('hover').duration(100).ease(d3.easeQuadOut)
            .attr('fill', hoverFill)
            .attr('stroke', 'rgba(255, 255, 255, 0.85)')
            .attr('stroke-width', isSel ? 1.2 : 1.8)
            .style('opacity', 0.9);

          showTip(event, topoName, entry);
        })
        .on('mousemove', (event) => { moveTip(event); })
        .on('mouseleave', (event) => {
          const isSel = selectedStateRef.current;
          const sel = d3.select(event.currentTarget);
          const origFill       = sel.property('__origFill') || NO_DATA_COLOR;
          const origStroke     = sel.property('__origStroke') || '#0f1117';
          const origStrokeWidth = sel.property('__origStrokeWidth') || (isSel ? 0.4 : 0.7);

          // Smooth hover out — 200ms
          sel.interrupt('hover')
            .transition('hover').duration(200).ease(d3.easeQuadOut)
            .attr('fill', origFill)
            .attr('stroke', origStroke)
            .attr('stroke-width', origStrokeWidth)
            .style('opacity', 1);

          hideTip();
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
    <div className="flex flex-col h-full">
      {/* Header section with theme bottom border */}
      <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-border flex-wrap">
        <div className="flex items-center gap-3">
          {selectedState && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-sm px-3.5 py-1.5 rounded-lg border border-border text-text-muted hover:border-accent-blue transition-colors cursor-pointer bg-bg-card shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to India
            </button>
          )}
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-text-primary flex items-center gap-2.5">
            <MapPin className="w-7 h-7 text-accent-blue" />
            {selectedState ? selectedState : 'Regional Sales Distribution'}
          </h2>
        </div>
      </div>

      {/* Main body: large fluid MAP on the left, independent Controls + Insights sidebar on the right */}
      <div className="flex flex-col lg:flex-row gap-5 items-start w-full">

        {/* ── MAP (dominant, fluid, expanded height) ── */}
        <div
          ref={mapContainerRef}
          className="rounded-xl border border-border overflow-hidden relative flex-1 w-full min-h-[680px] lg:min-h-[760px] xl:min-h-[820px] panel shadow-md"
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

          {/* SVG Map — key on selectedState so React remounts the element
              when switching India ↔ district view, triggering the CSS fade-in */}
          <svg
            key={selectedState || '__india__'}
            width="100%"
            height="100%"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            shapeRendering="geometricPrecision"
            className="map-svg"
            style={{
              cursor: isDraggingState ? 'grabbing' : 'grab',
              display: (geoLoading || distLoading || distError) ? 'none' : 'block',
              animation: 'mapFadeIn 0.35s ease both',
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={(e) => {
              onMouseUp(e);
              hideTip();
            }}
            onWheel={onWheel}
            onTouchEnd={hideTip}
            onTouchCancel={hideTip}
          >
            <g ref={gRef} className="map-transform-layer" />
         </svg>

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col items-center gap-1 z-10">
            {[
              { icon: <ZoomIn className="w-3.5 h-3.5" />,  fn: zoomIn,    title: 'Zoom in (Num + or +)' },
              { icon: <ZoomOut className="w-3.5 h-3.5" />, fn: zoomOut,   title: 'Zoom out (Num - or -)' },
              { icon: <RotateCcw className="w-3.5 h-3.5" />, fn: resetView, title: 'Reset view (Num 0 or 0)' },
            ].map(({ icon, fn, title }) => (
              <button key={title} onClick={fn} title={title}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-100 cursor-pointer hover:bg-[#161b22] hover:text-[#f1f5f9]"
                style={{ background: '#0d1526', border: '1px solid #1e293b', color: '#94a3b8' }}>
                {icon}
              </button>
            ))}
            <span
              ref={zoomIndicatorRef}
              className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-[#0d1526] border border-[#1e293b] text-[#94a3b8] mt-0.5 select-none"
            >
              100%
            </span>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 rounded-lg px-3 py-2 border"
            style={{ background: 'rgba(13,21,38,0.92)', borderColor: '#1e293b' }}>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>
              {filterState.type === "PENDING" ? "Pending Order Risk" : "Alert Tag Severity"}
            </div>
            {filterState.type === "PENDING" ? (
              <Legend
                colors={['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#b91c1c']}
                labels={['Stable', 'Low Risk', 'Moderate', 'High Risk', 'Critical']}
              />
            ) : (
              <Legend
                colors={['#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb', '#1e3a8a']}
                labels={['Stable', 'Low Risk', 'Moderate', 'High Risk', 'Critical Risk']}
              />
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

        {/* ── RIGHT SIDEBAR: Controls + Insights (independent column) ── */}
        <div key={'sidebar-' + (selectedState || 'india')} className="animate-fade-in lg:w-[310px] xl:w-[330px] lg:flex-shrink-0 flex flex-col gap-3 w-full">

          {/* Filters Card */}
          <div className="rounded-xl border p-4 panel">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-accent-blue" />
                <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Controls</span>
              </div>
              <button
                onClick={() => {
                  setFilterState({ type: "DESPATCH", item: [] });
                  if (monthButtons.curMonthKey) {
                    setSelectedMonth(monthButtons.curMonthKey);
                  }
                }}
                className="text-[11px] text-text-dim hover:text-accent-blue transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>

            <div className="space-y-3">
              {/* TYPE group */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                  Metric Type
                </span>
                <div className="flex items-center gap-1.5">
                  {[
                    { value: "DESPATCH", label: "Despatch" },
                    { value: "PENDING", label: "Pending" }
                  ].map(opt => {
                    const active = filterState.type === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFilterState(s => ({ ...s, type: opt.value }))}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors duration-150 cursor-pointer flex-1 ${
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
              </div>

              {/* VIEWING / MONTH */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                  Viewing
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
                  className="text-xs font-bold px-3 py-1.5 rounded-full border border-border/70 text-white bg-bg-card cursor-pointer outline-none appearance-none w-full"
                  style={{
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    backgroundSize: '14px',
                    paddingRight: '32px'
                  }}
                >
                  {filterState.type === "PENDING" ? (
                    <>
                      <option value="ALL" style={{ background: '#1a1f2c', color: '#ffffff' }}>Total Backlog</option>
                      {sortedPendingMonths.map(opt => (
                        <option key={opt.periodKey} value={opt.periodKey} style={{ background: '#1a1f2c', color: '#ffffff' }}>
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

              {/* PRODUCTS group */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                  Products
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
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
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors duration-150 cursor-pointer ${
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
              </div>
            </div>
          </div>

          {/* Summary Stat Cards */}
          <div className="rounded-xl border panel">
            <div className="grid grid-cols-2 divide-x divide-border/50">
              <StatCard
                label={selectedState ? "Districts" : "States"}
                value={
                  filterState.type === "PENDING"
                    ? (selectedState ? rankedDistricts : rankedStates).filter(e => (e.volume ?? e.cur ?? 0) > 0).length
                    : (selectedState ? rankedDistricts.length : rankedStates.length)
                }
                sub="active"
              />
              <StatCard
                label={filterState.type === "PENDING" ? "Total Pending" : "Total Volume"}
                value={formatNumber(
                  (selectedState ? rankedDistricts : rankedStates).reduce((s, e) => s + (e.volume ?? e.cur ?? 0), 0)
                )}
                sub={
                  filterState.type === "PENDING" && selectedPendingMonth !== 'ALL'
                    ? `MT · Backlog ${formatNumber(getTotalPendingForPeriod(selectedState ? rankedDistricts : rankedStates, 'ALL'))}`
                    : "MT"
                }
              />
            </div>
          </div>

          {/* Scrollable Ranked List */}
          <div className="rounded-xl border p-4 flex-1 flex flex-col overflow-hidden min-h-[200px] panel">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {selectedState ? `${selectedState.toUpperCase()} DISTRICTS` : 'State Performance'}
              </span>
              {selectedState && (
                <button
                  onClick={handleBack}
                  className="text-xs px-2.5 py-1 rounded transition-colors duration-100 flex items-center gap-1 cursor-pointer hover:border-accent-blue"
                  style={{ background: '#0d1526', border: '1px solid #1e293b', color: '#94a3b8' }}
                >
                  ← Back
                </button>
              )}
            </div>

            <div key={filterState.type + '-' + (selectedState || 'india')} className="flex-1 overflow-y-auto pr-1">
              {rankedList.map((item, idx) => {
                const isPending = filterState.type === "PENDING";
                const delay = Math.min(idx * 25, 200);
                const trendColor = isPending ? '#3b82f6' : getTrendColor(item.trend, item.cur, item.prev);
                const trendVal = isPending
                  ? `${getSharePctForPeriod(item, selectedPendingMonth, totalPendingVolume)}%`
                  : trendStr(item.trend);

                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between animate-slide-up"
                    style={{
                      fontSize: '13px',
                      padding: '12px 0',
                      borderBottom: '0.5px solid #1e2a3a',
                      animationDelay: `${delay}ms`,
                      animationFillMode: 'both',
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span style={{ color: '#94a3b8', minWidth: '20px' }}>#{idx + 1}</span>
                      <span className="font-semibold text-white truncate" title={item.name}>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-right flex-shrink-0">
                      <div className="flex flex-col text-right">
                        <span className="text-slate-300 font-semibold whitespace-nowrap">
                          {formatMT(isPending ? (item.volume ?? item.cur ?? 0) : item.volume)}
                        </span>
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
      <Tooltip tooltipRef={tooltipRef} {...tooltip} filterType={filterState.type} totalPending={totalPendingVolume} selectedPendingMonth={selectedPendingMonth} isDistrictView={!!selectedState} />
    </div>
  );
}

// ── Small card helper ──
function StatCard({ label, value, sub }) {
  return (
    <div className="p-3 flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted truncate">{label}</div>
      <div className="text-lg xl:text-xl font-bold text-white leading-tight break-words">{value}</div>
      <div className="text-[10px] font-medium text-text-muted leading-snug break-words">{sub}</div>
    </div>
  );
}
