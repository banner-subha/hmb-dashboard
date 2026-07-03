# HMB Ispat — PulseBoard Dashboard Session Summary
**Date:** 25 Jun 2026 | **Prepared for:** Next Claude session

---

## WHAT WAS COMPLETED THIS SESSION

### 1. Power Query (MoM_export.csv) — DONE ✅
Final query produces these columns:
`ITEM, STATE, DISTRICT, CLIENT NAME, CUR_PERIOD, PREV_PERIOD, YTD_PERIOD, QTY_CUR, QTY_PREV, QTY_YTD, ORDER_CUR, ORDER_PREV, PENDING_CUR`

**Key logic:**
- `CUR` = 1st of current month → MaxDate (MTD)
- `PREV` = 1st of previous month → last day of previous month (full month)
- `YTD` = Jan 1st of current year → last day of previous month
- ORDER rows use YEAR + MONTH integer columns (not date columns) for period tagging
- `PENDING_CUR` = ORDER_CUR - QTY_CUR, clamped to 0 if result < 0.1 MT
- Integer-only detection for year/month (`Number.Mod(_, 1) = 0`) to exclude decimal QTY values like 2.5

### 2. n8n Workflow — PARTIALLY DONE ⚠️
**File edited:** `HMB_Ispat___AI_Intelligence_Layer_v20_updated.json`
**Node edited:** `Process All KPIs`

**Already added in this session:**
- `QTY_YTD` reading and accumulation
- `computePace()` function → outputs `dailyAvgQty`, `currentDailyRate`, `expectedMtd`, `lossDelta`, `lossDeltaPct`, `lossFlag`
- YTD date parsing from label strings
- `calcPending()` function (SUPERSEDED — see pending changes below)

---

## PENDING CHANGES — DO THESE FIRST IN NEXT SESSION

---

### CHANGE A — n8n: Process All KPIs node (CRITICAL)

The `calcPending()` function currently computes `ORDER_CUR - QTY_CUR` in n8n.
This is now WRONG because Power Query already computes `PENDING_CUR` correctly.
**Replace the entire pending logic in n8n with direct passthrough.**

#### Step 1 — Change `mkA()`:
```js
// OLD
const mkA = () => ({ c: 0, p: 0, oc: 0, op: 0, ytd: 0 });

// NEW
const mkA = () => ({ c: 0, p: 0, oc: 0, op: 0, ytd: 0, pending: 0 });
```

#### Step 2 — In the row reading loop, add PENDING_CUR:
```js
const pendingCur = parseFloat(r['PENDING_CUR']) || 0;

// Add to every accumulator:
overall.pending  += pendingCur;
sA.pending       += pendingCur;
spA.pending      += pendingCur;   // product within state
dA.pending       += pendingCur;
dpA.pending      += pendingCur;   // product within district
dlA.pending      += pendingCur;
dlpA.pending     += pendingCur;   // product within dealer
```

#### Step 3 — In the output section, replace all `calcPending(...)` with `fN(a.pending)`:
```js
// Overall level
pendingTotal:     fN(overall.pending),   // was: calcPending(overall.oc, overall.c)

// Per state (in states array map)
pendingQty: fN(a.pending),              // was: pendingQty: calcPending(a.oc, a.c)

// Per district (in districts array map)
pendingQty: fN(a.pending),

// Per dealer (in dealers array map)
pendingQty: fN(a.pending),

// Per product (in products array map)
pendingQty: fN(a.pending),
```

#### Step 4 — Delete the `calcPending` function entirely:
```js
// DELETE THIS ENTIRE FUNCTION:
function calcPending(orderCur, qtyCur) {
  const raw = orderCur - qtyCur;
  return raw < 0.1 ? 0 : Math.round(raw * 100) / 100;
}
```

---

### CHANGE B — n8n: Operational Context Formatter node

Add pace and pending fields to the AI context so Smart Insights generates
accurate summaries referencing historical daily averages.

In the `state_performance` map, add:
```js
state_performance: (i.scoredStates || []).slice(0, 8).map(s => ({
  state:              s.state,
  cur_mt:             fN(s.cur),
  prev_mt:            fN(s.prev),
  mom_pct:            s.mom,
  share_pct:          s.share,
  drop_mt:            fN(s.drop),
  // ADD THESE:
  daily_avg_qty:      s.dailyAvgQty,
  current_daily_rate: s.currentDailyRate,
  expected_mtd:       s.expectedMtd,
  loss_flag:          s.lossFlag,
  loss_delta_pct:     s.lossDeltaPct,
  pending_qty:        s.pendingQty,
  // END ADD
  products: (s.products || [])...
})),
```

Also add to `overall_performance`:
```js
overall_performance: {
  ...existing fields...,
  // ADD THESE:
  daily_avg_qty:      fN(d.dailyAvgQty),
  current_daily_rate: fN(d.currentDailyRate),
  expected_mtd:       fN(d.expectedMtd),
  loss_flag:          d.lossFlag,
  ytd_period:         d.ytdPeriod,
  cur_elapsed_days:   d.meta?.curElapsedDays,
  ytd_total_days:     d.meta?.ytdTotalDays,
  pending_total:      fN(d.pendingTotal),
}
```

---

## FRONTEND CHANGES NEEDED

### CHANGE C — Executive Summary: Pending KPI Card
**File:** `ExecutiveOverview.jsx`

```jsx
// Replace subtitle logic:
subtitle={data.pendingTotal > 0 ? "open order book" : "No open orders this cycle"}

// Ensure value reads:
value={data.pendingTotal}  // NOT any computed formula
```

---

### CHANGE D — All Performance Tables: PACE vs AVG Column
**Files:** `StatePerformance.jsx`, `DistrictPerformance.jsx` (already working),
`DealerPerformance.jsx`, `ExecutiveOverview.jsx` (state cards)

**Already working in District tab. Replicate exact same pattern to other tabs.**

Display logic:
```jsx
// Main indicator
{entity.lossFlag === 'AHEAD' && <span style={{color:'#22c55e'}}>▲ +{entity.lossDeltaPct}%</span>}
{entity.lossFlag === 'BEHIND' && <span style={{color:'#ef4444'}}>▼ {entity.lossDeltaPct}%</span>}
{entity.lossFlag === 'NO_DATA' && <span style={{color:'#6b7280'}}>—</span>}

// Sub-line (shorter format to prevent overflow)
<div style={{fontSize:'0.7rem', color:'#9ca3af'}}>
  {entity.currentDailyRate?.toFixed(1)} vs {entity.dailyAvgQty?.toFixed(1)} MT/d
</div>
```

Column width constraints (prevents overflow into SEVERITY):
```css
.pace-col { min-width: 160px; max-width: 180px; }
.severity-col { min-width: 100px; flex-shrink: 0; }
```

---

### CHANGE E — Regional Map: Full Filter Rebuild
**File:** `GeoIntelligence.jsx`

#### E1 — Remove "Order" TYPE button, add "Pending" button:
```
TYPE filters: [ All ] [ Despatch ] [ Pending ]   ← replace "Order" with "Pending"

When "Pending" selected:
  - Map heatmap uses state.pendingQty
  - Sidebar shows state.pendingQty per state
  - Summary card shows sum of all state.pendingQty
  - Color scale: white(0) → orange(moderate) → red(high)
  - Tooltip: "{state}: {pendingQty} MT pending"

When "Despatch" selected → existing QTY_CUR / QTY_PREV logic (unchanged)
When "All" selected → show QTY_CUR (same as Despatch default)
```

#### E2 — VIEWING month dropdown (dynamic, fully from data):
```js
// Parse from data.meta.ytdPeriod: "1 Jan 2026 - 31 May 2026"
// Parse from data.meta.curPeriod: "1 Jun 2026 - 23 Jun 2026"

// Generate month list:
// [Jan 2026, Feb 2026, Mar 2026, Apr 2026, May 2026, Jun 2026 (MTD)]

// Selection logic:
function getDataForMonth(selectedMonthKey, data) {
  const curMonth  = parseMonthKey(data.meta.curPeriod);   // "Jun 2026"
  const prevMonth = parseMonthKey(data.meta.prevPeriod);  // "May 2026"

  if (selectedMonthKey === curMonth)  return { field: 'cur',  available: true };
  if (selectedMonthKey === prevMonth) return { field: 'prev', available: true };
  return { field: null, available: false }; // → "Coming Soon" overlay
}

// MTD label always derived from curPeriod — NEVER hardcoded
// "Viewing:" label always reflects selected month
```

#### E3 — Fix header badge:
```
// Was hardcoded "Jul 2026 vs May 2026"
// Must be dynamic:
`${curMonthLabel} vs ${prevMonthLabel}`
// Both derived from data.meta at runtime
```

---

### CHANGE F — Regional Map: Rajasthan Missing
**File:** `GeoIntelligence.jsx` + any hardcoded state lists

- All state dropdowns/filters must be built from `data.states.map(s => s.state)` — NO hardcoded state arrays
- Map matching uses `state.geoKey` (= `state.state`) to match GeoJSON `ST_NM` property
- Rajasthan GeoJSON key = `"Rajasthan"` — confirm this matches `state.state` from JSON
- If missing from map render, check D3 choropleth matching function — it may have a whitelist

---

### CHANGE G — Smart Insights: Enriched AI Context
**File:** `SmartInsights.jsx` or wherever AI prompt is constructed

Pass these additional fields to the AI summary generator:
```js
// Add to context object sent to AI:
{
  ytd_period: data.ytdPeriod,
  cur_elapsed_days: data.meta.curElapsedDays,
  ytd_total_days: data.meta.ytdTotalDays,
  overall_daily_avg: data.dailyAvgQty,
  overall_current_rate: data.currentDailyRate,
  overall_loss_flag: data.lossFlag,
  overall_expected_mtd: data.expectedMtd,
  top_states_pace: data.states.slice(0, 5).map(s => ({
    state: s.state,
    loss_flag: s.lossFlag,
    loss_delta_pct: s.lossDeltaPct,
    daily_avg_qty: s.dailyAvgQty,
    current_daily_rate: s.currentDailyRate,
  }))
}
```

AI should produce sentences like:
*"West Bengal is running 18% below its Jan-May daily average pace of 44.3 MT/day,
currently tracking at only 36.2 MT/day with 24 days elapsed this month."*

---

### CHANGE H — Executive Summary: Top Declining States
**File:** `ExecutiveOverview.jsx`

Remove PACE badges (green +26%, +32%) from the "Top Declining States" section.
That section shows only:
- Severity badge (CRITICAL/HIGH)
- State name
- Current volume MT
- MoM % trend arrow

PACE vs AVG belongs ONLY in the dedicated performance tables.

---

## DATA FLOW SUMMARY

```
Excel Raw Data (DESPATCH + ORDER rows)
        ↓
Power Query M Script
  - Splits by TYPE
  - DESPATCH: uses DESPATCH DATE
  - ORDER: uses YEAR + MONTH integer columns
  - Computes PENDING_CUR = max(0, ORDER_CUR - QTY_CUR)
  - Outputs: QTY_CUR, QTY_PREV, QTY_YTD, ORDER_CUR, ORDER_PREV, PENDING_CUR
        ↓
Python sync script → exports MoM_export.csv → Dropbox
        ↓
n8n: Fetch MoM CSV → Extract from File → Process All KPIs
  - Reads PENDING_CUR directly (no recomputation)
  - Computes dailyAvgQty, currentDailyRate, lossFlag per entity
  - Outputs to latest.json in Supabase Storage
        ↓
React PulseBoard (hmb-dashboard.vercel.app)
  - Reads latest.json
  - Displays PACE vs AVG, pendingQty, dynamic month filter
```

---

## KEY FIELD REFERENCE (latest.json schema)

### Root level:
| Field | Description |
|---|---|
| `totalCur` | Total MTD despatch MT |
| `totalPrev` | Total previous month despatch MT |
| `totalYtd` | Total YTD despatch MT |
| `pendingTotal` | Sum of all pending orders (from PENDING_CUR) |
| `dailyAvgQty` | Overall daily avg (YTD ÷ ytdTotalDays) |
| `currentDailyRate` | Overall daily rate (totalCur ÷ curElapsedDays) |
| `expectedMtd` | dailyAvgQty × curElapsedDays |
| `lossDelta` | currentDailyRate - dailyAvgQty |
| `lossDeltaPct` | Delta as % of avg |
| `lossFlag` | "BEHIND" / "AHEAD" / "NO_DATA" |
| `curPeriod` | "1 Jun 2026 - 23 Jun 2026" |
| `prevPeriod` | "1 May 2026 - 31 May 2026" |
| `ytdPeriod` | "1 Jan 2026 - 31 May 2026" |
| `meta.ytdTotalDays` | Total days in YTD window |
| `meta.curElapsedDays` | Days elapsed in current month |

### Per state / district / dealer:
| Field | Description |
|---|---|
| `cur` | MTD despatch qty |
| `prev` | Previous month despatch qty |
| `ytd` | YTD despatch qty |
| `pendingQty` | Pre-computed pending (from PENDING_CUR) |
| `orderCur` | Current month orders |
| `orderPrev` | Previous month orders |
| `dailyAvgQty` | Historical daily avg for this entity |
| `currentDailyRate` | Current daily rate for this entity |
| `expectedMtd` | Expected MTD at historical pace |
| `lossDelta` | Rate delta (negative = behind) |
| `lossDeltaPct` | Rate delta as % |
| `lossFlag` | "BEHIND" / "AHEAD" / "NO_DATA" |

---

## PRIORITY ORDER FOR NEXT SESSION

1. **CHANGE A** — n8n Process All KPIs: replace calcPending with PENDING_CUR passthrough
2. **CHANGE B** — n8n Operational Context Formatter: add pace fields to AI context
3. **CHANGE C** — Frontend: Pending KPI card subtitle fix
4. **CHANGE E** — Frontend: Regional Map filter (Pending button + dynamic months)
5. **CHANGE F** — Frontend: Rajasthan missing fix
6. **CHANGE D** — Frontend: PACE vs AVG column on remaining tabs
7. **CHANGE G** — Frontend: Smart Insights enriched context
8. **CHANGE H** — Frontend: Remove PACE badges from Top Declining States
