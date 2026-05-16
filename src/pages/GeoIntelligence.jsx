import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { scaleThreshold } from 'd3-scale';
import { feature } from 'topojson-client';
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, MapPin, BarChart2, Loader2, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';

// ─── GeoJSON / TopoJSON URLs ──────────────────────────────────────────────────
const STATE_GEO_URL =
  'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson';

const geoCache = {};

const districtTopoUrl = (stateName) => {
  if (stateName === 'West Bengal') {
    return '/geo/westbengal.json';
  }
  const slug = stateName
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z]/g, '');
  return `https://raw.githubusercontent.com/guneetnarula/indian-district-boundaries/master/topojson/state-wise/${slug}.json`;
};

// ─── Color scale (volume → color) ────────────────────────────────────────────
const NO_DATA_COLOR = '#1e2535';
const BREAKS = [100, 500, 1000, 3000, 7000];
const COLORS = ['#7f1d1d', '#b91c1c', '#f97316', '#eab308', '#22c55e'];
const volumeScale = scaleThreshold().domain(BREAKS).range(COLORS);

function getColor(volume) {
  if (volume == null || isNaN(volume)) return NO_DATA_COLOR;
  return volumeScale(volume);
}

// ─── Map dimensions ───────────────────────────────────────────────────────────
const W = 760;
const H = 580;
const INDIA_CENTER = [82.8, 22.5];
const INDIA_SCALE  = 1050;

// Build a Mercator projection fitted to the SVG viewport
function makeProjection(center = INDIA_CENTER, scale = INDIA_SCALE) {
  return geoMercator()
    .center(center)
    .scale(scale)
    .translate([W / 2, H / 2]);
}

// ─── Utility: normalise name for fuzzy matching ───────────────────────────────
function norm(s = '') {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '');
}

const normKey = (value = "") => {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/paraganas|paragans|pargans|paragnas|prgs/g, "parganas");
};

const TOPO_ALIASES = {
  // 24 Parganas
  "24parganasnorth": "north24parganas",
  "24parganassouth": "south24parganas",
  "north24parganas": "north24parganas",
  "south24parganas": "south24parganas",
  "northtwentyfourparganas": "north24parganas",
  "southtwentyfourparganas": "south24parganas",
  "north24paragnas": "north24parganas",
  "south24paragnas": "south24parganas",

  // Medinipur
  "medinipureast": "purbamedinipur",
  "medinipurwest": "paschimmedinipur",
  "eastmidnapore": "purbamedinipur",
  "westmidnapore": "paschimmedinipur",

  // Bardhaman
  "bardhamaneast": "purbabardhaman",
  "bardhamanwest": "paschimbardhaman",

  // Dinajpur
  "northdinajpur": "uttardinajpur",
  "southdinajpur": "dakshindinajpur"
};

import { calculateMoM, getSeverity, getTrendColor as _getTrendColor, formatTrend } from '../utils/trendEngine';
import ImpactBadge from '../components/common/ImpactBadge';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTrendColor(t, cur, prev) {
  return _getTrendColor(t, cur, prev);
}

function trendStr(t) {
  if (t == null) return '—';
  return formatTrend(t);
}

// ─── Tooltip (fixed-positioned, follows mouse) ────────────────────────────────
function Tooltip({ x, y, visible, name, data }) {
  if (!visible || !name) return null;
  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-xl text-xs shadow-2xl border"
      style={{
        left: x + 16,
        top:  y - 12,
        minWidth: 190,
        background: 'rgba(13,21,38,0.97)',
        borderColor: '#1e3a5f',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="px-3 py-2.5">
        <div className="font-bold text-white mb-2 text-sm truncate">{name}</div>
        {data ? (
          <div className="space-y-1.5">
            <Row label="Volume" value={`${data.volume?.toLocaleString() ?? '—'} MT`} valueColor="#f1f5f9" />
            <Row label="Trend"  value={trendStr(data.trend)}  valueColor={getTrendColor(data.trend, data.cur, data.prev)} />
            <div className="flex justify-between gap-6 items-center">
              <span className="text-slate-500">Impact</span>
              <ImpactBadge 
                cur={data.cur ?? 0}
                prev={data.prev ?? 0}
              />
            </div>
          </div>
        ) : (
          <div className="text-slate-500 italic">No data</div>
        )}
      </div>
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

// ─── Legend strip ─────────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { color: NO_DATA_COLOR, label: 'No data' },
    { color: '#7f1d1d',     label: '< 100 MT' },
    { color: '#b91c1c',     label: '100–500' },
    { color: '#f97316',     label: '500–1k' },
    { color: '#eab308',     label: '1k–3k' },
    { color: '#22c55e',     label: '> 3k MT' },
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GeoIntelligence({ salesData }) {
  // ── view state ──
  const [selectedState, setSelectedState]   = useState(null);
  const [stateGeo,      setStateGeo]        = useState(null);   // GeoJSON features[]
  const [districtGeo,   setDistrictGeo]     = useState(null);   // GeoJSON features[]
  const [geoLoading,    setGeoLoading]      = useState(true);
  const [distLoading,   setDistLoading]     = useState(false);
  const [distError,     setDistError]       = useState(null);

  // ── zoom/pan state ──
  const [zoom,    setZoom]    = useState(1);
  const [panX,    setPanX]    = useState(0);
  const [panY,    setPanY]    = useState(0);
  const isDragging  = useRef(false);
  const dragStart   = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // ── hover tooltip ──
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, name: '', data: null });

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
    Object.entries(src).forEach(([name, district]) => {
      // Prioritize backend lookupKey, fallback to frontend normalized name
      let key = normKey(district.lookupKey || name);
      key = TOPO_ALIASES[key] || key;
      m[key] = { ...district, name };
    });
    return m;
  }, [salesData, selectedState]);

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
        geoCache['__states__'] = gj.features;
        setStateGeo(gj.features);
      })
      .catch(console.error)
      .finally(() => setGeoLoading(false));
  }, []);

  // ── load district TopoJSON when state selected ──
  const handleStateClick = useCallback(async (name) => {
    setSelectedState(name);
    setDistrictGeo(null);
    setDistError(null);
    setDistLoading(true);
    setZoom(1); setPanX(0); setPanY(0);

    if (geoCache[name]) {
      setDistrictGeo(geoCache[name]);
      setDistLoading(false);
      return;
    }
    try {
      const res = await fetch(districtTopoUrl(name));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const topo = await res.json();
      const key  = Object.keys(topo.objects)[0];
      const geo  = feature(topo, topo.objects[key]);
      geoCache[name] = geo.features;
      setDistrictGeo(geo.features);
    } catch (e) {
      setDistError(e.message);
    } finally {
      setDistLoading(false);
    }
  }, []);

  const handleBack = () => {
    setSelectedState(null);
    setDistrictGeo(null);
    setDistError(null);
    setZoom(1); setPanX(0); setPanY(0);
  };

  // ── zoom controls ──
  const zoomIn  = () => setZoom(z => Math.min(z * 1.4, 10));
  const zoomOut = () => setZoom(z => Math.max(z / 1.4, 0.5));
  const resetView = () => { setZoom(1); setPanX(0); setPanY(0); };

  // ── drag handlers ──
  const onMouseDown = (e) => {
    isDragging.current = true;
    dragStart.current  = { x: e.clientX, y: e.clientY, px: panX, py: panY };
  };
  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    setPanX(dragStart.current.px + (e.clientX - dragStart.current.x));
    setPanY(dragStart.current.py + (e.clientY - dragStart.current.y));
  };
  const onMouseUp = () => { isDragging.current = false; };

  // ── wheel zoom ──
  const onWheel = (e) => {
    e.preventDefault();
    setZoom(z => Math.min(Math.max(z * (e.deltaY < 0 ? 1.15 : 0.87), 0.5), 10));
  };

  // ── projection (for state/district auto-fit) ──
  const projection = useMemo(() => {
    const features = selectedState ? districtGeo : stateGeo;
    if (!features?.length) return makeProjection();
    // fit projection to feature bounds
    const proj = geoMercator().fitSize([W, H], { type: 'FeatureCollection', features });
    return proj;
  }, [selectedState, stateGeo, districtGeo]);

  const pathGen = useMemo(() => geoPath().projection(projection), [projection]);

  // ── ranked lists ──
  const ranked = useMemo(() => {
    const src = selectedState ? districtMap : stateMap;
    return Object.values(src)
      .filter(e => e.volume != null)
      .sort((a, b) => b.volume - a.volume);
  }, [selectedState, stateMap, districtMap]);

  const top5    = ranked.slice(0, 5);
  const bottom5 = [...ranked].reverse().slice(0, 5);

  // ── tooltip helpers ──
  const showTip = useCallback((e, name, entry) => {
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, name, data: entry ?? null });
  }, []);
  const moveTip = useCallback((e) => {
    setTooltip(t => t.visible ? { ...t, x: e.clientX, y: e.clientY } : t);
  }, []);
  const hideTip = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }));
  }, []);

  // ── render features ──
  const activeFeatures = selectedState ? districtGeo : stateGeo;
  const activeMap      = selectedState ? districtMap : stateMap;

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {selectedState && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
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
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
            {selectedState
              ? 'Hover districts for details · Scroll/drag to zoom and pan'
              : 'Click a state to drill into districts · Hover for tooltip · Scroll to zoom'}
          </p>
        </div>
      </div>

      {/* Main body: 72% map | 28% panel */}
      <div className="flex gap-4" style={{ minHeight: 560 }}>

        {/* ── MAP ── */}
        <div
          className="rounded-xl border overflow-hidden relative flex-shrink-0"
          style={{ width: '72%', background: '#161b22', borderColor: '#1e293b' }}
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
          {!geoLoading && !distLoading && !distError && (
            <svg
              width="100%"
              viewBox={`0 0 ${W} ${H}`}
              style={{ cursor: isDragging.current ? 'grabbing' : 'grab', display: 'block' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onWheel={onWheel}
            >
              <g transform={`translate(${panX},${panY}) scale(${zoom})`}
                style={{ transformOrigin: '50% 50%' }}>
                {(activeFeatures || []).map((geo, i) => {
                  const topoName =
                    geo.properties?.district ||
                    geo.properties?.NAME_2 ||
                    geo.properties?.name ||
                    geo.properties?.NAME_1 ||
                    "";
                    
                  let topoKey = normKey(topoName);
                  topoKey = TOPO_ALIASES[topoKey] || topoKey;
                  
                  // Hybrid Lookup: Check topoKey first, then fallback to normalized topoName
                  const entry = selectedState 
                    ? (activeMap[topoKey] || activeMap[normKey(topoName)]) 
                    : activeMap[norm(topoName || `Region ${i}`)];
                  
                  if (selectedState && !entry) {
                    console.warn("UNMATCHED TOPO DISTRICT:", topoName, topoKey);
                  }
                  const fill  = getColor(entry?.volume);
                  const d     = pathGen(geo);
                  if (!d) return null;
                  return (
                    <path
                      key={i}
                      d={d}
                      fill={fill}
                      stroke="#0f1117"
                      strokeWidth={selectedState ? 0.4 : 0.7}
                      style={{ transition: 'fill 0.15s', cursor: selectedState ? 'default' : 'pointer' }}
                      onClick={() => !selectedState && handleStateClick(topoName)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.fill = '#3b82f6';
                        e.currentTarget.style.opacity = '0.85';
                        showTip(e, topoName, entry);
                      }}
                      onMouseMove={moveTip}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.fill = fill;
                        e.currentTarget.style.opacity = '1';
                        hideTip();
                      }}
                    />
                  );
                })}
              </g>
            </svg>
          )}

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 flex flex-col gap-1">
            {[
              { icon: <ZoomIn className="w-3.5 h-3.5" />,  fn: zoomIn,    title: 'Zoom in' },
              { icon: <ZoomOut className="w-3.5 h-3.5" />, fn: zoomOut,   title: 'Zoom out' },
              { icon: <RotateCcw className="w-3.5 h-3.5" />, fn: resetView, title: 'Reset' },
            ].map(({ icon, fn, title }) => (
              <button key={title} onClick={fn} title={title}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
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
              Volume (MT)
            </div>
            <Legend />
          </div>

          {/* Zoom indicator */}
          <div className="absolute bottom-3 right-3 text-[10px] px-2 py-1 rounded" style={{ background: '#0d1526', color: '#475569' }}>
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 580 }}>

          {/* Summary */}
          <div className="rounded-xl border p-4" style={{ background: '#161b22', borderColor: '#1e293b' }}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4" style={{ color: '#3b82f6' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#475569' }}>
                {selectedState ? `${selectedState} Districts` : 'National Overview'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Regions with Data" value={ranked.length} sub="regions" />
              <StatCard
                label="Total Volume"
                value={ranked.reduce((s, e) => s + (e.volume ?? 0), 0).toLocaleString()}
                sub="MT"
              />
            </div>
          </div>

          {/* Top 5 */}
          <div className="rounded-xl border p-4" style={{ background: '#161b22', borderColor: '#1e293b' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#475569' }}>
              🏆 Top 5 Performers
            </div>
            <div className="space-y-1.5">
              {top5.length ? top5.map((e, i) => (
                <RankRow key={e.name} rank={i + 1} name={e.name} volume={e.volume} trend={e.trend} cur={e.cur} prev={e.prev} isTop />
              )) : (
                <p className="text-xs text-center py-3 italic" style={{ color: '#334155' }}>No data available</p>
              )}
            </div>
          </div>

          {/* Bottom 5 */}
          <div className="rounded-xl border p-4" style={{ background: '#161b22', borderColor: '#1e293b' }}>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#475569' }}>
              ⚠️ Bottom 5 Performers
            </div>
            <div className="space-y-1.5">
              {bottom5.length ? bottom5.map((e, i) => (
                <RankRow key={e.name} rank={i + 1} name={e.name} volume={e.volume} trend={e.trend} cur={e.cur} prev={e.prev} isTop={false} />
              )) : (
                <p className="text-xs text-center py-3 italic" style={{ color: '#334155' }}>No data available</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating tooltip */}
      <Tooltip {...tooltip} />
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
