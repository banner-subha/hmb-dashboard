# HMB Dashboard — Performance Optimization Master Plan

> **Scope:** Tab-switch latency · Sub-60fps scrolling · Laggy chart animations on refresh
> **Generated from:** `graphify-out/graph.json` + full source audit (Aug 2026)
> **Target:** Constant 60fps on desktop and mobile, instant tab transitions, butter-smooth animations

---

## 0. Problem Diagnosis (Root Causes)

From the graphify community graph and source audit, the lag symptoms map to **four distinct bottlenecks**:

| Symptom | Root Cause | Primary Files |
|---|---|---|
| Slow tab switch | `processData()` runs synchronously on every filter/nav event via `overallData` memo | `DataContext.jsx:550-554` |
| Sub-60fps scroll | `backdrop-filter: blur(16px)` on every `.glass-card` + `background-attachment: fixed` forces per-frame GPU composite stall | `index.css:514, 483` |
| Laggy charts on refresh | Recharts `isAnimationActive={true}` fires for all charts simultaneously at page mount | All 5 chart files |
| AnimatePresence flicker | `mode="popLayout"` + `AnimatedPage` with nested `LazyMotion` triggers double-paint on tab switch | `DashboardLayout.jsx:289-303`, `AnimatedPage.jsx` |

---

## 1. Tab-Switch Latency — Context & Routing Layer

### 1.1 `DataContext.jsx` — Eliminate Redundant `processData()` Calls

**File:** `src/context/DataContext.jsx` lines 550–554

**Problem:** `overallData` re-runs the full `processData(rawData, initialFilters, user)` call — a 500+ line filter/map/sort pipeline — every time `filteredData`, `rawData`, `filters`, or `user` changes. Since every page reads from `DataContext`, this fires on every navigation AND on every filter interaction.

**Fix — Remove `filteredData` from `overallData` deps:**

```jsx
// BEFORE (line 550-554) — recomputes when filteredData changes, cascades on every filter touch
const overallData = useMemo(() => {
  const isFiltered = filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.selectedSeverity || filters.searchQuery;
  if (!isFiltered) return filteredData;
  return processData(rawData, initialFilters, user);
}, [rawData, filters, user, filteredData]);

// AFTER — only recompute when rawData or user changes; always returns the unfiltered view
const overallData = useMemo(() => {
  return processData(rawData, initialFilters, user);
}, [rawData, user]);
```

> **Why this is safe:** `overallData` is the unfiltered global view used by `ExecutiveOverview` and `AIWarRoom`. It should never depend on `filteredData`. Removing `filteredData` from deps stops the cascade re-render that fires after every filter change.

**Also remove the legacy monolithic `value` memo (lines 650–653):** The 4 split providers (`RawDataContext`, `DataStateContext`, `FilterContext`, `DataContext`) already cover everything. The `useData()` hook at line 690 re-creates a combined object — but this hook is only kept for backward compatibility. Consumers of the split hooks (`useDataState`, `useFilterState`, `useRawData`) are unaffected.

---

### 1.2 `DashboardLayout.jsx` — Fix AnimatePresence + Suspense Double-Paint

**File:** `src/layouts/DashboardLayout.jsx` lines 289–303

**Problem:** `mode="popLayout"` measures the exiting element's DOM before removing it — this blocks the entering animation start by one full paint. Combined with Suspense's async boundary, this creates: old page disappears → blank frame → spinner → new page animates in.

**Fix — Switch to `mode="wait"`:**

```jsx
// BEFORE
<AnimatePresence mode="popLayout">

// AFTER — exit animation completes fully before enter starts; no blank frame
<AnimatePresence mode="wait">
```

---

### 1.3 `AnimatedPage.jsx` — Remove Duplicate `LazyMotion` Wrapper

**File:** `src/components/common/AnimatedPage.jsx`

**Problem:** `AnimatedPage` wraps its content in `<LazyMotion features={domAnimation}>`. But `DashboardLayout.jsx` already wraps the entire layout in `<LazyMotion features={domAnimation}>` at line 122. Loading the same feature bundle twice increases animation overhead per page transition.

**Fix — Remove `LazyMotion` from `AnimatedPage`, use `m.div` directly:**

```jsx
// BEFORE
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { pageVariants } from '../../utils/motionVariants';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function AnimatedPage({ children }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <LazyMotion features={domAnimation}>
      <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
        {children}
      </m.div>
    </LazyMotion>
  );
}

// AFTER — DashboardLayout already provides LazyMotion context
import { m } from 'framer-motion';
import { pageVariants } from '../../utils/motionVariants';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function AnimatedPage({ children }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <m.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </m.div>
  );
}
```

---

### 1.4 `motionVariants.js` — Reduce Page Transition Duration

**File:** `src/utils/motionVariants.js`

**Problem:** Page enter uses `duration: 0.28` + exit uses `duration: 0.15` = ~430ms total perceived delay per tab switch. The `y: 12` drift also adds a subtle layout thrash.

**Fix — Tighten all timings:**

```js
// BEFORE
export const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

// AFTER — snappier, still polished
export const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, transition: { duration: 0.10 } },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
```

---

## 2. Sub-60fps Scrolling — CSS & Compositing Layer

### 2.1 `index.css` — Remove `backdrop-filter` from `.glass-card`

**File:** `src/index.css` lines 511–516 (`.glass-card`) and 518–526 (`.glass-card-hover`)

**Problem:** `backdrop-filter: blur(16px)` creates a new GPU compositor layer for **every card on the page**. On `AlertIntelligence.jsx` (2075 lines, 50+ cards), this means 50+ compositor layers. Each must be blurred independently on every scroll frame, saturating GPU memory bandwidth and causing sub-60fps scroll on mobile devices.

**Fix — Remove `backdrop-filter`, keep visual premium via gradient + shadow:**

```css
/* BEFORE */
.glass-card {
  @apply border border-border/80 rounded-2xl;
  background: var(--gradient-card);
  backdrop-filter: blur(16px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

/* AFTER — identical visual feel, zero compositor cost */
.glass-card {
  @apply border border-border/80 rounded-2xl;
  background: var(--gradient-card);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* BEFORE */
.glass-card-hover {
  @apply border border-border/80 rounded-2xl transition-transform duration-200;
  transition-property: transform, border-color, box-shadow, background;
  transition-duration: 200ms;
  transition-timing-function: ease-out;
  background: var(--gradient-card);
  backdrop-filter: blur(16px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

/* AFTER */
.glass-card-hover {
  @apply border border-border/80 rounded-2xl transition-transform duration-200;
  transition-property: transform, border-color, box-shadow, background;
  transition-duration: 200ms;
  transition-timing-function: ease-out;
  background: var(--gradient-card);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

> **Visual impact:** Zero on this dashboard. The dark gradient is opaque — there's nothing behind the cards to blur. The inset highlight slightly brightened maintains the glass feel.

---

### 2.2 `index.css` — Fix `background-attachment: fixed` on Mobile

**File:** `src/index.css` line 483

**Problem:** `background-attachment: fixed` is the single biggest mobile scroll performance killer. On iOS Safari and Chrome Android, it disables hardware-accelerated scrolling entirely, forcing the browser to re-composite the background on every scroll tick.

**Fix — Replace with a fixed `::before` pseudo-element:**

```css
/* BEFORE */
body {
  @apply bg-bg-primary text-text-primary font-sans antialiased;
  margin: 0;
  min-height: 100vh;
  background: var(--gradient-page);
  background-attachment: fixed;   /* REMOVE */
}

/* AFTER — achieve the same fixed-background effect without the scroll penalty */
body {
  @apply bg-bg-primary text-text-primary font-sans antialiased;
  margin: 0;
  min-height: 100vh;
  background: var(--gradient-page);
  /* background-attachment: fixed removed */
  contain: layout style;  /* NEW: isolate paint layers */
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--gradient-page);
  pointer-events: none;
}
```

---

### 2.3 `DashboardLayout.jsx` — Add `overscroll-behavior: contain`

**File:** `src/layouts/DashboardLayout.jsx` line 287

The main scroll container should prevent scroll chaining (iOS bounce fighting with content scroll):

```jsx
// BEFORE
<div className="flex-1 overflow-auto p-4 sm:p-6">

// AFTER
<div className="flex-1 overflow-auto p-4 sm:p-6" style={{ overscrollBehavior: 'contain' }}>
```

---

### 2.4 `index.css` — Add `will-change` Only on Active Animation Classes

**File:** `src/index.css` lines 722–728

```css
/* BEFORE */
.animate-fade-in {
  animation: fadeIn 0.3s ease-out both;
}
.animate-slide-up {
  animation: slideUp 0.3s ease-out both;
}

/* AFTER — compositor hint scoped to the animation window only */
.animate-fade-in {
  animation: fadeIn 0.3s ease-out both;
  will-change: opacity;
}
.animate-slide-up {
  animation: slideUp 0.3s ease-out both;
  will-change: opacity, transform;
}
```

> Do NOT add `will-change` to `.glass-card` globally — it would permanently promote every card to a GPU layer (same problem as `backdrop-filter`).

---

## 3. Chart Animation Lag on Refresh

### 3.1 Create `useChartVisible` Hook (New File)

**New file:** `src/hooks/useChartVisible.js`

**Problem:** All charts have `isAnimationActive={true}` and fire their 700–800ms animations simultaneously on page mount. When 4–5 charts mount at once, the animation storm blocks the main thread for nearly a full second.

**Solution — Only animate when the chart enters the viewport:**

```js
// src/hooks/useChartVisible.js
import { useState, useEffect, useRef } from 'react';

/**
 * Returns true once the chart container scrolls into the viewport.
 * The ref stays on the chart wrapper div (same ref used by useDebouncedResize).
 * hasAnimated prevents re-triggering on subsequent re-renders.
 */
export function useChartVisible(ref) {
  const [isVisible, setIsVisible] = useState(false);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ref.current || hasAnimated.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return isVisible;
}
```

---

### 3.2 Apply `useChartVisible` to All Chart Components

#### `ShareDonutChart.jsx` — lines 36, 84–86

```jsx
// ADD import
import { useChartVisible } from '../../hooks/useChartVisible';

export default function ShareDonutChart({ data, dataKey = "cur", nameKey = "product", height = 300 }) {
  const containerRef = useRef(null);
  const { width } = useDebouncedResize(containerRef, 150);
  const isVisible = useChartVisible(containerRef);   // NEW LINE

  // ...chartData memo unchanged...

  return (
    <div ref={containerRef} className="animate-fade-in" style={{ height: `${height}px`, width: '100%' }}>
      {width > 0 && (
        <PieChart width={width} height={height}>
          <Pie
            // ...other props unchanged...
            isAnimationActive={isVisible}     // CHANGED from: true
            animationDuration={500}            // REDUCED from: 700
            animationEasing="ease-out"
          >
            {/* cells unchanged */}
          </Pie>
          <Tooltip content={<CustomTooltip />} isAnimationActive={false} />
          <Legend verticalAlign="bottom" height={44} iconType="circle"
            wrapperStyle={{ fontSize: '12px', color: 'var(--color-text-muted)', paddingTop: '16px' }} />
        </PieChart>
      )}
    </div>
  );
}
```

#### `MoMAreaTrendChart.jsx` — line 166–168

```jsx
// ADD import
import { useChartVisible } from '../../hooks/useChartVisible';

// Inside the component, after useDebouncedResize:
const isVisible = useChartVisible(containerRef);   // NEW

// Change on <Area> element:
<Area
  // ...other props unchanged...
  isAnimationActive={isVisible}   // CHANGED from: true
  animationDuration={600}          // REDUCED from: 800
/>
```

#### `RiskScatterPlot.jsx` — line 109

```jsx
// ADD import
import { useChartVisible } from '../../hooks/useChartVisible';

// Inside the component, after useDebouncedResize:
const isVisible = useChartVisible(containerRef);   // NEW

// Change on <Scatter> element:
<Scatter data={chartData} name="Impact"
  isAnimationActive={isVisible}   // CHANGED from: true
  animationDuration={500}          // REDUCED from: 700
  animationEasing="ease-out">
```

#### `ProductBarChart.jsx` and `MoMTrendChart.jsx`

Apply the same two changes: import `useChartVisible`, call it with `containerRef`, pass `isVisible` to `isAnimationActive`.

---

### 3.3 `useDebouncedResize.js` — Instant First Measure

**File:** `src/hooks/useDebouncedResize.js`

**Problem:** Every chart waits the full 150ms debounce on its FIRST observation before getting a width. 5 charts × 150ms = charts feel laggy to appear.

**Fix — Measure immediately on first observation, debounce only window-resize events:**

```js
import { useState, useEffect, useRef } from 'react';

export function useDebouncedResize(ref, delay = 150) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const timeoutRef = useRef(null);
  const isFirstMeasure = useRef(true);   // NEW

  useEffect(() => {
    if (!ref.current) return;
    const observeTarget = ref.current;

    const observer = new ResizeObserver((entries) => {
      if (!entries || !entries.length) return;
      const { width, height } = entries[0].contentRect;
      const roundedWidth = Math.floor(width);
      const roundedHeight = Math.floor(height);

      // First observation: set immediately — no debounce needed, no resize happening
      if (isFirstMeasure.current) {
        isFirstMeasure.current = false;
        requestAnimationFrame(() => {
          setDimensions({ width: roundedWidth, height: roundedHeight });
        });
        return;
      }

      // Subsequent: debounce to avoid thrash during window resize
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          setDimensions(prev => {
            if (prev.width === roundedWidth && prev.height === roundedHeight) return prev;
            return { width: roundedWidth, height: roundedHeight };
          });
        });
      }, delay);
    });

    observer.observe(observeTarget);
    return () => {
      observer.disconnect();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [ref, delay]);

  return dimensions;
}
```

---

## 4. GeoIntelligence Map — Specific Fixes

**File:** `src/pages/GeoIntelligence.jsx`

### 4.1 `index.css` — Fix `touch-action` on `.map-svg`

**File:** `src/index.css` line 857

```css
/* BEFORE — allows y-pan but fights D3 zoom gestures */
.map-svg {
  shape-rendering: geometricPrecision;
  touch-action: pan-y;
}

/* AFTER — D3 zoom's internal pointer handler manages all gestures */
.map-svg {
  shape-rendering: geometricPrecision;
  touch-action: none;
}
```

### 4.2 Throttle Tooltip Position Updates with RAF

Inside `GeoIntelligence.jsx`, the `Tooltip` component follows mouse position. Ensure the mousemove handler that updates `tooltipRef.current.style.transform` uses `requestAnimationFrame` throttling:

```js
// In GeoIntelligence.jsx — wrap the mousemove/pointermove handler
let rafId = null;
const handleMouseMove = (e) => {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.transform =
        `translate(${e.clientX + 16}px, ${e.clientY - 10}px)`;
    }
  });
};
```

### 4.3 Prefetch India GeoJSON After Login

**File:** `src/App.jsx` — add after `DataProvider` confirms data loaded

```jsx
// In App.jsx, inside GeoIntelligenceWrapper or at the DataProvider level,
// silently prefetch the state geo file once rawData is available
useEffect(() => {
  if (rawData) {
    // Non-blocking prefetch — warms browser HTTP cache for instant map render
    fetch('/geo/india_state.geojson', { priority: 'low' }).catch(() => {});
  }
}, [!!rawData]);  // run once when rawData goes from null → loaded
```

---

## 5. AlertIntelligence — Prevent DOM Node Mount Storm

**File:** `src/pages/AlertIntelligence.jsx`

**Problem:** AlertIntelligence is 112KB / 2075 lines and renders an expandable hierarchy tree. With 50+ alerts, all DOM nodes mount simultaneously on first load.

**Quick fix — `content-visibility: auto` on the alert list wrapper:**

```jsx
// Find the main alert list container div in AlertIntelligence.jsx
// and add content-visibility to let the browser skip off-screen rendering
<div
  className="space-y-2"
  style={{ contentVisibility: 'auto', containIntrinsicSize: '0 600px' }}
>
  {/* alert tree items */}
</div>
```

**Longer fix (recommended for production):** Install `@tanstack/react-virtual` (same vendor family as `@tanstack/react-table` already in your `package.json`) and virtualize the flat alert list. This eliminates all off-screen DOM nodes.

---

## 6. DataTable — Row Memoization Comparator

**File:** `src/components/common/DataTable.jsx` line 12

`TableRow` is already in `memo()` — correct. But TanStack Table creates a new `row` object reference on every render even if the underlying data hasn't changed. Add a custom comparator:

```jsx
const TableRow = memo(function TableRow({ row, onRowClick }) {
  return (
    <tr
      onClick={() => onRowClick && onRowClick(row.original)}
      className={`table-row-separator transition-colors bg-bg-card hover:bg-bg-card-hover group ${onRowClick ? 'cursor-pointer' : ''}`}
    >
      {row.getVisibleCells().map((cell, index) => (
        <td
          key={cell.id}
          className={`px-2.5 sm:px-3 py-3.5 table-cell-separator ${index === 0 ? 'sticky left-0 z-10 bg-bg-card group-hover:bg-bg-card-hover shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] font-semibold' : ''}`}
          style={{
            width: cell.column.columnDef.meta?.width,
            minWidth: cell.column.columnDef.meta?.minWidth,
            maxWidth: cell.column.columnDef.meta?.maxWidth,
          }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the actual data row changed or click handler changed
  return prevProps.row.original === nextProps.row.original &&
         prevProps.onRowClick === nextProps.onRowClick;
});
```

---

## 7. SearchInput — Increase Debounce

**File:** `src/components/common/SearchInput.jsx` line 23

Current 200ms fires `processData()` on every fast keystroke. Increase to 300ms:

```jsx
// BEFORE
timerRef.current = setTimeout(() => {
  dispatch({ type: 'SET_SEARCH', payload: val });
}, 200);

// AFTER
timerRef.current = setTimeout(() => {
  dispatch({ type: 'SET_SEARCH', payload: val });
}, 300);
```

---

## 8. FilterBar — Wrap in `memo` with Stable Callbacks

**File:** `src/components/common/FilterBar.jsx`

```jsx
import { memo, useCallback } from 'react';
import { useFilterState, useDataState } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { isWestBengalUser } from '../../utils/constants';

const FilterBar = memo(function FilterBar({ children }) {
  const { filters, dispatch } = useFilterState();
  const { filterOptions } = useDataState();
  const { user } = useAuth();
  const showNorthBengal = isWestBengalUser(user, filterOptions);

  const handleStateChange = useCallback(
    (e) => dispatch({ type: 'SET_STATE', payload: e.target.value || null }), [dispatch]
  );
  const handleDistrictChange = useCallback(
    (e) => dispatch({ type: 'SET_DISTRICT', payload: e.target.value || null }), [dispatch]
  );
  const handleProductChange = useCallback(
    (e) => dispatch({ type: 'SET_PRODUCT', payload: e.target.value || null }), [dispatch]
  );

  return (
    <div className="glass-card p-5 flex flex-wrap items-center gap-2 mb-5">
      <select
        className="filter-select w-full sm:w-[140px]"
        value={filters.selectedState || ''}
        onChange={handleStateChange}
      >
        <option value="">All States</option>
        {filterOptions.states.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {(filters.selectedState || filterOptions.districts.length > 0) && (
        <select
          className="filter-select w-full sm:w-[140px]"
          value={filters.selectedDistrict || ''}
          onChange={handleDistrictChange}
        >
          <option value="">All Districts</option>
          {filterOptions.districts.map(d => (
            <option key={d} value={d}>
              {d === '0' ? '0 (Unassigned / Pending)' : (d === 'VERBAL' ? 'VERBAL (Verbal Orders)' : d)}
            </option>
          ))}
        </select>
      )}

      <select
        className="filter-select w-full sm:w-[140px]"
        value={filters.selectedProduct || ''}
        onChange={handleProductChange}
      >
        <option value="">All Products</option>
        {filterOptions.products.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      {showNorthBengal && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_NORTH_BENGAL' })}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
            filters.isNorthBengal
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
              : 'bg-bg-tertiary/60 text-text-secondary border-border/40 hover:border-border'
          }`}
          title="Filter North Bengal Districts"
        >
          <span className={`w-2 h-2 rounded-full ${filters.isNorthBengal ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted/40'}`} />
          North Bengal
        </button>
      )}

      {children}

      {(filters.selectedState || filters.selectedDistrict || filters.selectedProduct || filters.searchQuery || (user?.role === 'client' && filters.isNorthBengal)) && (
        <button
          onClick={() => dispatch({ type: 'RESET' })}
          className="text-[11px] text-text-muted hover:text-text-primary underline underline-offset-2 transition-colors px-1 cursor-pointer whitespace-nowrap"
        >
          Clear
        </button>
      )}
    </div>
  );
});

export default FilterBar;
```

---

## 9. Vite Build Config — Vendor Code Splitting

**File:** `vite.config.js`

All 7 pages are correctly lazy-loaded in `App.jsx`. Ensure heavy vendor libraries land in separate cached chunks:

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-recharts': ['recharts'],
          'vendor-d3': [
            'd3-selection', 'd3-geo', 'd3-scale',
            'd3-interpolate', 'd3-ease', 'd3-color', 'd3-transition'
          ],
          'vendor-framer': ['framer-motion'],
          'vendor-tanstack': ['@tanstack/react-table'],
        },
      },
    },
  },
});
```

> D3 + Recharts together are ~450KB. Separate chunks load in parallel and are independently cached between deployments.

---

## 10. Priority Execution Table

Apply changes in this order — highest ROI first:

| Priority | Change | File + Lines | Expected Gain |
|---|---|---|---|
| 🔴 **P0** | Remove `backdrop-filter: blur(16px)` | `index.css:514, 525` | 60fps scroll on mobile |
| 🔴 **P0** | Remove `background-attachment: fixed` + `::before` fix | `index.css:483` | 60fps scroll on iOS |
| 🔴 **P0** | Fix `overallData` memo deps (`filteredData` removed) | `DataContext.jsx:550-554` | Instant tab switch |
| 🟠 **P1** | Switch `AnimatePresence mode="popLayout"` → `"wait"` | `DashboardLayout.jsx:289` | No blank-frame flicker |
| 🟠 **P1** | Remove dup `LazyMotion` from `AnimatedPage` | `AnimatedPage.jsx` | Halve animation library overhead |
| 🟠 **P1** | Tighten `pageVariants` + `staggerContainer` timing | `motionVariants.js` | ~200ms faster tab perception |
| 🟡 **P2** | New `useChartVisible.js` hook + apply to all 5 charts | `src/hooks/useChartVisible.js` + chart files | Staggered chart animations, no storm |
| 🟡 **P2** | Instant first measure in `useDebouncedResize` | `useDebouncedResize.js` | Charts render immediately on mount |
| 🟡 **P2** | `TableRow` custom memo comparator | `DataTable.jsx:12` | No row re-render on unrelated state |
| 🟡 **P2** | Add `overscroll-behavior: contain` | `DashboardLayout.jsx:287` | No iOS bounce jank |
| 🟢 **P3** | Wrap `FilterBar` in `memo` + `useCallback` | `FilterBar.jsx` | Prevents re-renders on data updates |
| 🟢 **P3** | Search debounce 200ms → 300ms | `SearchInput.jsx:23` | Fewer mid-type `processData()` calls |
| 🟢 **P3** | `touch-action: none` on `.map-svg` | `index.css:857` | D3 gestures uncontested on mobile |
| 🟢 **P3** | RAF throttle on tooltip `mousemove` | `GeoIntelligence.jsx` | Map tooltip follows at 60fps |
| 🟢 **P3** | Vite manual chunks for D3/Recharts/Framer | `vite.config.js` | Faster initial load, better caching |
| 🟢 **P3** | Geo GeoJSON prefetch on data load | `App.jsx` | Instant map on first visit |

---

## 11. What NOT to Change

These patterns are **already correct** — leave them alone:

- ✅ **Context split** — 4 providers (`RawDataContext`, `DataStateContext`, `FilterContext`, `DataContext`) already in place. Correct architecture.
- ✅ **`filterReducer` identity guards** — `if (state.field === action.payload) return state` already prevents spurious re-renders.
- ✅ **Tooltip `isAnimationActive={false}`** — all chart tooltips already correctly skip animation.
- ✅ **`requestAnimationFrame` inside `useDebouncedResize`** — compositing pattern already correct (we only add the first-measure bypass).
- ✅ **`useReducedMotion` in `AnimatedPage`** — accessibility handled correctly.
- ✅ **`map-transform-layer` CSS** with `will-change: transform` — correct GPU layer for D3 zoom.
- ✅ **All 7 routes use `React.lazy()`** — code splitting already in place.
- ✅ **`geoCache` module-level object** — correct; prevents re-fetching geo files on re-render.
- ✅ **`projectionCache` module-level object** — correct; D3 projections are expensive, caching them is right.

---

## 12. Verification Checklist

After applying all changes, verify each target:

- [ ] **Chrome DevTools → Performance:** No long tasks (>50ms) during tab switch
- [ ] **Chrome DevTools → Layers panel:** Zero `.glass-card` elements creating compositor layers
- [ ] **Scroll FPS:** DevTools → Rendering → Frame Rendering Stats shows 60fps during page scroll
- [ ] **Mobile real device:** Scroll `AlertIntelligence` — no frame drops
- [ ] **Chart replay:** Navigate away from a page and back — chart animations play again (IntersectionObserver fires again because `hasAnimated.current` is per-component-instance)
- [ ] **Tab switch timing:** DevTools `performance.now()` diff from click → new page fully visible < 200ms
- [ ] **iOS Safari:** Long-page scroll — no rubber-band stutter (confirms `background-attachment: fixed` removal worked)
- [ ] **`AnimatePresence` mode:** No blank white frame between tab transitions
- [ ] **Reduced motion:** `AnimatedPage` returns plain `<>{children}</>` when OS reduced-motion preference is on
- [ ] **Map touch:** Pinch-zoom and pan on mobile map works smoothly without fighting scroll

---

*Grounded in graphify graph audit: 157 files · 640 nodes · 1425 edges.*
*Primary community: "Dashboard Performance Patterns" (Community 12, 16 nodes, cohesion 0.12).*
*Surprising connection flagged by graph: `Regional Map Filter Fix Documentation` → `Dashboard Optimization Guide` [INFERRED] — confirms these optimizations are part of a known performance work thread.*
