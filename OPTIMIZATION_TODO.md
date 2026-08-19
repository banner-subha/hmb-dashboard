# hmb-dashboard — Remaining Optimization Tasks

Context: a prior pass already audited the whole dashboard and fixed the
highest-impact, lowest-risk issues (logo image size, a lucide-react
tree-shaking bug that bloated the vendor bundle, CLS on the logo, a
preconnect hint). Those are done — **do not re-touch the items in the
"Already optimized — leave alone" section below.**

Hard constraint for every task: **do not change any business logic,
KPI/MoM math, filtering rules, or data shapes.** These are structural/
build/render-path changes only. After each task, run `npm run build`
and `npm run lint` and confirm no new errors (pre-existing lint errors
in `trendEngine.js`, `processKPIs.js`, `severity.js`, `testEngine.js`,
etc. are known and out of scope — don't fix unrelated lint noise unless
it's in a file you're already editing for one of these tasks).

---

## Already optimized — leave alone

- Route-level code splitting (`React.lazy` per page in `App.jsx`) +
  manual Vite chunking for d3/recharts/framer-motion (`vite.config.js`).
- `GeoIntelligence.jsx` map rendering: imperative D3 `select().selectAll()`
  enter/exit pattern, RAF-driven pan/zoom, geometry/projection caching,
  Douglas-Peucker simplification on load.
- Debounced search (`AlertIntelligence.jsx`, `SearchInput.jsx`) and
  debounced resize (`useDebouncedResize.js`).
- `useReducedMotion` hook + `LazyMotion`/`domAnimation` in
  `DashboardLayout.jsx`.
- `DataTable.jsx` — paginated, memoized `TableRow`.
- Logo image (`public/hmb.png`), its `width`/`height` attrs, and the
  Supabase `preconnect` hint in `index.html` — already fixed.
- `lucide-react` imports in `DashboardLayout.jsx` — already fixed
  (explicit imports + `NAV_ICON_MAP`, no more `import * as Icons`).

---

## Task 1: Split `DataContext` so filter changes stop re-rendering everything

**File:** `src/context/DataContext.jsx`

**Problem:** The context already exposes `DataStateContext` and
`FilterContext` separately, but every consumer (`DashboardLayout.jsx`,
all pages, `FilterBar.jsx`, `SearchInput.jsx`) uses the combined
`useData()` hook instead. Worse, `dataStateValue`'s `useMemo` includes
`filteredData` (exposed as `data`) in its dependency array — and
`filteredData` changes on *every* filter/search dispatch. That means
even splitting consumers over to `useDataState()` today wouldn't help,
because that context object still gets a new reference on every filter
change.

**Goal:** A component that only needs `rawData` (e.g. the header in
`DashboardLayout.jsx`, which reads `rawData.meta.generatedAt` for the
"last synced" text) should NOT re-render when the user types in search
or changes a dropdown filter.

**Approach:**
1. Create a new context (e.g. `RawDataContext`) that holds only
   `rawData`, `loading`, `error`, `refresh` — values that change only
   on fetch/refetch, never on filter changes.
2. Keep `FilterContext` as-is (`filters`, `dispatch`).
3. Keep a `FilteredDataContext` (or repurpose `DataStateContext`) for
   `data` (filtered), `overallData`, `filterOptions` — these are
   allowed to change on filter dispatch.
4. Keep the combined `useData()` hook working (merge all three) so you
   don't have to touch every call site in one shot — but update the
   call sites that only need one slice:
   - `DashboardLayout.jsx` → only needs `rawData` → switch to the new
     raw-data-only hook.
   - `FilterBar.jsx` → needs `filters`, `dispatch`, `filterOptions` →
     use filter hook + filtered-data hook, not raw.
   - `SearchInput.jsx` → needs `filters`, `dispatch` only → filter hook
     only.
   - Page components (`StateIntelligence.jsx`, `DealerIntelligence.jsx`,
     etc.) that read `data`/`overallData` can stay on the combined hook
     for now unless it's easy to narrow.
5. Do NOT change `processData()`'s logic, the filter reducer's logic,
   or any field names returned to consumers — only the wiring of which
   context provides which slice.

**Acceptance check:** Add a temporary render counter (or use React
DevTools profiler) on `DashboardLayout` and confirm typing in the
search box on the Alerts page no longer re-renders the sidebar/header.
Remove the temporary counter before finishing.

---

## Task 2: Pre-simplify large geo JSON at build/prep time

**Files:** `public/geo/*.json` (esp. `tamilnadu.json`, 932KB —
largest by far; also check `maharashtra.json` 52KB, `madhyapradesh.json`
72KB, `uttarpradesh.json` 80KB), and the simplification logic in
`src/pages/GeoIntelligence.jsx` (`simplifyPath`, `simplifyGeometry`,
`simplifyFeatureCollection`, Douglas-Peucker, top of file).

**Problem:** These per-state district boundary files are fetched and
then simplified *at runtime in the browser* every time a user opens
that state's view. The simplification tolerance is fixed in code, so
the runtime work is redundant — it produces the same result every time.

**Approach:**
1. Write a one-off Node script (not part of the app bundle) that:
   - Loads each `public/geo/{state}.json`.
   - Runs the *exact same* `simplifyGeometry`/`simplifyPath` logic
     already in `GeoIntelligence.jsx` (extract it to a shared module so
     both the script and the component import the same code — don't
     fork/duplicate the algorithm).
   - Writes the simplified output back to `public/geo/{state}.json` (or
     to a new `public/geo-simplified/` directory if you want to keep
     originals for reference).
2. Update `GeoIntelligence.jsx` to skip the runtime `simplifyGeometry`
   call for files it knows are pre-simplified (or just remove the
   runtime call entirely if all files are now pre-simplified — but
   confirm the visual output is pixel-identical at the tolerance
   currently used before removing it).
3. Re-run `npm run build` and manually check a few states (esp. Tamil
   Nadu, West Bengal) on the Geo Intelligence page to confirm the map
   still renders correctly and district click/hover targeting still
   works (hit-testing depends on the same paths).

**Acceptance check:** `public/geo/tamilnadu.json` should shrink
noticeably (expect well over 50% reduction based on typical Douglas-
Peucker tolerances) with no visible change to the rendered map shape at
normal zoom levels, and no change to click/hover accuracy.

---

## Task 3 (optional, low-risk, do last): Page-transition animation feel

**File:** `src/layouts/DashboardLayout.jsx`, around the
`<AnimatePresence mode="wait">` wrapping `<AnimatedPage>`/`<Outlet>`.

**Problem:** `mode="wait"` delays mounting the new page until the old
page's exit animation finishes, which adds felt latency to navigation
between dashboard sections.

**Approach:** Try `mode="popLayout"` (or removing `mode` entirely) and
compare navigation feel between a couple of pages with very different
content heights (e.g. Executive Overview → Alert Intelligence). If you
see a layout jump/flash that `mode="wait"` was clearly there to
prevent, revert — this one is a judgment call, not a clear win, so
don't force it if it looks worse.

**Acceptance check:** Purely visual — navigate between all 7 routes and
confirm no jarring jump/flash, then leave as `popLayout` if it looks
smoother, or revert to `wait` if not. Note whichever you pick and why
in the PR description.

---

## When done

Run `npm run build` once more and report the new `vendor`/largest chunk
sizes next to the baseline from this pass (vendor was 279KB / 87KB
gzip after Task 0's lucide-react fix) so we can track total improvement.
