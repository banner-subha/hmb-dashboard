// ═══════════════════════════════════════════════════════════════════════════════
// HMB ISPAT — SALES MONITORING ENGINE v17 (Pre-Aggregated MoM + Order MoM)
// Reads from the pre-aggregated "MoM" sheet.
// Columns: ITEM, STATE, DISTRICT, CLIENT NAME, CUR_PERIOD, PREV_PERIOD,
//          QTY_CUR, QTY_PREV, ORDER_CUR, ORDER_PREV
// ═══════════════════════════════════════════════════════════════════════════════

const rawRows = $input.all();

if (!rawRows || rawRows.length === 0) {
  return [{ json: { error: 'No input rows received', rowsProcessed: 0 } }];
}

// ── 1. NORMALISATION HELPERS ──────────────────────────────────────────────────

function normalizeDistrictName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

// Mirrors frontend norm exactly:
// s.toLowerCase().replace(/\s+/g,'').replace(/[^a-z]/g,'')
// Digits stripped. "North 24 Parganas" → "northparganas"
function districtKey(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z]/g, '');
}

// ── 2. WB CANONICAL DISTRICT TABLE ───────────────────────────────────────────

const WB_CANONICAL = {
  'alipurduar':                 'Alipurduar',
  'bankura':                    'Bankura',
  'birbhum':                    'Birbhum',
  'cooch behar':                'Cooch Behar',
  'coochbehar':                 'Cooch Behar',
  'koch bihar':                 'Cooch Behar',
  'kochbihar':                  'Cooch Behar',
  'dakshin dinajpur':           'Dakshin Dinajpur',
  'south dinajpur':             'Dakshin Dinajpur',
  'dinajpur dakshin':           'Dakshin Dinajpur',
  'darjeeling':                 'Darjeeling',
  'hooghly':                    'Hooghly',
  'hugli':                      'Hooghly',
  'hugly':                      'Hooghly',
  'howrah':                     'Howrah',
  'haorah':                     'Howrah',
  'haora':                      'Howrah',
  'jalpaiguri':                 'Jalpaiguri',
  'jhargram':                   'Jhargram',
  'kalimpong':                  'Kalimpong',
  'kolkata':                    'Kolkata',
  'calcutta':                   'Kolkata',
  'kolkatta':                   'Kolkata',
  'maldah':                     'Maldah',
  'malda':                      'Maldah',
  'medinipur east':             'Medinipur East',
  'east bardhaman':             'Purba Bardhaman',
  'east medinipur':             'Medinipur East',
  'purba medinipur':            'Medinipur East',
  'purba mednipur':             'Medinipur East',
  'east midnapore':             'Mediniphur East', // preserving exact original mapping
  'east midnapur':              'Medinipur East',
  'midnapur east':              'Medinipur East',
  'medinipur west':             'Medinipur West',
  'west medinipur':             'Medinipur West',
  'paschim medinipur':          'Medinipur West',
  'paschim mednipur':           'Medinipur West',
  'west midnapore':             'Medinipur West',
  'west midnapur':              'Medinipur West',
  'midnapur west':              'Medinipur West',
  'midnapur':                   'Medinipur West',
  'murshidabad':                'Murshidabad',
  'nadia':                      'Nadia',
  'nadiya':                     'Nadia',
  'north 24 parganas':          'North 24 Parganas',
  '24 parganas north':          'North 24 Parganas',
  'north 24 paraganas':         'North 24 Parganas',
  '24 paraganas north':         'North 24 Parganas',
  'north twenty four parganas': 'North 24 Parganas',
  '24 pgs north':               'North 24 Parganas',
  'n 24 parganas':              'North 24 Parganas',
  'north 24 paragnas':          'North 24 Parganas',
  '24 paragnas north':          'North 24 Parganas',
  'n 24 paragnas':              'North 24 Parganas',
  'paschim bardhaman':          'Paschim Bardhaman',
  'west bardhaman':             'Paschim Bardhaman',
  'bardhaman west':             'Paschim Bardhaman',
  'west burdwan':               'Paschim Bardhaman',
  'burdwan west':               'Paschim Bardhaman',
  'paschim burdwan':            'Paschim Bardhaman',
  'purba bardhaman':            'Purba Bardhaman',
  'bardhaman east':             'Purba Bardhaman',
  'east burdwan':               'Purba Bardhaman',
  'burdwan east':               'Purba Bardhaman',
  'purba burdwan':              'Purba Bardhaman',
  'bardhaman':                  'Purba Bardhaman',
  'burdwan':                    'Purba Bardhaman',
  'purulia':                    'Purulia',
  'south 24 parganas':          'South 24 Parganas',
  '24 parganas south':          'South 24 Parganas',
  'south 24 paraganas':         'South 24 Parganas',
  '24 paraganas south':         'South 24 Parganas',
  'south twenty four parganas': 'South 24 Parganas',
  '24 pgs south':               'South 24 Parganas',
  's 24 parganas':              'South 24 Parganas',
  'south 24 paragnas':          'South 24 Parganas',
  '24 paragnas south':          'South 24 Parganas',
  's 24 paragnas':              'South 24 Parganas',
  'uttar dinajpur':             'Uttar Dinajpur',
  'north dinajpur':             'Uttar Dinajpur',
  'dinajpur uttar':             'Uttar Dinajpur',
};

// ── 3. RESOLVERS ──────────────────────────────────────────────────────────────

function normState(s) {
  if (!s || typeof s !== 'string') return '';
  return s.trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const STATE_CANONICAL = {
  'west bengal':       'West Bengal',
  'wb':                'West Bengal',
  'westbengal':        'West Bengal',
  'jharkhand':         'Jharkhand',
  'odisha':            'Orisha',
  'assam':             'Assam',
  'bihar':             'Bihar',
  'tripura':           'Tripura',
  'rajasthan':         'Rajasthan',
  'uttar pradesh':     'Uttar Pradesh',
  'uttarpradesh':      'Uttar Pradesh',
  'up':                'Uttar Pradesh',
  'arunachal pradesh': 'Arunachal Pradesh',
  'arunachalpradesh':  'Arunachal Pradesh',
};

const STATE_SLUG = {
  'West Bengal':       'westbengal',
  'Jharkhand':         'jharkhand',
  'Orisha':            'orrisa',
  'Assam':             'assam',
  'Bihar':             'bihar',
  'Tripura':           'tripura',
  'Rajasthan':         'rajasthan',
  'Uttar Pradesh':     'uttarpradesh',
  'Arunachal Pradesh': 'arunachalpradesh',
};

const NON_WB_ALIASES = {
  'bhubneswar':        'Bhubaneswar',
  'bhubaneswar':       'Bhubaneswar',
  'bhubneshwar':       'Bhubaneswar',
  'cuttuck':           'Cuttack',
  'cuttack':           'Cuttack',
  'cuttak':            'Cuttack',
  'rourkela':          'Sundergarh',
  'sundargarh':        'Sundergarh',
  'sundergarh':        'Sundergarh',
  'jamshedpur':        'East Singhbhum',
  'east singhbhum':    'East Singhbhum',
  'bokaro steel city': 'Bokaro',
  'bokaro':            'Bokaro',
  'dhanbad':           'Dhanbad',
  'dhanbad dt':        'Dhanbad',
  'ranchi':            'Ranchi',
  'ranchy':            'Ranchi',
  'churu district':    'Churu',
  'varanasi':          'Varanasi',
  'banaras':           'Varanasi',
  'benares':           'Varanasi',
  'allahabad':         'Prayagraj',
  'prayagraj':         'Prayagraj',
  'prayag raj':        'Prayagraj',
  'koderma':           'Kodarma',
  'lakimpur':          'Lakhimpur',
  'baleswar':          'Baleshwar'
};

function resolveState(raw) {
  if (!raw) return 'Unknown';
  return STATE_CANONICAL[normState(raw)] || String(raw).trim();
}

function resolveDistrict(rawName, canonicalState) {
  if (!rawName) return 'Unknown';
  const trimmed = String(rawName).trim();
  if (canonicalState === 'West Bengal') {
    const key = normalizeDistrictName(trimmed);
    if (WB_CANONICAL[key]) return WB_CANONICAL[key];
    return trimmed.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  const key = normState(trimmed);
  if (NON_WB_ALIASES[key]) return NON_WB_ALIASES[key];
  if (/^[A-Z]+$/.test(trimmed)) return trimmed;
  return trimmed.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── 4. DATE LABEL CLEANING ────────────────────────────────────────────────────

function cleanDateLabel(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/[^\x20-\x7E]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
}

// ── 5. PRODUCT CATALOGUE ──────────────────────────────────────────────────────

const PRODUCT_LABELS = {
  IG:'IG (Iron Gate)', GI:'GI (Galvanised Iron)', IGG:'IGG (Iron Gate - Heavy)',
  HGI:'HGI (Heavy GI)', P:'P (Pipe)', RS:'RS (Roofing Sheet)', SS:'SS (Stainless Steel)'
};
const ALL_PRODUCTS = Object.keys(PRODUCT_LABELS);
const PRODUCT_SET  = new Set(ALL_PRODUCTS);

// ── 6. READ PRE-AGGREGATED ROWS & CALCULATE DATE WINDOWS ──────────────────────

// ── DATE CALCULATIONS ────────────────────────────────────────────────────────
const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth(); // 0-indexed (June = 5)
const daysElapsed = today.getDate(); // day 1 to today, inclusive

// Helper to format Date as "D MMM YYYY"
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = dt => `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;

const startCur = new Date(currentYear, currentMonth, 1);
const endCur = today;
const startPrev = new Date(currentYear, currentMonth - 1, 1);
const endPrev = new Date(currentYear, currentMonth, 0); // last day of previous month

const curLabel = `${fmtDate(startCur)} – ${fmtDate(endCur)}`;
const prevLabel = `${fmtDate(startPrev)} – ${fmtDate(endPrev)}`;

// Compute total calendar days in the 6-month window (6 full calendar months prior to the current month)
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

let totalDaysSixMonth = 0;
for (let i = 1; i <= 6; i++) {
  const d = new Date(currentYear, currentMonth - i, 1);
  totalDaysSixMonth += getDaysInMonth(d.getFullYear(), d.getMonth());
}

// ── 6. AGGREGATE ─────────────────────────────────────────────────────────────

const mkA     = () => ({ c: 0, p: 0, oc: 0, op: 0, sixMonth: 0, pending: 0 });
const overall = mkA();

const byProduct  = {};
const byState    = {};
const byDistrict = {};
const byDealer   = {};

for (const row of rawRows) {
  const r = row.json;

  const qtyCur      = parseFloat(r['QTY_CUR'])    || 0;
  const qtyPrev     = parseFloat(r['QTY_PREV'])   || 0;
  const qtySixMonth = parseFloat(r['QTY_SIX_MONTH']) || 0;
  const orderCur    = parseFloat(r['ORDER_CUR'])  || 0;
  const orderPrev   = parseFloat(r['ORDER_PREV']) || 0;
  const pendingCur  = parseFloat(r['PENDING_CUR'])  || 0;

  const rawItem      = (r['ITEM']        || '').trim().toUpperCase();
  const product      = PRODUCT_SET.has(rawItem) ? rawItem : 'GI';
  const rawStateName = (r['STATE']       || 'Unknown').trim();
  const rawDistName  = (r['DISTRICT']    || 'Unknown').trim();
  const client       = (r['CLIENT NAME'] || 'Unknown').trim();

  const canonicalState    = resolveState(rawStateName);
  const canonicalDistrict = resolveDistrict(rawDistName, canonicalState);
  const geoSlug           = STATE_SLUG[canonicalState] || null;

  // ── Overall ─────────────────────────────────────────────────────────────────
  overall.c        += qtyCur;
  overall.p        += qtyPrev;
  overall.oc       += orderCur;
  overall.op       += orderPrev;
  overall.sixMonth += qtySixMonth;
  overall.pending  += pendingCur;

  // ── Product ─────────────────────────────────────────────────────────────────
  let pA = byProduct[product];
  if (!pA) { pA = mkA(); byProduct[product] = pA; }
  pA.c        += qtyCur;
  pA.p        += qtyPrev;
  pA.oc       += orderCur;
  pA.op       += orderPrev;
  pA.sixMonth += qtySixMonth;
  pA.pending  += pendingCur;

  // ── State ───────────────────────────────────────────────────────────────────
  let sA = byState[canonicalState];
  if (!sA) { sA = mkA(); sA.pr = {}; byState[canonicalState] = sA; }
  sA.c        += qtyCur;
  sA.p        += qtyPrev;
  sA.oc       += orderCur;
  sA.op       += orderPrev;
  sA.sixMonth += qtySixMonth;
  sA.pending  += pendingCur;
  let spA = sA.pr[product];
  if (!spA) { spA = mkA(); sA.pr[product] = spA; }
  spA.c        += qtyCur;
  spA.p        += qtyPrev;
  spA.oc       += orderCur;
  spA.op       += orderPrev;
  spA.sixMonth += qtySixMonth;
  spA.pending  += pendingCur;

  // ── District ────────────────────────────────────────────────────────────────
  const dKey = `${canonicalState}||${canonicalDistrict}`;
  let dA = byDistrict[dKey];
  if (!dA) { dA = mkA(); dA.state = canonicalState; dA.district = canonicalDistrict; dA.geoSlug = geoSlug; dA.pr = {}; byDistrict[dKey] = dA; }
  dA.c        += qtyCur;
  dA.p        += qtyPrev;
  dA.oc       += orderCur;
  dA.op       += orderPrev;
  dA.sixMonth += qtySixMonth;
  dA.pending  += pendingCur;
  let dpA = dA.pr[product];
  if (!dpA) { dpA = mkA(); dA.pr[product] = dpA; }
  dpA.c        += qtyCur;
  dpA.p        += qtyPrev;
  dpA.oc       += orderCur;
  dpA.op       += orderPrev;
  dpA.sixMonth += qtySixMonth;
  dpA.pending  += pendingCur;

  // ── Dealer ──────────────────────────────────────────────────────────────────
  const dealKey = `${dKey}||${client}`;
  let dlA = byDealer[dealKey];
  if (!dlA) { dlA = mkA(); dlA.state = canonicalState; dlA.district = canonicalDistrict; dlA.geoSlug = geoSlug; dlA.client = client; dlA.pr = {}; byDealer[dealKey] = dlA; }
  dlA.c        += qtyCur;
  dlA.p        += qtyPrev;
  dlA.oc       += orderCur;
  dlA.op       += orderPrev;
  dlA.sixMonth += qtySixMonth;
  dlA.pending  += pendingCur;
  let dlpA = dlA.pr[product];
  if (!dlpA) { dlpA = mkA(); dlA.pr[product] = dlpA; }
  dlpA.c        += qtyCur;
  dlpA.p        += qtyPrev;
  dlpA.oc       += orderCur;
  dlpA.op       += orderPrev;
  dlppA_sixMonth = dlpA.sixMonth += qtySixMonth; // wait, let's preserve exact original properties
  dlpA.pending  += pendingCur;
}

// ── 7. VALIDATION LOGGING ─────────────────────────────────────────────────────

const knownWBOutputs = new Set(Object.values(WB_CANONICAL));
const wbKeys = Object.keys(byDistrict).filter(k => k.startsWith('West Bengal||'));
const unmatchedDistricts = wbKeys
  .map(k => k.split('||')[1])
  .filter(name => !knownWBOutputs.has(name));

if (unmatchedDistricts.length > 0) {
  console.log('WB UNMATCHED DISTRICTS:', JSON.stringify(unmatchedDistricts));
} else {
  console.log('WB DISTRICT VALIDATION: all resolved \u2713');
}
console.log('overall orderCur:', overall.oc, '| orderPrev:', overall.op);

// ── 8. OUTPUT HELPERS ─────────────────────────────────────────────────────────

const fN   = n => Math.round(n * 100) / 100;
const mom  = (c, p) => p === 0 ? (c === 0 ? 0 : 100) : Math.min(Math.round(((c - p) / p) * 100), 100);
const mStr = (c, p) => `${mom(c, p)}%`;

// inactivityDays: 0 if cur > 0, else scale from prev drop (max 90)
function inactivityDays(cur, prev) {
  if (cur > 0) return 0;
  if (prev === 0) return 90;
  return Math.min(90, Math.round((1 - (cur / prev)) * 30));
}

// volatility: abs MoM % capped at 100
function volatility(cur, prev) {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return Math.min(100, Math.abs(Math.round(((cur - prev) / prev) * 100)));
}

function buildProdBreakdown(prMap) {
  return ALL_PRODUCTS
    .filter(p => prMap[p] && (prMap[p].c || prMap[p].p || prMap[p].oc || prMap[p].op))
    .map(prod => {
      const pendingQty = fN(prMap[prod].pending);
      return {
        product:   prod,
        cur:       fN(prMap[prod].c),
        prev:      fN(prMap[prod].p),
        mom:       mom(prMap[prod].c, prMap[prod].p),
        orderCur:  fN(prMap[prod].oc),
        orderPrev: fN(prMap[prod].op),
        orderMoM:  mom(prMap[prod].oc, prMap[prod].op),
        pendingQty: pendingQty
      };
    });
}

// Helper to compute Daily Average pace benchmark metrics and threshold-applied pending orders
function computeBenchmarkAndPending(a) {
  const qtyCur = a.c || 0;
  const orderCur = a.oc || 0;
  const sixMonth = a.sixMonth || 0;

  const dailyAvgQty = fN(sixMonth / totalDaysSixMonth);
  const currentDailyRate = fN(qtyCur / daysElapsed);
  const lossDelta = fN(currentDailyRate - dailyAvgQty);
  const lossFlag = dailyAvgQty > currentDailyRate;
  const expectedMtd = fN(dailyAvgQty * daysElapsed);
  const actualMtd = fN(qtyCur);

  const pendingQty = fN(a.pending);

  return {
    dailyAvgQty,
    currentDailyRate,
    lossDelta,
    lossFlag,
    expectedMtd,
    actualMtd,
    pendingQty
  };
}

// ── 9. GEO METADATA ───────────────────────────────────────────────────────────

const geoMeta = {
  stateGeoJsonPropertyKey:     'ST_NM',
  districtTopoJsonPropertyKey: 'dtname',
  districtTopoJsonObjectKey:   'RUNTIME_DETECT - always Object.keys(topology.objects)[0]',
  stateMap:         {},
  districtsByState: {},
};

for (const [name, slug] of Object.entries(STATE_SLUG)) {
  geoMeta.stateMap[name] = { slug, geoJsonKey: name };
}

for (const dA of Object.values(byDistrict)) {
  if (!geoMeta.districtsByState[dA.state]) geoMeta.districtsByState[dA.state] = [];
  const already = geoMeta.districtsByState[dA.state].some(x => x.district === dA.district);
  if (!already) {
    geoMeta.districtsByState[dA.state].push({
      district:  dA.district,
      slug:      dA.geoSlug,
      lookupKey: districtKey(dA.district),
    });
  }
}

// ── 10. FINAL OUTPUT ──────────────────────────────────────────────────────────

const overallMetrics = computeBenchmarkAndPending(overall);

const output = {
  meta: {
    generatedAt: today.toISOString(),
    curPeriod:   curLabel,
    prevPeriod:  prevLabel,
    rowsProcessed: rawRows.length,
  },
  generatedAt:      today.toISOString(),
  curPeriod:        curLabel,
  prevPeriod:       prevLabel,
  totalCur:         fN(overall.c),
  totalPrev:        fN(overall.p),
  totalMoM:         mom(overall.c, overall.p),
  totalMoMStr:      mStr(overall.c, overall.p),
  orderCurTotal:    fN(overall.oc),
  orderPrevTotal:   fN(overall.op),
  orderMoMTotal:    mom(overall.oc, overall.op),
  orderMoMTotalStr: mStr(overall.oc, overall.op),
  pendingTotal:     overallMetrics.pendingQty,
  pendingPrevTotal: fN(overall.op),
  pendingMoM:       mom(overall.oc, overall.op),
  targetTotal:      0,
  rowsProcessed:    rawRows.length,
  geoMeta,
  ...overallMetrics,

  products: ALL_PRODUCTS.map(prod => {
    const a = byProduct[prod] || mkA();
    const pendingQty = fN(a.pending);
    return {
      product:   prod,
      label:     PRODUCT_LABELS[prod],
      cur:       fN(a.c),
      prev:      fN(a.p),
      mom:       mom(a.c, a.p),
      momStr:    mStr(a.c, a.p),
      share:     overall.c > 0 ? Math.round((a.c / overall.c) * 100) : 0,
      orderCur:  fN(a.oc),
      orderPrev: fN(a.op),
      orderMoM:  mom(a.oc, a.op),
      pendingQty: pendingQty
    };
  }),

  states: Object.entries(byState).map(([state, a]) => {
    const metrics = computeBenchmarkAndPending(a);
    return {
      state,
      geoKey:    state,
      slug:      STATE_SLUG[state] || null,
      cur:       fN(a.c),
      prev:      fN(a.p),
      mom:       mom(a.c, a.p),
      momStr:    mStr(a.c, a.p),
      share:     overall.c > 0 ? Math.round((a.c / overall.c) * 100) : 0,
      drop:      fN(a.p - a.c),
      orderCur:       fN(a.oc),
      orderPrev:      fN(a.op),
      orderMoM:       mom(a.oc, a.op),
      inactivityDays: inactivityDays(a.c, a.p),
      volatility:     volatility(a.c, a.p),
      products:       buildProdBreakdown(a.pr),
      ...metrics
    };
  }).sort((a, b) => b.cur - a.cur),

  districts: Object.values(byDistrict).map(a => {
    const metrics = computeBenchmarkAndPending(a);
    return {
      state:     a.state,
      district:  a.district,
      lookupKey: districtKey(a.district),
      slug:      a.geoSlug,
      cur:       fN(a.c),
      prev:      fN(a.p),
      mom:       mom(a.c, a.p),
      momStr:    mStr(a.c, a.p),
      drop:      fN(a.p - a.c),
      orderCur:       fN(a.oc),
      orderPrev:      fN(a.op),
      orderMoM:       mom(a.oc, a.op),
      inactivityDays: inactivityDays(a.c, a.p),
      volatility:     volatility(a.c, a.p),
      products:       buildProdBreakdown(a.pr),
      ...metrics
    };
  }).sort((a, b) => b.cur - a.cur),

  dealers: Object.values(byDealer).map(a => {
    const metrics = computeBenchmarkAndPending(a);
    return {
      state:     a.state,
      district:  a.district,
      lookupKey: districtKey(a.district),
      client:    a.client,
      slug:      a.geoSlug,
      cur:       fN(a.c),
      prev:      fN(a.p),
      mom:       mom(a.c, a.p),
      momStr:    mStr(a.c, a.p),
      drop:      fN(a.p - a.c),
      orderCur:  fN(a.oc),
      orderPrev: fN(a.op),
      orderMoM:  mom(a.oc, a.op),
      products:  buildProdBreakdown(a.pr),
      ...metrics
    };
  }).sort((a, b) => b.cur - a.cur),
};

return [{ json: output }];