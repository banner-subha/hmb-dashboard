# n8n Backend Update & Frontend Schema Specification

This document contains two parts:
1. **The Surgical Prompt for Claude** to apply the n8n workflow changes.
2. **The Frontend Data Schema Reference Map** documenting all output fields exported in `latest.json`.

---

# Part 1: Surgical Prompt for n8n Workflow Changes

Copy and paste the prompt below to execute the n8n workspace changes:

```markdown
You are an expert n8n workflow architect. Your task is to update the n8n workflow JSON file (`HMB Ispat — AI Intelligence Layer v26 (1).json`) surgically to simplify the pipeline. We are replacing two pre-aggregated exports (`MoM_export.csv` and `MoM_Monthly.csv`) with a single pre-aggregated daily raw export (`raw_despatch.csv`) and running the aggregation logic inside a new n8n Code node.

### 1. Workflow Pipeline Changes (Nodes to Delete, Rename, and Add)

Please modify the nodes in the JSON file as follows:

*   **Modify/Rename "Fetch Despatch CSV"**:
    *   Rename node `name` to: `"Fetch Raw CSV"`
    *   Update parameter `path` to: `"/OFFICE HO/BI DATA/SALES DASHBOARD/raw_despatch.csv"`
*   **Rename "Extract from File"**:
    *   Rename node `name` to: `"Extract Raw CSV"`
*   **Delete Nodes**:
    *   Remove `"Fetch Monthly CSV"` (and its credentials ref)
    *   Remove `"Extract Monthly CSV"`
    *   Remove `"Merge All Sources"`
*   **Add Node: "Compute MoM + Monthly"**:
    *   Type: `n8n-nodes-base.code`
    *   Type Version: `2`
    *   Position: Add it immediately after `"Extract Raw CSV"`
    *   Paste the JavaScript code below into its `jsCode` parameter:

```javascript
// ── COMPUTE MoM + MONTHLY CODE NODE ──
const rawRows = $input.all();
if (!rawRows || rawRows.length === 0) {
  return [{ json: { error: 'No raw rows received', rowsProcessed: 0 } }];
}

function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) {
    const day   = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year  = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function endOfPrevMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 0); }

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d) { return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`; }

const parsed = [];
for (const row of rawRows) {
  const r = row.json;
  const date = parseDate(r['DESPATCH_DATE'] || r['DESPATCH DATE']);
  if (!date) continue;
  const type = (r['TYPE'] || 'DESPATCH').trim().toUpperCase();
  if (type !== 'DESPATCH' && type !== 'ORDER') continue;
  const qty = parseFloat(r['QTY']) || 0;
  if (qty === 0) continue;
  parsed.push({
    date, type, qty,
    item:     (r['ITEM'] || '').trim().toUpperCase(),
    state:    (r['STATE'] || '').trim().toUpperCase(),
    district: (r['DISTRICT'] || '').trim().toUpperCase(),
    client:   (r['CLIENT_NAME'] || r['CLIENT NAME'] || '').trim(),
  });
}

const despatchRows = parsed.filter(r => r.type === 'DESPATCH');
const orderRows    = parsed.filter(r => r.type === 'ORDER');

let latestDate = null;
for (const r of despatchRows) {
  if (!latestDate || r.date > latestDate) latestDate = r.date;
}
if (!latestDate) {
  return [{ json: { error: 'No DESPATCH rows found', rowsProcessed: rawRows.length } }];
}

const curMonthStart  = startOfMonth(latestDate);
const prevMonthStart = addMonths(curMonthStart, -1);
const prevMonthEnd   = endOfPrevMonth(latestDate);
const ytdStart       = new Date(latestDate.getFullYear(), 0, 1);

const curPeriodLabel  = `${fmtDate(curMonthStart)} - ${fmtDate(latestDate)}`;
const prevPeriodLabel = `${fmtDate(prevMonthStart)} - ${fmtDate(prevMonthEnd)}`;
const ytdPeriodLabel  = `${fmtDate(ytdStart)} - ${fmtDate(prevMonthEnd)}`;

function tagDespatch(date) {
  if (date >= curMonthStart && date <= latestDate) return 'CUR';
  if (date >= prevMonthStart && date <= prevMonthEnd) return 'PREV';
  if (date >= ytdStart && date < prevMonthStart) return 'YTD';
  return 'OUTSIDE';
}

function tagOrder(date) {
  if (date >= curMonthStart && date <= latestDate) return 'ORDER_CUR';
  return 'OUTSIDE';
}

const momAccum = {};
function momKey(r) { return `${r.state}||${r.district}||${r.client}||${r.item}`; }
function ensureMomBucket(key, r) {
  if (!momAccum[key]) {
    momAccum[key] = { state: r.state, district: r.district, client: r.client, item: r.item, cur: 0, prev: 0, ytd: 0, order: 0 };
  }
}

for (const r of despatchRows) {
  const period = tagDespatch(r.date);
  if (period === 'OUTSIDE') continue;
  const key = momKey(r);
  ensureMomBucket(key, r);
  if (period === 'CUR')  momAccum[key].cur  += r.qty;
  if (period === 'PREV') momAccum[key].prev += r.qty;
  if (period === 'YTD')  momAccum[key].ytd  += r.qty;
}

for (const r of orderRows) {
  const period = tagOrder(r.date);
  if (period === 'OUTSIDE') continue;
  const key = momKey(r);
  ensureMomBucket(key, r);
  momAccum[key].order += r.qty;
}

const momOutput = [];
for (const a of Object.values(momAccum)) {
  const curQty   = Math.round(a.cur   * 100) / 100 || 0;
  const prevQty  = Math.round(a.prev  * 100) / 100 || 0;
  const ytdQty   = Math.round((a.ytd + a.prev) * 100) / 100 || 0;
  const orderQty = Math.round(a.order * 100) / 100 || 0;
  const rawPending = orderQty - curQty;
  const pendingQty = rawPending < 0.1 ? 0 : Math.round(rawPending * 100) / 100;

  momOutput.push({
    json: {
      'STATE':        a.state,
      'DISTRICT':     a.district,
      'CLIENT NAME':  a.client,
      'ITEM':         a.item,
      'CUR_PERIOD':   curPeriodLabel,
      'PREV_PERIOD':  prevPeriodLabel,
      'YTD_PERIOD':   ytdPeriodLabel,
      'CUR_QTY':      curQty,
      'PREV_QTY':     prevQty,
      'YTD_QTY':      ytdQty,
      'ORDER_QTY':    orderQty,
      'PENDING_QTY':  pendingQty,
    }
  });
}

const monthlyAccum = {};
for (const r of despatchRows) {
  if (r.date < ytdStart || r.date > latestDate) continue;
  const year  = r.date.getFullYear();
  const month = r.date.getMonth() + 1;
  const label = MONTH_ABBR[r.date.getMonth()];
  const key = `${r.state}||${r.district}||${r.client}||${r.item}||${year}||${month}`;
  if (!monthlyAccum[key]) {
    monthlyAccum[key] = { state: r.state, district: r.district, client: r.client, item: r.item, year, month, label, qty: 0 };
  }
  monthlyAccum[key].qty += r.qty;
}

const monthlyOutput = [];
for (const a of Object.values(monthlyAccum)) {
  const qty = Math.round(a.qty * 100) / 100 || 0;
  monthlyOutput.push({
    json: {
      'STATE':        a.state,
      'DISTRICT':     a.district,
      'CLIENT NAME':  a.client,
      'ITEM':         a.item,
      'YEAR':         a.year,
      'MONTH':        a.month,
      'MONTH_LABEL':  a.label,
      'QTY':          qty,
    }
  });
}

return [...momOutput, ...monthlyOutput];
```

### 2. Connection Topology Changes (Rewiring)

Update the `"connections"` block in the JSON to match this topology exactly:

1.  **Daily 2PM Trigger** main output 0 connects to:
    *   `"Fetch Raw CSV"` (index 0)
    *   `"Fetch Pending CSV"` (index 0)
    *   *(Note: connection to "Fetch Monthly CSV" is deleted)*
2.  **Fetch Raw CSV** main output 0 connects to:
    *   `"Extract Raw CSV"` (index 0)
3.  **Extract Raw CSV** main output 0 connects to:
    *   `"Compute MoM + Monthly"` (index 0)
4.  **Compute MoM + Monthly** main output 0 connects to:
    *   `"Merge Despatch + Pending"` (index 0)
5.  **Merge Despatch + Pending** main output 0 connects to:
    *   `"Process All KPIs"` (index 0)
    *   *(Note: "Merge All Sources" node is removed entirely, so we bypass it and go straight into "Process All KPIs")*
```

---

# Part 2: Frontend Data Schema Reference Map

This map describes how the aggregated outputs of `Compute MoM + Monthly` are processed by `Process All KPIs` and exposed to the frontend in `latest.json`:

```json
{
  "meta": {
    "curPeriod": "string (e.g. '1 Jul 2026 - 7 Jul 2026')",
    "prevPeriod": "string (e.g. '1 Jun 2026 - 30 Jun 2026')",
    "ytdPeriod": "string (e.g. '1 Jan 2026 - 30 Jun 2026')",
    "curElapsedDays": "number (days elapsed in current partial month)",
    "ytdTotalDays": "number (total days in Jan 1 -> end of previous month window)"
  },
  "totalCur": "number (sum of CUR_QTY across all records)",
  "totalPrev": "number (sum of PREV_QTY across all records)",
  "totalYtd": "number (sum of YTD_QTY across all records)",
  "totalMoM": "number (MoM percentage change of despatch totals)",
  
  "regionalMapData": [
    {
      "state": "string (e.g. 'WEST BENGAL')",
      "district": "string (e.g. 'NADIA')",
      "cur": "number (MTD despatch qty)",
      "prev": "number (previous month despatch qty)",
      "ytd": "number (YTD despatch qty)",
      "monthlyDespatch": {
        "6": "number (June Despatch Qty)",
        "7": "number (July Despatch Qty)"
      },
      "currentPending": "number (running pending balance for this district)"
    }
  ],

  "monthlyHistory": {
    "YYYY-MM": {
      "periodKey": "string (e.g. '2026-07')",
      "year": "number",
      "month": "number",
      "label": "string (e.g. 'July 2026')",
      "total": "number (total despatch qty for this month)",
      "states": [
        {
          "state": "string",
          "qty": "number (despatch sum for this month)",
          "share": "number (percent share of total month)"
        }
      ],
      "districts": [
        {
          "state": "string",
          "district": "string",
          "qty": "number (despatch sum for this month)",
          "share": "number (percent share of total month)"
        }
      ],
      "dealers": [
        {
          "state": "string",
          "district": "string",
          "client": "string",
          "qty": "number (despatch sum for this month)"
        }
      ]
    }
  },

  "availableMonths": [
    {
      "periodKey": "string (e.g. '2026-07')",
      "year": "number",
      "month": "number",
      "label": "string (e.g. 'July 2026')"
    }
  ]
}
```

### Key Mapping Verifications:
*   **Regional Map**: The frontend choropleth map and regional filter will consume from `regionalMapData` and `monthlyHistory`. `monthlyHistory` contains full records of month-by-month slices including the current partial month.
*   **Months Dropdown**: The frontend month selector consumes from `availableMonths` (which is sorted descending from newest to oldest) and maps to keys in `monthlyHistory`.
*   **Pending Quantity**: `pendingAvailableMonths` and historical pending records are extracted strictly from the date labels of the untouched `pending_export.csv` pipeline, so there is zero overlap or disruption to pending order data.
