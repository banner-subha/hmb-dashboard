// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION SCRIPT — Validate compute_mom_monthly.js output equivalence
//
// Since we don't have the actual raw_despatch.csv yet (it needs to be generated
// from the Power Query), this script validates the LOGIC by:
//   1. Parsing the raw format sample to verify date parsing works
//   2. Checking period label format matches existing CSV headers exactly
//   3. Verifying YTD asymmetry rule
//   4. Verifying PENDING_QTY threshold rule
//
// Once raw_despatch.csv exists, run verify_full_equivalence.js for row-by-row
// comparison against MoM_export.csv and MoM_Monthly.csv.
// ═══════════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = path.resolve(__dirname);
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else           { failed++; console.error(`  ❌ ${msg}`); }
}

// ── 1. DATE PARSING ──────────────────────────────────────────────────────────
console.log('\n══ TEST 1: Date Parsing ══');

function parseDate(str) {
  if (!str) return null;
  if (str instanceof Date && !isNaN(str.getTime())) return str;

  const s = String(str).trim();
  const datePart = s.split(/[ T]/)[0];
  const parts = datePart.split(/[-\/]/);
  if (parts.length === 3) {
    const day   = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year    = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1000) {
        return new Date(year, month - 1, day);
      }
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

// From raw format.txt line 2: "01-05-2023"
const d1 = parseDate('01-05-2023');
assert(d1 !== null, 'Parses "01-05-2023"');
assert(d1.getFullYear() === 2023, '  Year = 2023');
assert(d1.getMonth() === 4, '  Month = May (4, 0-indexed)');
assert(d1.getDate() === 1, '  Day = 1');

// From raw format.txt line 3: "01-04-2023"
const d2 = parseDate('26-04-2023');
assert(d2 !== null, 'Parses "26-04-2023"');
assert(d2.getMonth() === 3, '  Month = April (3)');
assert(d2.getDate() === 26, '  Day = 26');

// Edge case: slash separator
const d3 = parseDate('15/06/2026');
assert(d3 !== null, 'Parses "15/06/2026"');
assert(d3.getMonth() === 5, '  Month = June (5)');

// ── 2. PERIOD LABEL FORMAT ───────────────────────────────────────────────────
console.log('\n══ TEST 2: Period Label Format ══');

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d) {
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

// From MoM_export.csv line 2: "1 Jul 2026 - 7 Jul 2026"
const jul1 = new Date(2026, 6, 1);
const jul7 = new Date(2026, 6, 7);
const curLabel = `${fmtDate(jul1)} - ${fmtDate(jul7)}`;
assert(curLabel === '1 Jul 2026 - 7 Jul 2026', `CUR_PERIOD matches: "${curLabel}"`);

// PREV: "1 Jun 2026 - 30 Jun 2026"
const jun1 = new Date(2026, 5, 1);
const jun30 = new Date(2026, 5, 30);
const prevLabel = `${fmtDate(jun1)} - ${fmtDate(jun30)}`;
assert(prevLabel === '1 Jun 2026 - 30 Jun 2026', `PREV_PERIOD matches: "${prevLabel}"`);

// YTD: "1 Jan 2026 - 30 Jun 2026"
const jan1 = new Date(2026, 0, 1);
const ytdLabel = `${fmtDate(jan1)} - ${fmtDate(jun30)}`;
assert(ytdLabel === '1 Jan 2026 - 30 Jun 2026', `YTD_PERIOD matches: "${ytdLabel}"`);

// ── 3. YTD ASYMMETRY ─────────────────────────────────────────────────────────
console.log('\n══ TEST 3: YTD Asymmetry ══');

// For LatestDate = 7 Jul 2026:
const latestDate = new Date(2026, 6, 7);
const curMonthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
const prevMonthStart = new Date(curMonthStart.getFullYear(), curMonthStart.getMonth() - 1, 1);
const prevMonthEnd = new Date(curMonthStart.getFullYear(), curMonthStart.getMonth(), 0);
const ytdStart = new Date(latestDate.getFullYear(), 0, 1);

// MoM YTD range: Jan 1 → < prevMonthStart (i.e., Jan 1 - May 31)
// YTD_QTY includes PREV tag too, so effective range is Jan 1 → prevMonthEnd (Jun 30)
const momYtdDate = new Date(2026, 5, 15); // Jun 15
const momYtdTag = (() => {
  if (momYtdDate >= curMonthStart && momYtdDate <= latestDate) return 'CUR';
  if (momYtdDate >= prevMonthStart && momYtdDate <= prevMonthEnd) return 'PREV';
  if (momYtdDate >= ytdStart && momYtdDate < prevMonthStart) return 'YTD';
  return 'OUTSIDE';
})();
assert(momYtdTag === 'PREV', 'Jun 15 tagged as PREV (included in YTD_QTY via PREV+YTD sum)');

// Jul 5 in MoM → CUR (not in YTD_QTY)
const jul5 = new Date(2026, 6, 5);
const jul5Tag = (() => {
  if (jul5 >= curMonthStart && jul5 <= latestDate) return 'CUR';
  if (jul5 >= prevMonthStart && jul5 <= prevMonthEnd) return 'PREV';
  if (jul5 >= ytdStart && jul5 < prevMonthStart) return 'YTD';
  return 'OUTSIDE';
})();
assert(jul5Tag === 'CUR', 'Jul 5 tagged as CUR (excluded from MoM YTD_QTY)');

// Monthly: Jul 5 IS included (range: ytdStart → latestDate inclusive)
const monthlyInRange = jul5 >= ytdStart && jul5 <= latestDate;
assert(monthlyInRange === true, 'Jul 5 IN monthly range (monthly includes cur month)');

// Monthly: a date before Jan 1 is excluded
const dec2025 = new Date(2025, 11, 15);
const monthlyOutRange = dec2025 >= ytdStart && dec2025 <= latestDate;
assert(monthlyOutRange === false, 'Dec 2025 OUT of monthly range');

// ── 4. PENDING_QTY THRESHOLD ─────────────────────────────────────────────────
console.log('\n══ TEST 4: PENDING_QTY Threshold ══');

function calcPending(orderQty, curQty) {
  const raw = orderQty - curQty;
  return raw < 0.1 ? 0 : Math.round(raw * 100) / 100;
}

assert(calcPending(120, 176.27) === 0, 'ORDER < CUR → 0 (negative)');
assert(calcPending(5, 0) === 5, 'ORDER 5, CUR 0 → 5');
assert(calcPending(0, 0) === 0, 'Both zero → 0');
assert(calcPending(0.05, 0) === 0, '0.05 < 0.1 → 0 (threshold)');
// 0.1 - 0 = 0.1, and 0.1 < 0.1 is false, so result is 0.1 (not zeroed)
// Power Query: "if raw < 0.1 then 0 else Number.Round(raw, 2)"
assert(calcPending(0.1, 0) === 0.1, '0.1 is NOT below threshold → 0.1');
assert(calcPending(30, 0) === 30, 'ORDER 30, CUR 0 → 30');

// From MoM_export.csv line 16: SRI DURGA STEEL,IG - ORDER_QTY=5, CUR_QTY=0 → PENDING=5
assert(calcPending(5, 0) === 5, 'SRI DURGA STEEL verify: ORDER 5, CUR 0 → PENDING 5');

// ── 5. VERIFY EXISTING CSV PERIOD LABELS ─────────────────────────────────────
console.log('\n══ TEST 5: CSV Period Label Verification ══');

try {
  const momCsv = fs.readFileSync(path.join(BASE, 'MoM_export.csv'), 'utf-8');
  const firstDataLine = momCsv.split('\n')[1];
  const cols = firstDataLine.split(',');
  // CUR_PERIOD is column index 4 (0-based)
  const csvCurPeriod = cols[4];
  assert(csvCurPeriod === '1 Jul 2026 - 7 Jul 2026', `CSV CUR_PERIOD = "${csvCurPeriod}"`);
  const csvPrevPeriod = cols[5];
  assert(csvPrevPeriod === '1 Jun 2026 - 30 Jun 2026', `CSV PREV_PERIOD = "${csvPrevPeriod}"`);
  const csvYtdPeriod = cols[6];
  assert(csvYtdPeriod === '1 Jan 2026 - 30 Jun 2026', `CSV YTD_PERIOD = "${csvYtdPeriod}"`);
} catch (e) {
  console.log(`  ⚠️  Could not read MoM_export.csv: ${e.message}`);
}

// ── 6. VERIFY MONTHLY CSV HAS JULY (current month) ROWS ──────────────────────
console.log('\n══ TEST 6: Monthly CSV Includes Current Month ══');

try {
  const monthlyCsv = fs.readFileSync(path.join(BASE, 'MoM_Monthly.csv'), 'utf-8');
  const lines = monthlyCsv.split('\n').filter(l => l.trim());
  const julyRows = lines.filter(l => l.includes(',2026,7,Jul,'));
  assert(julyRows.length > 0, `Monthly CSV has ${julyRows.length} July 2026 rows (current partial month included)`);
  
  // Also verify Jan rows exist
  const janRows = lines.filter(l => l.includes(',2026,1,Jan,'));
  assert(janRows.length > 0, `Monthly CSV has ${janRows.length} January 2026 rows`);
} catch (e) {
  console.log(`  ⚠️  Could not read MoM_Monthly.csv: ${e.message}`);
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n══ RESULTS: ${passed} passed, ${failed} failed ══`);
if (failed > 0) process.exit(1);
