const districtToState = {};
// ═══════════════════════════════════════════════════════════════════════════════
// HMB ISPAT — SALES MONITORING ENGINE v23
// INPUT (appended, not joined, by the "Merge Despatch + Pending" node):
//   MoM rows (MoM_export.csv via Power Query):
//     STATE, DISTRICT, CLIENT NAME, ITEM,
//     CUR_QTY, PREV_QTY, YTD_QTY, ORDER_QTY, PENDING_QTY (ignored — superseded
//       by ACTUAL PENDING from pending_export.csv, see v23 notes below),
//     CUR_PERIOD, PREV_PERIOD, YTD_PERIOD
//   Pending rows (pending_export.csv):
//     DATE, ORDER NO., CLIENT, DISTRICTS, STATE, ORDER QTY, DESPATCH QTY, ACTUAL PENDING, ITEM
//
// Rows are distinguished post-append by presence of `ACTUAL PENDING` (pending
// rows) vs absence (MoM rows). Each side is then keyed on a NORMALIZED
// STATE||DISTRICT||CLIENT||ITEM tuple so the two CSVs' differing column names
// (DISTRICT vs DISTRICTS, CLIENT NAME vs CLIENT) line up correctly.
//
// v23 CHANGES:
//   - FIX: MoM-side client extraction now falls back CLIENT NAME -> CLIENT,
//     matching the pending-side fallback. Previously a blank/missing
//     CLIENT NAME on the MoM side silently collapsed every such row into a
//     single dealer bucket (root cause of "Active Dealers: 1").
//   - FIX: PENDING_QTY from MoM rows is explicitly ignored; ACTUAL PENDING
//     from pending_export.csv is the single source of truth for pending qty,
//     applied at dealer/district/state/product/overall levels exactly as
//     before, but now also keyed with normalized item/client.
//   - Added per-row defensive guards + diagnostics so a bad/blank dealer key
//     is logged instead of silently merging into "Unknown" buckets.
// ═══════════════════════════════════════════════════════════════════════════════

const rawRows = $input.all();

if (!rawRows || rawRows.length === 0) {
  return [{ json: { error: 'No input rows received', rowsProcessed: 0 } }];
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function normalizeDistrictName(name) {
  if (!name) return '';
  return String(name).toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

function districtKey(name) {
  if (!name) return '';
  return String(name).toLowerCase().replace(/\s+/g, '').replace(/[^a-z]/g, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// ── WB DISTRICT CANONICAL ─────────────────────────────────────────────────────
const WB_CANONICAL = {
  'alipurduar': 'Alipurduar', 'bankura': 'Bankura', 'birbhum': 'Birbhum',
  'cooch behar': 'Cooch Behar', 'coochbehar': 'Cooch Behar',
  'dakshin dinajpur': 'Dakshin Dinajpur', 'south dinajpur': 'Dakshin Dinajpur', 'dinajpur dakshin': 'Dakshin Dinajpur',
  'darjeeling': 'Darjeeling', 'hooghly': 'Hooghly', 'hugli': 'Hooghly',
  'howrah': 'Howrah', 'haorah': 'Howrah',
  'jalpaiguri': 'Jalpaiguri', 'jhargram': 'Jhargram', 'kalimpong': 'Kalimpong',
  'kolkata': 'Kolkata', 'calcutta': 'Kolkata',
  'maldah': 'Maldah', 'malda': 'Maldah',
  'medinipur east': 'Medinipur East', 'east bardhaman': 'Purba Bardhaman',
  'east medinipur': 'Medinipur East', 'purba medinipur': 'Medinipur East',
  'east midnapore': 'Medinipur East', 'midnapur east': 'Medinipur East',
  'medinipur west': 'Medinipur West', 'west medinipur': 'Medinipur West',
  'paschim medinipur': 'Medinipur West', 'west midnapore': 'Medinipur West',
  'midnapur': 'Medinipur West', 'murshidabad': 'Murshidabad',
  'nadia': 'Nadia', 'nadiya': 'Nadia',
  'north 24 parganas': 'North 24 Parganas', '24 parganas north': 'North 24 Parganas',
  '24 paraganas north': 'North 24 Parganas', 'n 24 parganas': 'North 24 Parganas',
  'paschim bardhaman': 'Paschim Bardhaman', 'west bardhaman': 'Paschim Bardhaman',
  'purba bardhaman': 'Purba Bardhaman', 'bardhaman east': 'Purba Bardhaman',
  'east burdwan': 'Purba Bardhaman', 'bardhaman': 'Purba Bardhaman',
  'purulia': 'Purulia',
  'south 24 parganas': 'South 24 Parganas', '24 parganas south': 'South 24 Parganas',
  '24 paraganas south': 'South 24 Parganas', 's 24 parganas': 'South 24 Parganas',
  'uttar dinajpur': 'Uttar Dinajpur', 'north dinajpur': 'Uttar Dinajpur', 'dinajpur uttar': 'Uttar Dinajpur',
};

const STATE_CANONICAL = {
  'west bengal': 'West Bengal', 'wb': 'West Bengal', 'westbengal': 'West Bengal',
  'jharkhand': 'Jharkhand', 'odisha': 'Orissa', 'assam': 'Assam', 'bihar': 'Bihar',
  'tripura': 'Tripura', 'rajasthan': 'Rajasthan',
  'uttar pradesh': 'Uttar Pradesh', 'uttarpradesh': 'Uttar Pradesh', 'up': 'Uttar Pradesh',
  'arunachal pradesh': 'Arunachal Pradesh', 'manipur': 'Manipur', 'chhattisgarh': 'Chhattisgarh',
};

const STATE_SLUG = {
  'West Bengal': 'westbengal', 'Jharkhand': 'jharkhand', 'Odisha': 'orrisa',
  'Assam': 'assam', 'Bihar': 'bihar', 'Tripura': 'tripura',
  'Rajasthan': 'rajasthan', 'Uttar Pradesh': 'uttarpradesh', 'Arunachal Pradesh': 'arunachalpradesh',
  'Manipur': 'manipur', 'Chhattisgarh': 'chhattisgarh',
};

const NON_WB_ALIASES = {
  'bhubneswar': 'Bhubaneswar', 'bhubaneswar': 'Bhubaneswar',
  'cuttuck': 'Cuttack', 'cuttack': 'Cuttack',
  'rourkela': 'Sundergarh', 'sundargarh': 'Sundergarh', 'sundergarh': 'Sundergarh',
  'jamshedpur': 'East Singhbhum', 'east singhbhum': 'East Singhbhum',
  'bokaro': 'Bokaro', 'dhanbad': 'Dhanbad', 'ranchi': 'Ranchi',
  'varanasi': 'Varanasi', 'allahabad': 'Prayagraj', 'prayagraj': 'Prayagraj',
  'junjhunu': 'Jhunjhunu',
  // ── Rajasthan — strip " District" suffix that appears in raw CSV ──
  'churu district': 'Churu', 'churu': 'Churu',
  'jaipur district': 'Jaipur', 'jaipur': 'Jaipur',
  'jodhpur district': 'Jodhpur', 'jodhpur': 'Jodhpur',
  'udaipur district': 'Udaipur', 'udaipur': 'Udaipur',
  'bikaner district': 'Bikaner', 'bikaner': 'Bikaner',
  'kota district': 'Kota', 'kota': 'Kota',
  'alwar district': 'Alwar', 'alwar': 'Alwar',
  'ajmer district': 'Ajmer', 'ajmer': 'Ajmer',
  'sikar district': 'Sikar', 'sikar': 'Sikar',
  'nagaur district': 'Nagaur', 'nagaur': 'Nagaur',
};

function normState(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function resolveState(raw) {
  if (!raw) return 'Unknown';
  return STATE_CANONICAL[normState(raw)] || String(raw).trim();
}

function resolveDistrict(rawName, canonicalState) {
  if (!rawName) return 'Unknown';
  // Strip trailing " district" / " District" suffix (e.g. "CHURU DISTRICT" → "CHURU")
  const stripped = String(rawName).trim().replace(/\s+district\s*$/i, '').trim();
  if (canonicalState === 'West Bengal') {
    const key = normalizeDistrictName(stripped);
    if (WB_CANONICAL[key]) return WB_CANONICAL[key];
    return stripped.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  const key = normState(stripped);
  if (NON_WB_ALIASES[key]) return NON_WB_ALIASES[key];
  if (/^[A-Z]+$/.test(stripped)) return stripped;
  return stripped.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── PRODUCT CATALOGUE ─────────────────────────────────────────────────────────
const PRODUCT_LABELS = {
  IG:'IG (Iron Gate)', GI:'GI (Galvanised Iron)', IGG:'IGG (Iron Gate - Heavy)',
  HGI:'HGI (Heavy GI)', P:'P (Pipe)', RS:'RS (Roofing Sheet)', SS:'SS (Stainless Steel)'
};
const ALL_PRODUCTS = Object.keys(PRODUCT_LABELS);
const PRODUCT_SET  = new Set(ALL_PRODUCTS);

// ── SPLIT ROWS: MoM DESPATCH vs PENDING ───────────────────────────────────────
const momRows     = [];
const pendingRows = [];
const monthlyRows = [];

for (const row of rawRows) {
  const r = row.json;
  if (r['ACTUAL PENDING'] !== undefined) {
    pendingRows.push(r);
  } else if (r['YEAR'] !== undefined && r['MONTH'] !== undefined) {
    monthlyRows.push(r);
  } else {
    momRows.push(r);
  }
}

console.log(`MoM rows: ${momRows.length}, Pending rows: ${pendingRows.length}, Monthly rows: ${monthlyRows.length}`);

// ── PERIOD LABELS — read from first MoM row ───────────────────────────────────
const firstMoM  = momRows[0] || {};
const curLabel  = String(firstMoM['CUR_PERIOD']  || '').trim();
const prevLabel = String(firstMoM['PREV_PERIOD'] || '').trim();
const ytdLabel  = String(firstMoM['YTD_PERIOD']  || '').trim();

// Derive month numbers from period labels for pace + regionalMapData
// e.g. "1 Jun 2026 - 26 Jun 2026" → 6
const MONTH_ABBR = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function extractMonthNum(periodStr) {
  if (!periodStr) return 0;
  const parts = periodStr.toLowerCase().split(/[\s\-]+/);
  for (const part of parts) {
    const idx = MONTH_ABBR.indexOf(part.trim());
    if (idx !== -1) return idx + 1;
  }
  return 0;
}

const curMonth  = extractMonthNum(curLabel) || (new Date().getMonth() + 1);
const prevMonth = extractMonthNum(prevLabel) || (curMonth === 1 ? 12 : curMonth - 1);
const now       = new Date();
const currentYear    = now.getFullYear();

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseElapsedDays(periodStr, dataMonth, dataYear) {
  if (periodStr) {
    const parts = periodStr.split(/\s*(?:[-–—]|to)\s*/);
    if (parts.length >= 2) {
      const startMatch = parts[0].match(/^(\d{1,2})/);
      const endMatch = parts[parts.length - 1].match(/^(\d{1,2})/);
      if (startMatch && endMatch) {
        return Math.max(1, parseInt(endMatch[1], 10) - parseInt(startMatch[1], 10) + 1);
      }
    }
  }

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  if (dataYear < todayYear || (dataYear === todayYear && dataMonth < todayMonth)) {
    return getDaysInMonth(dataYear, dataMonth);
  }
  if (dataYear === todayYear && dataMonth === todayMonth) {
    return today.getDate();
  }
  return getDaysInMonth(dataYear, dataMonth);
}

const curElapsedDays = parseElapsedDays(curLabel, curMonth, currentYear);

// YTD: Jan 1 to end of prev month
const ytdStartDate = new Date(currentYear, 0, 1);
const ytdEndDate   = prevMonth > 0 ? new Date(currentYear, prevMonth, 0) : ytdStartDate;
const ytdTotalDays = prevMonth > 0 ? Math.round((ytdEndDate - ytdStartDate) / 86400000) + 1 : 0;

console.log(`CUR month=${curMonth}, PREV=${prevMonth}, ytdDays=${ytdTotalDays}, curElapsed=${curElapsedDays}`);
console.log(`Periods: CUR="${curLabel}", PREV="${prevLabel}", YTD="${ytdLabel}"`);

// ── BUILD PENDING LOOKUPS ──────────────────────────────────────────────────────
const pendingByDealer   = {};
const pendingByDistrict = {};
const pendingByState    = {};
const pendingByProduct  = {};
const pendingHistoryByState = {};
const pendingHistoryByDistrict = {};
const pendingMonthsSet = new Set();
let   pendingOverall    = 0;

for (const r of pendingRows) {
  const pending = parseFloat(r['ACTUAL PENDING']) || 0;
  if (pending === 0) continue;

  const state    = resolveState((r['STATE'] || '').trim());
  const district = resolveDistrict((r['DISTRICTS'] || r['DISTRICT'] || '').trim(), state);
  if (state !== 'Unknown' && district !== 'Unknown') {
    districtToState[district.toLowerCase()] = state;
  }
  if (state !== 'Unknown' && district !== 'Unknown') {
    districtToState[district.toLowerCase()] = state;
  }
  const client   = (r['CLIENT'] || r['CLIENT NAME'] || '').trim();
  const rawItem  = (r['ITEM'] || '').trim().toUpperCase();
  const product  = PRODUCT_SET.has(rawItem) ? rawItem : 'GI';

  const dlKey    = `${state}||${district}||${client}`;
  const distKey2 = `${state}||${district}`;

  pendingByDealer[dlKey]      = (pendingByDealer[dlKey]      || 0) + pending;
  pendingByDistrict[distKey2] = (pendingByDistrict[distKey2] || 0) + pending;
  pendingByState[state]       = (pendingByState[state]       || 0) + pending;
  pendingByProduct[product]   = (pendingByProduct[product]   || 0) + pending;
  pendingOverall             += pending;

  // Monthly pending tracking
  const year  = parseInt(r['YEAR'] || r['Year'] || r['year'],  10) || 0;
  const month = parseInt(r['MONTH'] || r['Month'] || r['month'], 10) || 0;
  if (year && month) {
    const periodKey = `${year}-${pad2(month)}`;
    pendingMonthsSet.add(periodKey);
    
    if (!pendingHistoryByState[state]) pendingHistoryByState[state] = {};
    pendingHistoryByState[state][periodKey] = (pendingHistoryByState[state][periodKey] || 0) + pending;

    if (!pendingHistoryByDistrict[distKey2]) pendingHistoryByDistrict[distKey2] = {};
    pendingHistoryByDistrict[distKey2][periodKey] = (pendingHistoryByDistrict[distKey2][periodKey] || 0) + pending;
  }
}

console.log(`Pending overall: ${pendingOverall.toFixed(2)} MT across ${pendingRows.length} rows`);

// ── ACCUMULATORS ──────────────────────────────────────────────────────────────
const mkA = () => ({ c: 0, p: 0, ytd: 0, pending: 0 });
const overall    = mkA();
const byProduct  = {};
const byState    = {};
const byDistrict = {};
const byDealer   = {};
let   blankClientRows = 0;

for (const r of momRows) {
  const curQty  = parseFloat(r['CUR_QTY'])  || 0;
  const prevQty = parseFloat(r['PREV_QTY']) || 0;
  const ytdQty  = parseFloat(r['YTD_QTY'])  || 0;

  const rawItem  = (r['ITEM'] || '').trim().toUpperCase();
  const product  = PRODUCT_SET.has(rawItem) ? rawItem : 'GI';
  const state    = resolveState((r['STATE'] || '').trim());
  const district = resolveDistrict((r['DISTRICT'] || '').trim(), state);
  if (state !== 'Unknown' && district !== 'Unknown') {
    districtToState[district.toLowerCase()] = state;
  }
  if (state !== 'Unknown' && district !== 'Unknown') {
    districtToState[district.toLowerCase()] = state;
  }
  const client   = (r['CLIENT NAME'] || r['CLIENT'] || '').trim();
  if (!client) blankClientRows++;
  const geoSlug  = STATE_SLUG[state] || null;

  // Overall
  overall.c   += curQty;
  overall.p   += prevQty;
  overall.ytd += ytdQty;

  // Product
  if (!byProduct[product]) byProduct[product] = mkA();
  byProduct[product].c   += curQty;
  byProduct[product].p   += prevQty;
  byProduct[product].ytd += ytdQty;

  // State
  if (!byState[state]) { byState[state] = mkA(); byState[state].pr = {}; byState[state].geoSlug = geoSlug; }
  byState[state].c   += curQty;
  byState[state].p   += prevQty;
  byState[state].ytd += ytdQty;
  if (!byState[state].pr[product]) byState[state].pr[product] = mkA();
  byState[state].pr[product].c   += curQty;
  byState[state].pr[product].p   += prevQty;
  byState[state].pr[product].ytd += ytdQty;

  // District
  const dKey = `${state}||${district}`;
  if (!byDistrict[dKey]) { byDistrict[dKey] = mkA(); byDistrict[dKey].state = state; byDistrict[dKey].district = district; byDistrict[dKey].geoSlug = geoSlug; byDistrict[dKey].pr = {}; }
  byDistrict[dKey].c   += curQty;
  byDistrict[dKey].p   += prevQty;
  byDistrict[dKey].ytd += ytdQty;
  if (!byDistrict[dKey].pr[product]) byDistrict[dKey].pr[product] = mkA();
  byDistrict[dKey].pr[product].c   += curQty;
  byDistrict[dKey].pr[product].p   += prevQty;
  byDistrict[dKey].pr[product].ytd += ytdQty;

  // Dealer
  const dlKey2 = `${state}||${district}||${client}`;
  if (!byDealer[dlKey2]) { byDealer[dlKey2] = mkA(); byDealer[dlKey2].state = state; byDealer[dlKey2].district = district; byDealer[dlKey2].client = client; byDealer[dlKey2].geoSlug = geoSlug; byDealer[dlKey2].pr = {}; }
  byDealer[dlKey2].c   += curQty;
  byDealer[dlKey2].p   += prevQty;
  byDealer[dlKey2].ytd += ytdQty;
  if (!byDealer[dlKey2].pr[product]) byDealer[dlKey2].pr[product] = mkA();
  byDealer[dlKey2].pr[product].c   += curQty;
  byDealer[dlKey2].pr[product].p   += prevQty;
  byDealer[dlKey2].pr[product].ytd += ytdQty;
}

console.log(`States: ${Object.keys(byState).length}, Districts: ${Object.keys(byDistrict).length}, Dealers: ${Object.keys(byDealer).length}`);
if (blankClientRows > 0) console.log(`⚠️ WARNING: ${blankClientRows} MoM row(s) had no CLIENT NAME/CLIENT — these collapsed into a single "Unknown" dealer bucket per state/district. Check source CSV for blank dealer names.`);
console.log(`Overall — CUR: ${overall.c.toFixed(2)}, PREV: ${overall.p.toFixed(2)}, YTD: ${overall.ytd.toFixed(2)}`);

// ── APPLY PENDING ─────────────────────────────────────────────────────────────
// IMPORTANT: pending-only entities (states/districts/dealers/products with pending
// orders but zero despatch in cur+prev) must still be created here, not skipped.
// Skipping them was the root cause of the KPI-vs-RegionalMap total mismatch.
overall.pending = pendingOverall;

for (const [state, val] of Object.entries(pendingByState)) {
  if (!byState[state]) {
    byState[state] = mkA();
    byState[state].pr = {};
    byState[state].geoSlug = STATE_SLUG[state] || null;
  }
  byState[state].pending = val;
}

for (const [key, val] of Object.entries(pendingByDistrict)) {
  if (!byDistrict[key]) {
    const [state, district] = key.split('||');
    byDistrict[key] = mkA();
    byDistrict[key].state    = state;
    byDistrict[key].district = district;
    byDistrict[key].geoSlug  = STATE_SLUG[state] || null;
    byDistrict[key].pr = {};
  }
  byDistrict[key].pending = val;
}

for (const [key, val] of Object.entries(pendingByDealer)) {
  if (!byDealer[key]) {
    const [state, district, client] = key.split('||');
    byDealer[key] = mkA();
    byDealer[key].state    = state;
    byDealer[key].district = district;
    byDealer[key].client   = client;
    byDealer[key].geoSlug  = STATE_SLUG[state] || null;
    byDealer[key].pr = {};
  }
  byDealer[key].pending = val;
}

for (const [prod, val] of Object.entries(pendingByProduct)) {
  if (!byProduct[prod]) {
    byProduct[prod] = mkA();
  }
  byProduct[prod].pending = val;
}

// ── PACE ──────────────────────────────────────────────────────────────────────
function computePace(ytdQty, curQty) {
  const dailyAvgQty      = ytdTotalDays   > 0 ? Math.round((ytdQty / ytdTotalDays) * 100) / 100 : 0;
  const currentDailyRate = curElapsedDays > 0 ? Math.round((curQty / curElapsedDays) * 100) / 100 : 0;
  const expectedMtd      = Math.round(dailyAvgQty * curElapsedDays * 100) / 100;
  const lossDelta        = Math.round((currentDailyRate - dailyAvgQty) * 100) / 100;

  // Skip meaningful pace when fewer than 5 days of data — too early to compare
  if (curElapsedDays < 5) {
    return { dailyAvgQty, currentDailyRate, expectedMtd, lossDelta, lossDeltaPct: 0, lossFlag: 'NO_DATA' };
  }

  const lossDeltaPct     = dailyAvgQty > 0 ? Math.min(300, Math.round((lossDelta / dailyAvgQty) * 100)) : 0;
  const lossFlag         = dailyAvgQty > 0 ? (currentDailyRate < dailyAvgQty ? 'BEHIND' : 'AHEAD') : 'NO_DATA';
  return { dailyAvgQty, currentDailyRate, expectedMtd, lossDelta, lossDeltaPct, lossFlag };
}

// ── OUTPUT HELPERS ────────────────────────────────────────────────────────────
const fN   = n => Math.round(n * 100) / 100;
const mom  = (c, p) => p === 0 ? (c === 0 ? 0 : 100) : Math.min(Math.round(((c - p) / p) * 100), 100);
const mStr = (c, p) => `${mom(c, p)}%`;

function inactivityDays(cur, prev) {
  if (cur > 0) return 0;
  if (prev === 0) return 90;
  return Math.min(90, Math.round((1 - (cur / prev)) * 30));
}

function volatility(cur, prev) {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return Math.min(100, Math.abs(Math.round(((cur - prev) / prev) * 100)));
}

function buildProdBreakdown(prMap) {
  return ALL_PRODUCTS
    .filter(p => prMap[p] && (prMap[p].c || prMap[p].p))
    .map(prod => ({
      product: prod,
      cur: fN(prMap[prod].c), prev: fN(prMap[prod].p),
      mom: mom(prMap[prod].c, prMap[prod].p),
    }));
}

// ── GEO META ──────────────────────────────────────────────────────────────────
const geoMeta = { stateGeoJsonPropertyKey: 'ST_NM', districtTopoJsonPropertyKey: 'dtname', stateMap: {}, districtsByState: {} };
for (const [name, slug] of Object.entries(STATE_SLUG)) geoMeta.stateMap[name] = { slug, geoJsonKey: name };
for (const dA of Object.values(byDistrict)) {
  if (!geoMeta.districtsByState[dA.state]) geoMeta.districtsByState[dA.state] = [];
  if (!geoMeta.districtsByState[dA.state].some(x => x.district === dA.district))
    geoMeta.districtsByState[dA.state].push({ district: dA.district, slug: dA.geoSlug, lookupKey: districtKey(dA.district) });
}

// ── REGIONAL MAP DATA ─────────────────────────────────────────────────────────
// MoM CSV is pre-aggregated — provide cur/prev/ytd + derived monthly keys
const regionalMapData = Object.values(byDistrict).map(d => ({
  state: d.state,
  district: d.district,
  cur: fN(d.c),
  prev: fN(d.p),
  ytd: fN(d.ytd),
  monthlyDespatch: (curMonth > 0 && prevMonth > 0)
    ? { [prevMonth]: fN(d.p), [curMonth]: fN(d.c) }
    : {},
  currentPending: fN(pendingByDistrict[`${d.state}||${d.district}`] || 0),
}));

// ── MONTHLY HISTORY (from MoM_Monthly.csv) ────────────────────────────────────
// One row per (entity, year, month) with a single QTY column. Aggregated into a
// per-month snapshot mirroring the structure the frontend already consumes
// (overall / products / states / districts / dealers), but qty-only because the
// monthly CSV carries a single QTY column (no cur/prev/ytd split).
//
// Output:
//   monthlyHistory[periodKey="YYYY-MM"] = {
//     periodKey, year, month, label,
//     total,
//     products:   [ { product, label, qty, share } ],
//     states:     [ { state, slug, qty, share, products: [{product, qty}] } ],
//     districts:  [ { state, district, lookupKey, slug, qty, share, products: [...] } ],
//     dealers:    [ { state, district, client, lookupKey, slug, qty, products: [...] } ]
//   }
//   availableMonths = [ { periodKey, year, month, label } ]  (sorted desc — newest first)
//
// periodKey uses ISO year-month ("2026-06") to avoid the 1-12 month-number
// collision that the legacy regionalMapData.monthlyDespatch pattern suffers
// from (Jan 2025 vs Jan 2026 would overwrite each other).

const monthlyHistory = {};
const monthlyAcc = {};   // periodKey -> { overall, byProduct, byState, byDistrict, byDealer }

const pad2 = n => String(n).padStart(2, '0');
const MONTH_FULL = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

for (const r of monthlyRows) {
  const year  = parseInt(r['YEAR'] || r['Year'] || r['year'],  10) || 0;
  const month = parseInt(r['MONTH'] || r['Month'] || r['month'], 10) || 0;
  if (!year || !month) continue;
  const periodKey = `${year}-${pad2(month)}`;
  const qty       = parseFloat(r['QTY'] || r['Qty'] || r['qty']) || 0;

  const rawItem  = (r['ITEM'] || r['Item'] || r['item'] || '').trim().toUpperCase();
  const product  = PRODUCT_SET.has(rawItem) ? rawItem : 'GI';
  
  let state      = resolveState((r['STATE'] || r['State'] || r['state'] || r['STATE NAME'] || r['State Name'] || r['state name'] || '').trim());
  let district   = resolveDistrict((r['DISTRICT'] || r['District'] || r['district'] || r['DISTRICTS'] || '').trim(), state);
  
  if (state === 'Unknown' && district !== 'Unknown') {
    const distKey = normalizeDistrictName(district);
    if (WB_CANONICAL[distKey]) {
      district = WB_CANONICAL[distKey];
      state = 'West Bengal';
    } else {
      state = districtToState[district.toLowerCase()] || 'Unknown';
    }
  }
  
  const client   = (r['CLIENT NAME'] || r['Client Name'] || r['client name'] || r['CLIENT'] || r['Client'] || r['client'] || '').trim();
  const geoSlug  = STATE_SLUG[state] || null;

  if (!monthlyAcc[periodKey]) {
    monthlyAcc[periodKey] = {
      overall: 0,
      byProduct: {}, byState: {}, byDistrict: {}, byDealer: {},
    };
  }
  const acc = monthlyAcc[periodKey];
  acc.overall += qty;

  if (!acc.byProduct[product]) acc.byProduct[product] = 0;
  acc.byProduct[product] += qty;

  if (!acc.byState[state]) acc.byState[state] = { qty: 0, pr: {}, geoSlug };
  acc.byState[state].qty += qty;
  if (!acc.byState[state].pr[product]) acc.byState[state].pr[product] = 0;
  acc.byState[state].pr[product] += qty;

  const dKey = `${state}||${district}`;
  if (!acc.byDistrict[dKey]) acc.byDistrict[dKey] = { state, district, qty: 0, pr: {}, geoSlug };
  acc.byDistrict[dKey].qty += qty;
  if (!acc.byDistrict[dKey].pr[product]) acc.byDistrict[dKey].pr[product] = 0;
  acc.byDistrict[dKey].pr[product] += qty;

  const dlKey = `${state}||${district}||${client}`;
  if (!acc.byDealer[dlKey]) acc.byDealer[dlKey] = { state, district, client, qty: 0, pr: {}, geoSlug };
  acc.byDealer[dlKey].qty += qty;
  if (!acc.byDealer[dlKey].pr[product]) acc.byDealer[dlKey].pr[product] = 0;
  acc.byDealer[dlKey].pr[product] += qty;
}

// Build availableMonths — sorted descending (newest first) so the frontend's
// default selection is the most recent month with data.
const availableMonths = Object.keys(monthlyAcc)
  .sort()
  .reverse()
  .map(periodKey => {
    const [y, m] = periodKey.split('-').map(Number);
    return { periodKey, year: y, month: m, label: `${MONTH_FULL[m-1]} ${y}` };
  });

// Build per-month snapshot objects
for (const periodKey of Object.keys(monthlyAcc).sort()) {
  const acc = monthlyAcc[periodKey];
  const [y, m] = periodKey.split('-').map(Number);

  monthlyHistory[periodKey] = {
    periodKey,
    year: y,
    month: m,
    label: `${MONTH_FULL[m-1]} ${y}`,
    total: fN(acc.overall),

    products: ALL_PRODUCTS
      .filter(p => acc.byProduct[p] && acc.byProduct[p] > 0)
      .map(prod => ({
        product: prod,
        label: PRODUCT_LABELS[prod],
        qty: fN(acc.byProduct[prod]),
        share: acc.overall > 0 ? Math.round((acc.byProduct[prod] / acc.overall) * 100) : 0,
      })),

    states: Object.entries(acc.byState)
      .map(([state, a]) => ({
        state, slug: a.geoSlug,
        qty: fN(a.qty),
        share: acc.overall > 0 ? Math.round((a.qty / acc.overall) * 100) : 0,
        products: ALL_PRODUCTS
          .filter(p => a.pr[p] && a.pr[p] > 0)
          .map(prod => ({ product: prod, qty: fN(a.pr[prod]) })),
      }))
      .sort((a, b) => b.qty - a.qty),

    districts: Object.values(acc.byDistrict)
      .map(a => ({
        state: a.state, district: a.district,
        lookupKey: districtKey(a.district), slug: a.geoSlug,
        qty: fN(a.qty),
        share: acc.overall > 0 ? Math.round((a.qty / acc.overall) * 100) : 0,
        products: ALL_PRODUCTS
          .filter(p => a.pr[p] && a.pr[p] > 0)
          .map(prod => ({ product: prod, qty: fN(a.pr[prod]) })),
      }))
      .sort((a, b) => b.qty - a.qty),

    dealers: Object.values(acc.byDealer)
      .map(a => ({
        state: a.state, district: a.district, client: a.client,
        lookupKey: districtKey(a.district), slug: a.geoSlug,
        qty: fN(a.qty),
        products: ALL_PRODUCTS
          .filter(p => a.pr[p] && a.pr[p] > 0)
          .map(prod => ({ product: prod, qty: fN(a.pr[prod]) })),
      }))
      .sort((a, b) => b.qty - a.qty),
  };
}

console.log(`Monthly history built: ${availableMonths.length} months, ${monthlyRows.length} rows processed`);
console.log(`Available months: ${availableMonths.map(m => m.periodKey).join(', ')}`);

// ── FINAL OUTPUT ──────────────────────────────────────────────────────────────
const overallPace = computePace(overall.ytd, overall.c);

const output = {
  meta: {
    generatedAt: now.toISOString(),
    curPeriod: curLabel, prevPeriod: prevLabel, ytdPeriod: ytdLabel,
    ytdTotalDays, curElapsedDays,
    rowsProcessed: momRows.length,
    pendingRowsProcessed: pendingRows.length,
    blankClientRows,
  },
  generatedAt:   now.toISOString(),
  curPeriod:     curLabel,
  prevPeriod:    prevLabel,
  ytdPeriod:     ytdLabel,
  totalCur:      fN(overall.c),
  totalPrev:     fN(overall.p),
  totalYtd:      fN(overall.ytd),
  totalMoM:      mom(overall.c, overall.p),
  totalMoMStr:   mStr(overall.c, overall.p),
  pendingTotal:  fN(overall.pending),
  targetTotal:   0,
  rowsProcessed: momRows.length,
  ...overallPace,
  geoMeta,
  regionalMapData,
  monthlyHistory,
  availableMonths,
  pendingAvailableMonths: Array.from(pendingMonthsSet)
    .sort()
    .reverse()
    .map(periodKey => {
      const [y, m] = periodKey.split('-').map(Number);
      return { periodKey, year: y, month: m, label: `${MONTH_FULL[m-1]} ${y}` };
    }),

  products: ALL_PRODUCTS.map(prod => {
    const a = byProduct[prod] || mkA();
    const pace = computePace(a.ytd, a.c);
    return {
      product: prod, label: PRODUCT_LABELS[prod],
      cur: fN(a.c), prev: fN(a.p), ytd: fN(a.ytd),
      mom: mom(a.c, a.p), momStr: mStr(a.c, a.p),
      share: overall.c > 0 ? Math.round((a.c / overall.c) * 100) : 0,
      pendingQty: fN(a.pending),
      ...pace,
    };
  }),

  states: Object.entries(byState).map(([state, a]) => {
    const pace = computePace(a.ytd, a.c);
    return {
      state, geoKey: state, slug: STATE_SLUG[state] || null,
      cur: fN(a.c), prev: fN(a.p), ytd: fN(a.ytd),
      mom: mom(a.c, a.p), momStr: mStr(a.c, a.p),
      share: overall.c > 0 ? Math.round((a.c / overall.c) * 100) : 0,
      drop: fN(a.p - a.c),
      pendingQty: fN(a.pending),
      pendingHistory: pendingHistoryByState[state] || {},
      inactivityDays: inactivityDays(a.c, a.p),
      volatility: volatility(a.c, a.p),
      products: buildProdBreakdown(a.pr),
      ...pace,
    };
  }).sort((a, b) => b.cur - a.cur),

  districts: Object.values(byDistrict).map(a => {
    const pace = computePace(a.ytd, a.c);
    const dKey = `${a.state}||${a.district}`;
    return {
      state: a.state, district: a.district,
      lookupKey: districtKey(a.district), slug: a.geoSlug,
      cur: fN(a.c), prev: fN(a.p), ytd: fN(a.ytd),
      mom: mom(a.c, a.p), momStr: mStr(a.c, a.p),
      drop: fN(a.p - a.c),
      pendingQty: fN(a.pending),
      pendingHistory: pendingHistoryByDistrict[dKey] || {},
      inactivityDays: inactivityDays(a.c, a.p),
      volatility: volatility(a.c, a.p),
      products: buildProdBreakdown(a.pr),
      ...pace,
    };
  }).sort((a, b) => b.cur - a.cur),

  dealers: Object.values(byDealer).map(a => {
    const pace = computePace(a.ytd, a.c);
    return {
      state: a.state, district: a.district,
      lookupKey: districtKey(a.district), client: a.client, slug: a.geoSlug,
      cur: fN(a.c), prev: fN(a.p), ytd: fN(a.ytd),
      mom: mom(a.c, a.p), momStr: mStr(a.c, a.p),
      drop: fN(a.p - a.c),
      pendingQty: fN(a.pending),
      products: buildProdBreakdown(a.pr),
      ...pace,
    };
  }).sort((a, b) => b.cur - a.cur),
};

return [{ json: output }];
