# HMB Dashboard — Performance & Optimization Guide (v2)

**Goal:** 60 FPS interactions, sub-100ms input response, smaller initial bundle. Zero changes to layout, styling, or business logic.

**Rule for every change below:** if it touches business logic (trendEngine.js calculations, severity thresholds, PACE/AVG flags), stop — that's out of scope. These are pure render/perf changes.

---

## Priority Order (do in this sequence)

1. Code-split routes (`App.jsx`) — biggest win, lowest risk, ~10 min
2. Debounce search inputs — high win, low risk
3. D3 tooltip refactor (`GeoIntelligence.jsx`) — high win on map interactions, medium risk
4. Memoize table rows/columns (`DataTable.jsx`, `AlertIntelligence.jsx`) — medium win
5. Vite manualChunks — build-time only, zero runtime risk
6. Context splitting — do last, highest risk of breaking things if rushed

Don't do all six in one pass. Ship 1–2, verify, then continue.

---

## 1. Route Code-Splitting — `App.jsx`

**Before (current, assumed):**
```javascript
import ExecutiveOverview from './pages/ExecutiveOverview';
import AlertIntelligence from './pages/AlertIntelligence';
import GeoIntelligence from './pages/GeoIntelligence';
// ... etc, all eager
```

**After:**
```javascript
import { lazy, Suspense } from 'react';

const ExecutiveOverview   = lazy(() => import('./pages/ExecutiveOverview'));
const AlertIntelligence   = lazy(() => import('./pages/AlertIntelligence'));
const GeoIntelligence     = lazy(() => import('./pages/GeoIntelligence'));
const StateIntelligence   = lazy(() => import('./pages/StateIntelligence'));
const DistrictIntelligence = lazy(() => import('./pages/DistrictIntelligence'));
const DealerIntelligence  = lazy(() => import('./pages/DealerIntelligence'));
const AIWarRoom           = lazy(() => import('./pages/AIWarRoom'));
```

**Keep `Login.jsx` eager** — it's the first paint, lazy-loading it adds a network waterfall for no benefit.

**In `DashboardLayout.jsx`**, wrap `<Outlet />`:
```jsx
<Suspense fallback={<SkeletonLoader variant="page" />}>
  <Outlet />
</Suspense>
```

**Verify:** Network tab → each page nav should now fetch a separate chunk (`GeoIntelligence-[hash].js`) instead of it all being in `index.js`.

---

## 2. Debounced Search — `SearchInput.jsx`

Don't debounce at the call site inconsistently across `AlertIntelligence.jsx` and `DealerIntelligence.jsx`. Fix it once, inside `SearchInput.jsx`, so every consumer gets it for free.

```jsx
// components/common/SearchInput.jsx
import { useState, useEffect, useRef } from 'react';

export default function SearchInput({ onSearch, delay = 200, ...props }) {
  const [localValue, setLocalValue] = useState('');
  const timerRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalValue(val);          // instant visual feedback, no lag
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(val), delay);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return <input {...props} value={localValue} onChange={handleChange} />;
}
```

`onSearch` is what writes to `DataContext`. `localValue` (the input's own state) updates immediately so typing never feels laggy — only the expensive downstream filtering/context update is delayed.

**Do not** debounce inside `DataContext` itself — debounce at the source of the event, not the consumer. Debouncing in context delays *everything* subscribed to that state, not just this input.

---

## 3. D3 Tooltip — Zero Re-render Pattern — `GeoIntelligence.jsx`

**This is the single highest-impact fix for map jank.** `setTooltip(x, y)` on `mousemove` re-renders the whole component tree on every pixel of mouse movement.

**Before (the anti-pattern to remove):**
```javascript
const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, data: null });

svg.on('mousemove', (event, d) => {
  setTooltip({ visible: true, x: event.pageX, y: event.pageY, data: d });
});
```

**After:**
```javascript
const tooltipRef = useRef(null);
const tooltipContentRef = useRef(null); // separate div for text, avoid re-parsing HTML each move

svg.selectAll('path')
  .on('mouseenter', (event, d) => {
    if (!tooltipRef.current) return;
    tooltipRef.current.style.display = 'block';
    tooltipContentRef.current.textContent = formatStateLabel(d); // set content once per enter, not per move
  })
  .on('mousemove', (event) => {
    if (!tooltipRef.current) return;
    // translate3d, not left/top — GPU-composited, avoids layout reflow
    tooltipRef.current.style.transform =
      `translate3d(${event.pageX + 12}px, ${event.pageY + 12}px, 0)`;
  })
  .on('mouseleave', () => {
    if (tooltipRef.current) tooltipRef.current.style.display = 'none';
  });
```

```jsx
<div
  ref={tooltipRef}
  style={{ position: 'fixed', display: 'none', willChange: 'transform', pointerEvents: 'none', top: 0, left: 0 }}
>
  <span ref={tooltipContentRef} />
</div>
```

Key points:
- `translate3d` not `left`/`top` — the latter triggers layout reflow on every mousemove, the former is compositor-only.
- Content text set on `mouseenter`, not `mousemove` — you only need to recompute the label once per hovered feature, not 60x/sec.
- `pointerEvents: 'none'` on the tooltip so it never intercepts the next mousemove.

---

## 4. Memoized Projections — `GeoIntelligence.jsx`

```javascript
const { width, height } = useDebouncedResize(containerRef); // already exists per your hooks

const projection = useMemo(
  () => d3.geoMercator().fitSize([width, height], geoJsonData),
  [width, height, geoJsonData] // NOT selectedState — projection shouldn't change on selection
);

const pathGen = useMemo(() => d3.geoPath().projection(projection), [projection]);
```

`selectedState` should drive a *fill/stroke* update on existing paths, not a projection recompute:
```javascript
svg.selectAll('path')
  .attr('fill', d => d.properties.name === selectedState ? '#highlight' : baseColor(d));
```
No `enter/exit`, no path regeneration — just an attribute update on the existing DOM nodes.

---

## 5. DataTable Row Memoization — `DataTable.jsx`

```jsx
import { memo } from 'react';

const TableRow = memo(function TableRow({ row, columns }) {
  return (
    <tr>
      {columns.map(col => (
        <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
      ))}
    </tr>
  );
}, (prev, next) => prev.row === next.row && prev.columns === next.columns);
```

For this `memo` to actually prevent re-renders, two things must hold upstream:
1. `row` objects must be stable references — don't do `.map(r => ({...r}))` on every render in the parent.
2. `columns` must come from a `useMemo` with a stable dependency array (see below) — not redefined inline in JSX.

```javascript
// In AlertIntelligence.jsx / DealerIntelligence.jsx — wherever columns are defined
const columns = useMemo(() => [
  { key: 'state', label: 'State' },
  { key: 'mom', label: 'MoM %', render: (row) => <MoMIndicator value={row.mom} /> },
  // ...
], [metricMode]); // only re-derive when metricMode actually changes
```

**Common mistake to avoid:** `useMemo(() => [...], [])` when the array actually references `metricMode` or similar inside — this creates a stale closure bug, not a perf win. Only use an empty dep array if the array truly has zero external dependencies.

---

## 6. Vite Chunk Splitting — `vite.config.js`

```javascript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          d3: ['d3', 'd3-geo', 'd3-scale', 'topojson-client'],
          recharts: ['recharts'],
          motion: ['framer-motion'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
```

Split `framer-motion` into its own chunk (`motion`), separate from `vendor` — it's large and changes independently of React itself.

**Verify:** `npm run build` → check `dist/assets/` — you should see `d3-[hash].js`, `recharts-[hash].js`, `motion-[hash].js` as separate files, each cacheable independently.

---

## 7. Context Splitting — `DataContext.jsx` (do last)

Split into two contexts instead of one:

```javascript
const DataStateContext = createContext();   // fetched metrics, rarely changes
const FilterContext = createContext();      // selectedState, selectedDistrict, changes often
```

Components that only read `DataStateContext` (e.g., a KPI card showing total dispatch) won't re-render when `selectedDistrict` changes, because they're not subscribed to `FilterContext`.

**Migration risk:** every component currently calling `useContext(DataContext)` needs to be checked — some read both filters and data and need both hooks. Do this last, and grep every usage of the context before touching the provider.

---

## Measurable Success Criteria

Don't ship based on "feels smoother." Check these in DevTools:

| Check | Tool | Target |
|---|---|---|
| Map hover re-render count | React DevTools Profiler, hover 2s | 0 component re-renders during mousemove |
| Search input lag | Type in DealerIntelligence search | No dropped frames in Performance tab while typing |
| Initial bundle size | `npm run build` output | Main chunk should shrink once routes are split — compare before/after `dist/assets/index-*.js` size |
| Route nav | Network tab, click a nav item | Separate chunk file fetched, not already in initial load |
| Long tasks | Performance tab, record a table sort/filter | No task >50ms |

---

## What Was Removed From v1

- Vague instructions like "wrap in `useMemo`" without specifying the dependency array — every `useMemo` above has an explicit, justified dep array.
- "Avoid inline arrays/objects" as a blanket rule — replaced with the specific `columns` pattern in DataTable, since that's the actual place it matters.
- Generic "GPU acceleration" advice — replaced with the specific `translate3d` tooltip pattern, which is the actual mechanism, not just `will-change` as a cure-all.
