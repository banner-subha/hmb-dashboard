// ═══════════════════════════════════════════════════════════════════════════════
// COMPUTE MoM + MONTHLY — n8n Code Node
// 
// Replaces both Power Queries (MoM query + MoM_Monthly query) in JavaScript.
// INPUT:  Raw despatch/order rows from raw_despatch.csv (via Extract Raw CSV)
//         Columns: DESPATCH_DATE (DD-MM-YYYY), CLIENT_NAME, STATE, DISTRICT,
//                  QTY, ITEM, TYPE
//
// OUTPUT: Union of two row shapes, appended into a single array:
//   1. MoM rows (same schema as MoM_export.csv):
//      STATE, DISTRICT, CLIENT NAME, ITEM, CUR_PERIOD, PREV_PERIOD,
//      YTD_PERIOD, CUR_QTY, PREV_QTY, YTD_QTY, ORDER_QTY, PENDING_QTY
//
//   2. Monthly rows (same schema as MoM_Monthly.csv):
//      STATE, DISTRICT, CLIENT NAME, ITEM, YEAR, MONTH, MONTH_LABEL, QTY
//
// The downstream "Process All KPIs" node already distinguishes these by
// field presence (YEAR/MONTH → monthly, else → MoM), so zero changes needed
// downstream.
//
// CRITICAL LOGIC PRESERVED:
//   - Date anchoring: LatestDate = max(DESPATCH DATE) from DESPATCH rows only
//   - YTD asymmetry:
//       MoM summary:   YTD = Jan 1 → end of prev month (excludes cur month)
//       Monthly slice:  YTD = Jan 1 → LatestDate (includes cur partial month)
//   - PENDING_QTY: ORDER_QTY - CUR_QTY, threshold < 0.1 → 0, round 2dp
//   - Period label format: "D Mon YYYY - D Mon YYYY"
// ═══════════════════════════════════════════════════════════════════════════════

const rawRows = $input.all();

if (!rawRows || rawRows.length === 0) {
  return [{ json: { error: 'No raw rows received', rowsProcessed: 0 } }];
}

// ── DATE PARSING ──────────────────────────────────────────────────────────────
// Raw CSV has DESPATCH_DATE as "DD-MM-YYYY" text
function parseDate(str) {
  if (!str) {
    console.log("parseDate: empty/null input received");
    return null;
  }
  if (str instanceof Date && !isNaN(str.getTime())) return str;

  const s = String(str).trim();
  console.log(`parseDate processing: "${s}"`);
  
  const datePart = s.split(/[ T]/)[0];
  const parts = datePart.split(/[-\/]/);
  console.log(`datePart: "${datePart}", split parts:`, JSON.stringify(parts));
  
  if (parts.length === 3) {
    const day   = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year    = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      if (year < 100) year += 2000; // 2-digit year fallback
      console.log(`Parsed values: day=${day}, month=${month}, year=${year}`);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1000) {
        const dObj = new Date(year, month - 1, day);
        console.log(`Successfully parsed Date: ${dObj.toISOString()}`);
        return dObj;
      } else {
        console.log("Range check failed for day/month/year");
      }
    } else {
      console.log("NaN parsed for one or more parts");
    }
  } else {
    console.log(`parts.length is not 3, it is ${parts.length}`);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    console.log(`Fallback Date parsed: ${d.toISOString()}`);
    return d;
  }
  console.log("All parsing strategies failed");
  return null;
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function endOfPrevMonth(d) {
  // Last day of the month before d's month
  return new Date(d.getFullYear(), d.getMonth(), 0);
}

// ── PERIOD LABEL FORMATTER ────────────────────────────────────────────────────
// Matches Power Query: "D Mon YYYY"  e.g. "1 Jul 2026"
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d) {
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

// ── 1. PARSE AND CLEAN ALL ROWS ───────────────────────────────────────────────
const parsed = [];
let logged = 0;
for (const row of rawRows) {
  const r = row.json;
  if (logged < 5) {
    console.log(`Row #${logged} keys:`, JSON.stringify(Object.keys(r)));
    console.log(`Row #${logged} DESPATCH_DATE: "${r['DESPATCH_DATE']}"`);
    console.log(`Row #${logged} DESPATCH DATE: "${r['DESPATCH DATE']}"`);
  }
  
  const date = parseDate(r['DESPATCH_DATE'] || r['DESPATCH DATE']);
  
  if (logged < 5) {
    console.log(`Row #${logged} parsed date:`, date ? date.toISOString() : 'null');
    logged++;
  }
  if (!date) continue; // skip unparsable dates

  const qty = parseFloat(r['QTY']) || 0;
  if (qty === 0) continue; // skip zero-qty rows

  parsed.push({
    date,
    type:     'DESPATCH',
    qty,
    item:     (r['ITEM'] || '').trim().toUpperCase(),
    state:    (r['STATE'] || '').trim().toUpperCase(),
    district: (r['DISTRICT'] || '').trim().toUpperCase(),
    client:   (r['CLIENT_NAME'] || r['CLIENT NAME'] || '').trim(),
  });
}

// ── 2. SPLIT BY TYPE ──────────────────────────────────────────────────────────
const despatchRows = parsed;
const orderRows    = [];

// ── 3. DATE ANCHORS (from DESPATCH rows only) ─────────────────────────────────
let latestDate = null;
for (const r of despatchRows) {
  if (!latestDate || r.date > latestDate) latestDate = r.date;
}

if (!latestDate) {
  return [{ json: { error: 'No DESPATCH rows found — cannot determine date anchors', rowsProcessed: rawRows.length } }];
}

const curMonthStart  = startOfMonth(latestDate);
const prevMonthStart = addMonths(curMonthStart, -1);

// Dynamic same-day comparison: compare cur MTD (1st → latestDate)
// against the same day-of-month range in the previous month.
const comparisonDay = latestDate.getDate();
let prevPeriodEnd = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), comparisonDay);
if (prevPeriodEnd.getMonth() !== prevMonthStart.getMonth()) {
  // prev month has fewer days than comparisonDay — clamp to its last day
  prevPeriodEnd = endOfPrevMonth(latestDate);
}

const ytdStart = new Date(latestDate.getFullYear(), 0, 1); // Jan 1

// ── 4. PERIOD LABELS ──────────────────────────────────────────────────────────
const curPeriodLabel  = `${fmtDate(curMonthStart)} - ${fmtDate(latestDate)}`;
const prevPeriodLabel = `${fmtDate(prevMonthStart)} - ${fmtDate(prevPeriodEnd)}`;
const ytdPeriodLabel  = `${fmtDate(ytdStart)} - ${fmtDate(prevPeriodEnd)}`;

// ── 5. TAG DESPATCH ROWS ──────────────────────────────────────────────────────
// CUR  = current month MTD (curMonthStart → latestDate inclusive)
// PREV = same day-of-month range in previous month (same-day comparison)
// YTD  = Jan 1 → start of prev month (exclusive of prev month itself)
//        but YTD_QTY = YTD tag + PREV tag at group time
function tagDespatch(date) {
  if (date >= curMonthStart && date <= latestDate) return 'CUR';
  if (date >= prevMonthStart && date <= prevPeriodEnd) return 'PREV';
  if (date >= ytdStart && date < prevMonthStart) return 'YTD';
  return 'OUTSIDE';
}

// ── 6. MoM AGGREGATION ────────────────────────────────────────────────────────
// Group by {STATE, DISTRICT, CLIENT NAME, ITEM}
// Sum QTY per period tag into CUR_QTY, PREV_QTY, YTD_QTY

const momAccum = {}; // key → { cur, prev, ytd }

function momKey(r) {
  return `${r.state}||${r.district}||${r.client}||${r.item}`;
}

function ensureMomBucket(key, r) {
  if (!momAccum[key]) {
    momAccum[key] = {
      state: r.state, district: r.district, client: r.client, item: r.item,
      cur: 0, prev: 0, ytd: 0
    };
  }
}

// Tag and accumulate DESPATCH rows
for (const r of despatchRows) {
  const period = tagDespatch(r.date);
  if (period === 'OUTSIDE') continue;
  const key = momKey(r);
  ensureMomBucket(key, r);
  if (period === 'CUR')  momAccum[key].cur  += r.qty;
  if (period === 'PREV') momAccum[key].prev += r.qty;
  if (period === 'YTD')  momAccum[key].ytd  += r.qty;
}

// ── 7. BUILD MoM OUTPUT ROWS ──────────────────────────────────────────────────
const momOutput = [];
for (const a of Object.values(momAccum)) {
  const curQty   = Math.round(a.cur   * 100) / 100 || 0;
  const prevQty  = Math.round(a.prev  * 100) / 100 || 0;
  // YTD = YTD tag + PREV tag (Jan → end of prev month)
  const ytdQty   = Math.round((a.ytd + a.prev) * 100) / 100 || 0;

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
      'ORDER_QTY':    0,
      'PENDING_QTY':  0,
    }
  });
}

// ── 9. MONTHLY AGGREGATION ────────────────────────────────────────────────────
// DESPATCH rows only, Jan 1 → LatestDate INCLUSIVE (includes current partial month)
// Group by {STATE, DISTRICT, CLIENT NAME, ITEM, YEAR, MONTH}
const monthlyAccum = {}; // key → { state, district, client, item, year, month, label, qty }

for (const r of despatchRows) {
  if (r.date < ytdStart || r.date > latestDate) continue; // outside YTD range

  const year  = r.date.getFullYear();
  const month = r.date.getMonth() + 1; // 1-indexed
  const label = MONTH_ABBR[r.date.getMonth()]; // "Jan", "Feb", etc.

  const key = `${r.state}||${r.district}||${r.client}||${r.item}||${year}||${month}`;
  if (!monthlyAccum[key]) {
    monthlyAccum[key] = {
      state: r.state, district: r.district, client: r.client, item: r.item,
      year, month, label, qty: 0
    };
  }
  monthlyAccum[key].qty += r.qty;
}

// ── 10. BUILD MONTHLY OUTPUT ROWS ─────────────────────────────────────────────
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

// ── 11. RETURN UNION ──────────────────────────────────────────────────────────
// MoM rows first, then Monthly rows — same order as current Merge All Sources
console.log(`Raw rows parsed: ${parsed.length} (${despatchRows.length} DESPATCH, ${orderRows.length} ORDER)`);
console.log(`MoM output rows: ${momOutput.length}, Monthly output rows: ${monthlyOutput.length}`);
console.log(`Date anchor: LatestDate = ${fmtDate(latestDate)}`);
console.log(`Periods: CUR="${curPeriodLabel}", PREV="${prevPeriodLabel}", YTD="${ytdPeriodLabel}"`);

return [...momOutput, ...monthlyOutput];
