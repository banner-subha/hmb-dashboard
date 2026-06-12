import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { geoMercator, geoPath } from 'd3-geo';
import { scaleQuantile } from 'd3-scale';
import { feature } from 'topojson-client';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, MapPin, BarChart2, Loader2, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';

// ─── GeoJSON / TopoJSON URLs ──────────────────────────────────────────────────
const STATE_GEO_URL =
  'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson';

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
};

function resolveDistrict(name) {
  const n = normalizeName(name);
  return districtAliases[n] ?? n;
}

// ─── Geo Visualization Layer (isolated — never mutates global state) ──────────
const NO_DATA_COLOR = '#1e2535';
const HEAT_COLORS = [
  '#166534', // strong green — lowest risk
  '#65a30d', // green-yellow — low risk
  '#facc15', // yellow — moderate risk
  '#f97316', // orange — high risk
  '#dc2626', // red — critical risk
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

// ─── Tooltip (fixed-positioned, follows mouse) ────────────────────────────────
function Tooltip({ tooltipRef, visible, name, data }) {
  if (!visible || !name) return null;
  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none fixed z-[9999] border transition-transform duration-75"
      style={{
        left: 0,
        top:  0,
        transform: 'translate3d(0, 0, 0)',
        minWidth: 190,
        background: '#1a2332',
        borderColor: '#2d3f55',
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '12px',
        boxShadow: 'none',
      }}
    >
      <div className="font-bold text-white mb-2 text-sm truncate">{name}</div>
      {data ? (
        <div className="space-y-1.5">
          <Row label="Volume" value={`${data.volume?.toLocaleString() ?? '—'} MT`} valueColor="#f1f5f9" />
          <Row label="Change" value={trendStr(data.trend)} valueColor={getTrendColor(data.trend, data.cur, data.prev)} />
          <div className="flex justify-between gap-6 items-center">
            <span className="text-slate-500">Alert</span>
            <SeverityBadge severity={data.impactTier || 'LOW'} />
          </div>
        </div>
      ) : (
        <div className="text-slate-500 italic">No data</div>
      )}
    </div>
  );
}
function Row({ label, value, valueColor }) {
  return (
    <div className="flex justify-between gap-6 items-center">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold" style={{ color: valueColor }}>{value}</span>
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
        <div key={it.label} className="flex items-center gap-1 text-[10px] text-slate-400">
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
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors"
      style={{ background: '#0d1526', borderColor: '#1e293b' }}>
      <span className="w-5 h-5 flex-shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center"
        style={{
          background: isTop ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
          color:       isTop ? '#34d399' : '#f87171',
        }}>
        {rank}
      </span>
      <span className="flex-1 text-xs text-slate-200 truncate">{name}</span>
      <span className="text-xs font-semibold text-white flex-shrink-0">
        {volume?.toLocaleString() ?? '—'}
      </span>
      {trend != null && (
        <span className="text-[10px] flex-shrink-0 font-bold" style={{ color: getTrendColor(trend, cur, prev) }}>
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
export default function GeoIntelligence({ salesData: propSalesData }) {
  const { rawData } = useData();

  // ── filter state ──
  const [filterState, setFilterState] = useState({
    type: "ALL",
    item: [],
    month: "CURRENT"
  });

  // ── dynamic total volume calculation for share percentage ──
  const totalVolume = useMemo(() => {
    if (!rawData) return { cur: 1, prev: 1 };
    
    let totalCur = 0;
    let totalPrev = 0;
    const statesList = rawData.states || [];
    
    if (filterState.type === "ORDER") {
      totalCur = statesList.reduce((sum, s) => sum + (s.orderCur || 0), 0);
      totalPrev = statesList.reduce((sum, s) => sum + (s.orderPrev || 0), 0);
    } else if (filterState.type === "DESPATCH") {
      totalCur = statesList.reduce((sum, s) => sum + (s.cur || 0), 0);
      totalPrev = statesList.reduce((sum, s) => sum + (s.prev || 0), 0);
    } else {
      totalCur = statesList.reduce((sum, s) => sum + (s.cur || 0) + (s.orderCur || 0), 0);
      totalPrev = statesList.reduce((sum, s) => sum + (s.prev || 0) + (s.orderPrev || 0), 0);
    }
    
    return {
      cur: totalCur || 1,
      prev: totalPrev || 1
    };
  }, [rawData, filterState.type]);

  // ── parse periods from metadata ──
  const periods = useMemo(() => {
    const curPeriod = rawData?.meta?.curPeriod || "";
    const prevPeriod = rawData?.meta?.prevPeriod || "";
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    
    let curMonthName = "MAY";
    let curMonthNum = 5;
    let prevMonthName = "APR";
    let prevMonthNum = 4;
    
    const baseDateStr = rawData?.meta?.generatedAt || rawData?.generatedAt || "2026-05-18T00:00:00.000Z";
    let baseDate = new Date(baseDateStr);
    if (isNaN(baseDate.getTime())) {
      baseDate = new Date("2026-05-18T00:00:00.000Z");
    }
    let curYear = baseDate.getFullYear();
    let prevYear = curYear;
    
    const curParts = curPeriod.split(/\s*(?:[–-]|â€“|—)\s*/);
    const curEndPart = curParts[curParts.length - 1] || "";
    let curMonthFound = false;
    for (let i = 0; i < months.length; i++) {
      if (curEndPart.toUpperCase().includes(months[i])) {
        curMonthName = months[i];
        curMonthNum = i + 1;
        curMonthFound = true;
        break;
      }
    }
    
    if (!curMonthFound) {
      curMonthNum = baseDate.getMonth() + 1;
      curMonthName = months[curMonthNum - 1];
    }
    
    const curYearMatch = curPeriod.match(/\d{4}/);
    if (curYearMatch) {
      curYear = parseInt(curYearMatch[0], 10);
    } else {
      const baseYearMatch = baseDateStr.match(/\d{4}/);
      if (baseYearMatch) {
        curYear = parseInt(baseYearMatch[0], 10);
      }
    }
    
    const prevParts = prevPeriod.split(/\s*(?:[–-]|â€“|—)\s*/);
    const prevEndPart = prevParts[prevParts.length - 1] || "";
    let prevMonthFound = false;
    for (let i = 0; i < months.length; i++) {
      if (prevEndPart.toUpperCase().includes(months[i])) {
        prevMonthName = months[i];
        prevMonthNum = i + 1;
        prevMonthFound = true;
        break;
      }
    }
    
    if (!prevMonthFound) {
      if (curMonthNum === 1) {
        prevMonthNum = 12;
        prevYear = curYear - 1;
      } else {
        prevMonthNum = curMonthNum - 1;
        prevYear = curYear;
      }
      prevMonthName = months[prevMonthNum - 1];
    } else {
      const prevYearMatch = prevPeriod.match(/\d{4}/);
      if (prevYearMatch) {
        prevYear = parseInt(prevYearMatch[0], 10);
      } else {
        if (prevMonthNum > curMonthNum) {
          prevYear = curYear - 1;
        } else {
          prevYear = curYear;
        }
      }
    }
    
    return { curMonthName, curMonthNum, curYear, prevMonthName, prevMonthNum, prevYear };
  }, [rawData]);

  // ── aggregate filtered salesData ──
  const filteredSalesData = useMemo(() => {
    if (!propSalesData || !rawData) return { states: {}, districts: {} };

    const states = {};
    const districts = {};


    // Filter Month
    const isPrevMonth = filterState.month === "PREVIOUS";

    // Process States
    Object.entries(propSalesData.states || {}).forEach(([stateName, s]) => {
      const rawState = (rawData.states || []).find(rs => rs.state === stateName) || {};
      
      let cur = 0;
      let prev = 0;
      if (filterState.type === "ALL") {
        cur = s.cur + (s.orderCur ?? 0);
        prev = s.prev + (s.orderPrev ?? 0);
      } else if (filterState.type === "ORDER") {
        cur = s.orderCur ?? 0;
        prev = s.orderPrev ?? 0;
      } else {
        cur = s.cur;
        prev = s.prev;
      }

      // Product Filter
      if (filterState.item.length > 0) {
        cur = 0; prev = 0;
        (rawState.products || []).forEach(p => {
          if (filterState.item.includes(p.product)) {
            if (filterState.type === "ALL") {
              cur += (p.cur || 0) + (p.orderCur || 0);
              prev += (p.prev || 0) + (p.orderPrev || 0);
            } else if (filterState.type === "ORDER") {
              cur += p.orderCur || 0;
              prev += p.orderPrev || 0;
            } else {
              cur += p.cur || 0;
              prev += p.prev || 0;
            }
          }
        });
      }

      let displayVolume = isPrevMonth ? prev : cur;
      let trend = calculateMoM(cur, prev);

      // Share % for risk scoring always uses cur (current dispatch/order position),
      // regardless of which month is being *displayed*. This is because getBusinessImpact
      // is a forward-looking risk indicator; "what share of total business is at risk?"
      const sharePct = (cur / (totalVolume.cur || 1)) * 100;

      const { impactScore, severity, theme } = getBusinessImpact(
        cur,
        prev,
        sharePct,
        'STATE',
        stateName
      );

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

    // Process Districts
    Object.entries(propSalesData.districts || {}).forEach(([stateName, districtMap]) => {
      districts[stateName] = {};
      Object.entries(districtMap).forEach(([districtName, d]) => {
        const rawDist = (rawData.districts || []).find(rd => rd.lookupKey === d.lookupKey) || {};
        
        let cur = 0;
        let prev = 0;
        if (filterState.type === "ALL") {
          cur = d.cur + (d.orderCur ?? 0);
          prev = d.prev + (d.orderPrev ?? 0);
        } else if (filterState.type === "ORDER") {
          cur = d.orderCur ?? 0;
          prev = d.orderPrev ?? 0;
        } else {
          cur = d.cur;
          prev = d.prev;
        }

        // Product Filter
        if (filterState.item.length > 0) {
          cur = 0; prev = 0;
          (rawDist.products || []).forEach(p => {
            if (filterState.item.includes(p.product)) {
              if (filterState.type === "ALL") {
                cur += (p.cur || 0) + (p.orderCur || 0);
                prev += (p.prev || 0) + (p.orderPrev || 0);
              } else if (filterState.type === "ORDER") {
                cur += p.orderCur || 0;
                prev += p.orderPrev || 0;
              } else {
                cur += p.cur || 0;
                prev += p.prev || 0;
              }
            }
          });
        }

      let displayVolume = isPrevMonth ? prev : cur;
      let trend = calculateMoM(cur, prev);

        // Share % for risk scoring always uses cur (current dispatch/order position).
        // displayVolume is only for what's shown in the UI, NOT for risk calculation.
        const distShare = (cur / (totalVolume.cur || 1)) * 100;

        const { impactScore, severity, theme } = getBusinessImpact(
          cur,
          prev,
          distShare,
          'DISTRICT',
          stateName
        );

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
  }, [propSalesData, rawData, periods, filterState, totalVolume]);

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
        
        const share = (m[key].cur / (totalVolume.cur || 1)) * 100;

        const bi = getBusinessImpact(m[key].cur, m[key].prev, share, 'DISTRICT', selectedState);
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
          
          const share = (map[key].cur / (totalVolume.cur || 1)) * 100;

          const bi = getBusinessImpact(map[key].cur, map[key].prev, share, 'DISTRICT', selectedState);
          map[key].impactScore = bi.impactScore;
          map[key].impact = bi.severity;
          map[key].healthColor = bi.theme.color;
        } else {
          map[key] = { name, ...data };
        }
      });
    });
    return map;
  }, [salesData, selectedState, totalVolume]);

  // ── ranked lists ──
  const rankedStates = useMemo(() => {
    const list = Object.values(stateMap)
      .filter(e => e.volume != null)
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
  }, [stateMap]);

  const rankedDistricts = useMemo(() => {
    if (!selectedState) return [];
    const src = districtMap;
    const list = Object.values(src)
      .filter(e => e.volume != null)
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
  }, [selectedState, districtMap]);

  const rankedList = selectedState ? rankedDistricts : rankedStates;

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
    
    // Step 1: Gather impactScore per district/state (e.impactScore) using getBusinessImpact logic
    const scored = entries
      .map(([key, e]) => {
        const impactScore = e.impactScore != null && Number.isFinite(e.impactScore) ? e.impactScore : 0;
        return { key, impactScore };
      });

    const heatMap = {};
    scored.forEach(({ key, impactScore }) => {
      heatMap[key] = {
        geoHeatScore: impactScore,
        impactScore
      };
    });

    // Replace fixed thresholds with absolute severity threshold scaling
    const colorScale = (score) => {
      if (score == null) return NO_DATA_COLOR;
      if (score === 0) return HEAT_COLORS[0]; // Lowest Risk (strong green)
      if (score < 40) return HEAT_COLORS[1];  // Low Risk (light green)
      if (score < 50) return HEAT_COLORS[2];  // Moderate Risk (yellow)
      if (score < 75) return HEAT_COLORS[3];  // High Risk (orange)
      return HEAT_COLORS[4];                  // Critical Risk (red)
    };

    return { heatColorScale: colorScale, geoHeatMap: heatMap };
  }, [activeMap]);

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
            const topoName = d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || "";
            handleStateClick(topoName);
          }
        })
        .on("mouseover", (event, d) => {
          const topoName = d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || "";
          const normTopo = selectedState ? resolveDistrict(topoName) : normalizeKey(topoName);
          const entry = selectedState 
            ? normalizedDistrictDataMap[normTopo] 
            : normalizedStateDataMap[normTopo];
            
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
 
      // 2. Re-apply choropleth fills with native smooth CSS transitions
      allPaths.attr("fill", d => {
        const topoName = d.properties?.district || d.properties?.NAME_2 || d.properties?.name || d.properties?.NAME_1 || "";
        const normTopo = selectedState ? resolveDistrict(topoName) : normalizeKey(topoName);
        const entry = selectedState 
          ? normalizedDistrictDataMap[normTopo] 
          : normalizedStateDataMap[normTopo];
          
        // Color regions that have ANY data in the comparison window (handles 0.0 MT / 100% drops)
        if (entry && (entry.cur > 0 || entry.prev > 0)) {
          const heatKey = selectedState ? normTopo : norm(topoName);
          if (geoHeatMap[heatKey] != null && geoHeatMap[heatKey].geoHeatScore != null) {
            return heatColorScale(geoHeatMap[heatKey].geoHeatScore);
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
    heatColorScale
  ]);

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {selectedState && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ background: '#161b22', border: '1px solid #1e293b', color: '#94a3b8' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#1e293b'}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to India
          </button>
        )}
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5" style={{ color: '#3b82f6' }} />
            {selectedState ? `${selectedState} — District View` : 'India Geographic Intelligence'}
          </h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8' }}>
              {filterState.month === "PREVIOUS" 
                ? `${capitalizeWord(periods.prevMonthName)} ${periods.prevYear} vs Previous` 
                : `${capitalizeWord(periods.curMonthName)} ${periods.curYear} vs ${capitalizeWord(periods.prevMonthName)} ${periods.prevYear}`}
            </span>
            <span className="text-xs" style={{ color: '#475569' }}>
              {selectedState
                ? 'Hover districts for details · Scroll/drag to zoom and pan'
                : 'Click a state to drill into districts · Hover for tooltip · Scroll to zoom'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div 
        style={{
          background: '#0d1117',
          border: '0.5px solid #1e2a3a',
          borderRadius: '10px',
          padding: '12px 18px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          width: '100%',
          marginBottom: '16px'
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#4a5568', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
          Filters
        </span>

        {/* TYPE group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#8899aa', whiteSpace: 'nowrap', marginRight: '2px' }}>
            Type
          </span>
          {[
            { value: "ALL", label: "All" },
            { value: "DESPATCH", label: "Despatch" },
            { value: "ORDER", label: "Order" }
          ].map(opt => {
            const active = filterState.type === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilterState(s => ({ ...s, type: opt.value }))}
                className="cursor-pointer"
                style={{
                  fontSize: '11px',
                  padding: '4px 16px',
                  borderRadius: '99px',
                  border: '0.5px solid ' + (active ? '#3b82f6' : '#2d3f55'),
                  color: active ? '#93c5fd' : '#94a3b8',
                  background: active ? '#1e3a5f' : 'transparent',
                  transition: 'all 0.2s'
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Divider 1 */}
        <div style={{ width: '0.5px', height: '28px', background: '#1e2a3a', alignSelf: 'center' }} />

        {/* MONTH group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#8899aa', whiteSpace: 'nowrap', marginRight: '2px' }}>
            Month
          </span>
          {[
            { value: "CURRENT", label: `Curr (${capitalizeWord(periods.curMonthName)} ${periods.curYear})` },
            { value: "PREVIOUS", label: `Prev (${capitalizeWord(periods.prevMonthName)} ${periods.prevYear})` }
          ].map(opt => {
            const active = filterState.month === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilterState(s => ({ ...s, month: opt.value }))}
                className="cursor-pointer"
                style={{
                  fontSize: '11px',
                  padding: '4px 16px',
                  borderRadius: '99px',
                  border: '0.5px solid ' + (active ? '#8b5cf6' : '#2d3f55'),
                  color: active ? '#c4b5fd' : '#94a3b8',
                  background: active ? '#2a1f3a' : 'transparent',
                  transition: 'all 0.2s'
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Divider 2 */}
        <div style={{ width: '0.5px', height: '28px', background: '#1e2a3a', alignSelf: 'center' }} />

        {/* PRODUCTS group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#8899aa', whiteSpace: 'nowrap', marginRight: '2px' }}>
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
                className="cursor-pointer"
                style={{
                  fontSize: '11px',
                  padding: '4px 12px',
                  borderRadius: '99px',
                  border: '0.5px solid ' + (active ? '#22c55e' : '#2d3f55'),
                  color: active ? '#86efac' : '#94a3b8',
                  background: active ? '#1a3a2a' : 'transparent',
                  transition: 'all 0.2s'
                }}
              >
                {prod}
              </button>
            );
          })}
        </div>

        {/* Divider 3 */}
        <div style={{ width: '0.5px', height: '28px', background: '#1e2a3a', alignSelf: 'center' }} />

        {/* Reset button */}
        <button
          onClick={() => setFilterState({ type: "ALL", item: [], month: "CURRENT" })}
          className="cursor-pointer"
          style={{
            fontSize: '11px',
            color: '#4a5568',
            border: 'none',
            background: 'transparent',
            padding: '3px 6px',
            transition: 'color 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
          onMouseLeave={e => e.currentTarget.style.color = '#4a5568'}
        >
          Reset
        </button>
      </div>

      {/* Main body: Map container width W, height H | 28% panel */}
      <div className="flex flex-col lg:flex-row gap-4 lg:min-h-[560px]">

        {/* ── MAP ── */}
        <div
          className="rounded-xl border overflow-hidden relative flex-shrink-0"
          style={{ 
            background: '#161b22', 
            borderColor: '#1e293b',
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
              Business Risk
            </div>
            <Legend colors={HEAT_COLORS} labels={HEAT_LABELS} />
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
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#475569' }}>
                Summary
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard 
                label={selectedState ? "Active Districts" : "Active States"} 
                value={selectedState ? rankedDistricts.length : rankedStates.length} 
                sub={selectedState ? "districts" : "states"} 
              />
              <StatCard
                label="Total Volume"
                value={(selectedState ? rankedDistricts : rankedStates)
                  .reduce((s, e) => s + (e.volume ?? 0), 0)
                  .toLocaleString()}
                sub="MT"
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
                const trendColor = getTrendColor(item.trend, item.cur, item.prev);
                const trendVal = trendStr(item.trend);
                
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between"
                    style={{
                      fontSize: '13px',
                      padding: '8px 0',
                      borderBottom: '0.5px solid #1e2a3a',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ color: '#475569', minWidth: '20px' }}>#{idx + 1}</span>
                      <span className="font-semibold text-white">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className="text-slate-300">{item.volume?.toLocaleString() ?? '—'} MT</span>
                      <span className="font-bold" style={{ color: trendColor, minWidth: '55px' }}>
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
      <Tooltip tooltipRef={tooltipRef} {...tooltip} />
    </div>
  );
}

// ── Small card helper ──
function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-lg p-3 border" style={{ background: '#0d1526', borderColor: '#1e293b' }}>
      <div className="text-[10px] mb-1" style={{ color: '#475569' }}>{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-[10px]" style={{ color: '#475569' }}>{sub}</div>
    </div>
  );
}
