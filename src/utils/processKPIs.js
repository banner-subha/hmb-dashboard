// ═══════════════════════════════════════════════════════════════════════════════
// HMB ISPAT — SALES MONITORING ENGINE v13
// Production-grade WB district normalization + canonical mapping
// ═══════════════════════════════════════════════════════════════════════════════

const rawRows = $input.all();

// Guard — n8n requires at least one item returned
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
// Keys   = normalizeDistrictName() output
// Values = exact TopoJSON dtname strings

const WB_CANONICAL = {
  // Alipurduar
  'alipurduar':                 'Alipurduar',

  // Bankura
  'bankura':                    'Bankura',

  // Birbhum
  'birbhum':                    'Birbhum',

  // Cooch Behar
  'cooch behar':                'Cooch Behar',
  'coochbehar':                 'Cooch Behar',
  'koch bihar':                 'Cooch Behar',
  'kochbihar':                  'Cooch Behar',

  // Dakshin Dinajpur
  'dakshin dinajpur':           'Dakshin Dinajpur',
  'south dinajpur':             'Dakshin Dinajpur',
  'dinajpur dakshin':           'Dakshin Dinajpur',

  // Darjeeling
  'darjeeling':                 'Darjeeling',

  // Hooghly
  'hooghly':                    'Hooghly',
  'hugli':                      'Hooghly',
  'hugly':                      'Hooghly',

  // Howrah
  'howrah':                     'Howrah',
  'haorah':                     'Howrah',
  'haora':                      'Howrah',

  // Jalpaiguri
  'jalpaiguri':                 'Jalpaiguri',

  // Jhargram
  'jhargram':                   'Jhargram',

  // Kalimpong
  'kalimpong':                  'Kalimpong',

  // Kolkata
  'kolkata':                    'Kolkata',
  'calcutta':                   'Kolkata',
  'kolkatta':                   'Kolkata',

  // Maldah
  'maldah':                     'Maldah',
  'malda':                      'Maldah',

  // Medinipur East
  'medinipur east':             'Medinipur East',
  'east medinipur':             'Medinipur East',
  'purba medinipur':            'Medinipur East',
  'purba mednipur':             'Medinipur East',
  'east midnapore':             'Medinipur East',
  'east midnapur':              'Medinipur East',
  'midnapur east':              'Medinipur East',

  // Medinipur West
  'medinipur west':             'Medinipur West',
  'west medinipur':             'Medinipur West',
  'paschim medinipur':          'Medinipur West',
  'paschim mednipur':           'Medinipur West',
  'west midnapore':             'Medinipur West',
  'west midnapur':              'Medinipur West',
  'midnapur west':              'Medinipur West',
  'midnapur':                   'Medinipur West',

  // Murshidabad
  'murshidabad':                'Murshidabad',

  // Nadia
  'nadia':                      'Nadia',
  'nadiya':                     'Nadia',

  // North 24 Parganas
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

  // Paschim Bardhaman
  'paschim bardhaman':          'Paschim Bardhaman',
  'west bardhaman':             'Paschim Bardhaman',
  'bardhaman west':             'Paschim Bardhaman',
  'west burdwan':               'Paschim Bardhaman',
  'burdwan west':               'Paschim Bardhaman',
  'paschim burdwan':            'Paschim Bardhaman',

  // Purba Bardhaman
  'purba bardhaman':            'Purba Bardhaman',
  'east bardhaman':             'Purba Bardhaman',
  'bardhaman east':             'Purba Bardhaman',
  'east burdwan':               'Purba Bardhaman',
  'burdwan east':               'Purba Bardhaman',
  'purba burdwan':              'Purba Bardhaman',
  'bardhaman':                  'Purba Bardhaman',
  'burdwan':                    'Purba Bardhaman',

  // Purulia
  'purulia':                    'Purulia',

  // South 24 Parganas
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

  // Uttar Dinajpur
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
  'odisha':            'Orissa',
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
  'Odisha':            'orrisa',
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
    // Fallback title-case — will appear in unmatched log
    return trimmed.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  const key = normState(trimmed);
  if (NON_WB_ALIASES[key]) return NON_WB_ALIASES[key];
  if (/^[A-Z]+$/.test(trimmed)) return trimmed;
  return trimmed.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── 4. DATE RANGE ─────────────────────────────────────────────────────────────

let maxSheetDate = new Date(0);
for (const r of rawRows) {
  const dt = new Date(r.json['DESPATCH DATE']);
  if (!isNaN(dt) && dt > maxSheetDate) maxSheetDate = dt;
}
const endCur = maxSheetDate.getTime() === 0 ? new Date() : new Date(maxSheetDate);

const startCur  = new Date(endCur);
startCur.setMonth(startCur.getMonth() - 1);
const endPrev   = new Date(startCur);
const startPrev = new Date(endPrev);
startPrev.setMonth(startPrev.getMonth() - 1);

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt     = dt => `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`;
const curLabel  = `${fmt(startCur)} – ${fmt(endCur)}`;
const prevLabel = `${fmt(startPrev)} – ${fmt(endPrev)}`;

// ── 5. PRODUCT CATALOGUE ──────────────────────────────────────────────────────

const PRODUCT_LABELS = {
  IG:'IG (Iron Gate)', GI:'GI (Galvanised Iron)', IGG:'IGG (Iron Gate — Heavy)',
  HGI:'HGI (Heavy GI)', P:'P (Pipe)', RS:'RS (Roofing Sheet)', SS:'SS (Stainless Steel)'
};
const ALL_PRODUCTS = Object.keys(PRODUCT_LABELS);
const PRODUCT_SET  = new Set(ALL_PRODUCTS);

// ── 6. AGGREGATION ────────────────────────────────────────────────────────────

const mkA = () => ({ c: 0, p: 0, oc: 0, op: 0 });
const overall = { c: 0, p: 0 };
const overallOrder = { c: 0, p: 0 };
let pendingTotal = 0;
let targetTotal  = 0;

const byProduct  = {};
const byState    = {};
const byDistrict = {};
const byDealer   = {};

for (const row of rawRows) {
  const r   = row.json;
  const qty  = parseFloat(r['QTY']) || 0;
  const type = (r['TYPE'] || '').trim().toUpperCase();

  const isOrder = type === 'ORDER';
  if (isOrder) {
    pendingTotal += qty;
  } else if (type === 'TARGET')   { targetTotal  += qty; continue; }
  else if (type !== 'DESPATCH') continue;

  const dateRaw = isOrder ? (r['DESPATCH DATE'] || r['ORDER DATE'] || r['DATE'] || '') : (r['DESPATCH DATE'] || '');
  const dt = new Date(dateRaw);
  if (isNaN(dt)) continue;

  const t      = dt.getTime();
  const isCur  = t > startCur.getTime()  && t <= endCur.getTime();
  const isPrev = t > startPrev.getTime() && t <= endPrev.getTime();
  if (!isCur && !isPrev) continue;

  const rawItem    = (r['ITEM']        || '').trim().toUpperCase();
  const product    = PRODUCT_SET.has(rawItem) ? rawItem : 'IG';

  const rawStateName = (r['STATE']    || 'Unknown').trim();
  const rawDistName  = (r['DISTRICT'] || 'Unknown').trim();

  const canonicalState    = resolveState(rawStateName);
  const canonicalDistrict = resolveDistrict(rawDistName, canonicalState);
  const geoSlug           = STATE_SLUG[canonicalState] || null;
  const client            = (r['CLIENT NAME'] || 'Unknown').trim();
  const iC                = isCur ? 1 : 0;

  if (isOrder) {
    if (iC) overallOrder.c += qty; else overallOrder.p += qty;
  } else {
    if (iC) overall.c += qty; else overall.p += qty;
  }

  let pA = byProduct[product];
  if (!pA) { pA = mkA(); byProduct[product] = pA; }
  if (isOrder) {
    if (iC) pA.oc += qty; else pA.op += qty;
  } else {
    if (iC) pA.c += qty; else pA.p += qty;
  }

  let sA = byState[canonicalState];
  if (!sA) { sA = { c:0, p:0, oc:0, op:0, pr:{} }; byState[canonicalState] = sA; }
  if (isOrder) {
    if (iC) sA.oc += qty; else sA.op += qty;
  } else {
    if (iC) sA.c += qty; else sA.p += qty;
  }
  let spA = sA.pr[product];
  if (!spA) { spA = mkA(); sA.pr[product] = spA; }
  if (isOrder) {
    if (iC) spA.oc += qty; else spA.op += qty;
  } else {
    if (iC) spA.c += qty; else spA.p += qty;
  }

  const dKey = `${canonicalState}||${canonicalDistrict}`;
  let dA = byDistrict[dKey];
  if (!dA) { dA = { c:0, p:0, oc:0, op:0, state: canonicalState, district: canonicalDistrict, geoSlug, pr:{} }; byDistrict[dKey] = dA; }
  if (isOrder) {
    if (iC) dA.oc += qty; else dA.op += qty;
  } else {
    if (iC) dA.c += qty; else dA.p += qty;
  }
  let dpA = dA.pr[product];
  if (!dpA) { dpA = mkA(); dA.pr[product] = dpA; }
  if (isOrder) {
    if (iC) dpA.oc += qty; else dpA.op += qty;
  } else {
    if (iC) dpA.c += qty; else dpA.p += qty;
  }

  const dealKey = `${dKey}||${client}`;
  let dlA = byDealer[dealKey];
  if (!dlA) { dlA = { c:0, p:0, oc:0, op:0, state: canonicalState, district: canonicalDistrict, geoSlug, client, pr:{} }; byDealer[dealKey] = dlA; }
  if (isOrder) {
    if (iC) dlA.oc += qty; else dlA.op += qty;
  } else {
    if (iC) dlA.c += qty; else dlA.p += qty;
  }
  let dlpA = dlA.pr[product];
  if (!dlpA) { dlpA = mkA(); dlA.pr[product] = dlpA; }
  if (isOrder) {
    if (iC) dlpA.oc += qty; else dlpA.op += qty;
  } else {
    if (iC) dlpA.c += qty; else dlpA.p += qty;
  }
}

// ── 7. VALIDATION LOGGING ─────────────────────────────────────────────────────

const knownWBOutputs = new Set(Object.values(WB_CANONICAL));
const wbKeys = Object.keys(byDistrict).filter(k => k.startsWith('West Bengal||'));

console.log('WB DISTRICT NORMALIZATION', wbKeys);

const unmatchedDistricts = wbKeys
  .map(k => k.split('||')[1])
  .filter(name => !knownWBOutputs.has(name));

if (unmatchedDistricts.length > 0) {
  console.log('WB UNMATCHED DISTRICTS:', JSON.stringify(unmatchedDistricts));
} else {
  console.log('WB DISTRICT VALIDATION: all resolved ✓');
}

// ── 8. OUTPUT HELPERS ─────────────────────────────────────────────────────────

const fN   = n => Math.round(n * 100) / 100;
const mom  = (c, p) => p === 0 ? (c === 0 ? 0 : 100) : Math.min(Math.round(((c - p) / p) * 100), 100);
const mStr = (c, p) => `${mom(c, p)}%`;

function buildProdBreakdown(prMap) {
  return ALL_PRODUCTS
    .filter(p => prMap[p] && (prMap[p].c || prMap[p].p || prMap[p].oc || prMap[p].op))
    .map(prod => ({
      product: prod,
      cur:     fN(prMap[prod].c || 0),
      prev:    fN(prMap[prod].p || 0),
      mom:     mom(prMap[prod].c || 0, prMap[prod].p || 0),
      orderCur:  fN(prMap[prod].oc || 0),
      orderPrev: fN(prMap[prod].op || 0),
      orderMoM:  mom(prMap[prod].oc || 0, prMap[prod].op || 0),
    }));
}

// ── 9. GEO METADATA ───────────────────────────────────────────────────────────

const geoMeta = {
  stateGeoJsonPropertyKey:     'ST_NM',
  districtTopoJsonPropertyKey: 'dtname',
  districtTopoJsonObjectKey:   'RUNTIME_DETECT — always Object.keys(topology.objects)[0]',
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

const output = {
  generatedAt:   endCur.toISOString(),
  curPeriod:     curLabel,
  prevPeriod:    prevLabel,
  totalCur:      fN(overall.c),
  totalPrev:     fN(overall.p),
  totalMoM:      mom(overall.c, overall.p),
  totalMoMStr:   mStr(overall.c, overall.p),
  pendingTotal:  fN(pendingTotal),
  targetTotal:   fN(targetTotal),
  rowsProcessed: rawRows.length,
  geoMeta,

  products: ALL_PRODUCTS.map(prod => {
    const a = byProduct[prod] || mkA();
    return {
      product: prod,
      label:   PRODUCT_LABELS[prod],
      cur:     fN(a.c),
      prev:    fN(a.p),
      mom:     mom(a.c, a.p),
      momStr:  mStr(a.c, a.p),
      orderCur:  fN(a.oc || 0),
      orderPrev: fN(a.op || 0),
      orderMoM:  mom(a.oc || 0, a.op || 0),
      orderMoMStr: mStr(a.oc || 0, a.op || 0),
      share:   overall.c > 0 ? Math.round((a.c / overall.c) * 100) : 0,
    };
  }),

  states: Object.entries(byState).map(([state, a]) => ({
    state,
    geoKey:   state,
    slug:     STATE_SLUG[state] || null,
    cur:      fN(a.c),
    prev:     fN(a.p),
    mom:      mom(a.c, a.p),
    momStr:   mStr(a.c, a.p),
    orderCur:  fN(a.oc || 0),
    orderPrev: fN(a.op || 0),
    orderMoM:  mom(a.oc || 0, a.op || 0),
    orderMoMStr: mStr(a.oc || 0, a.op || 0),
    share:    overall.c > 0 ? Math.round((a.c / overall.c) * 100) : 0,
    drop:     fN(a.p - a.c),
    products: buildProdBreakdown(a.pr),
  })).sort((a, b) => b.cur - a.cur),

  districts: Object.values(byDistrict).map(a => ({
    state:     a.state,
    district:  a.district,
    lookupKey: districtKey(a.district),
    slug:      a.geoSlug,
    cur:       fN(a.c),
    prev:      fN(a.p),
    mom:       mom(a.c, a.p),
    momStr:    mStr(a.c, a.p),
    orderCur:  fN(a.oc || 0),
    orderPrev: fN(a.op || 0),
    orderMoM:  mom(a.oc || 0, a.op || 0),
    orderMoMStr: mStr(a.oc || 0, a.op || 0),
    drop:      fN(a.p - a.c),
    products:  buildProdBreakdown(a.pr),
  })).sort((a, b) => b.cur - a.cur),

  dealers: Object.values(byDealer).map(a => ({
    state:     a.state,
    district:  a.district,
    lookupKey: districtKey(a.district),
    client:    a.client,
    slug:      a.geoSlug,
    cur:       fN(a.c),
    prev:      fN(a.p),
    mom:       mom(a.c, a.p),
    momStr:    mStr(a.c, a.p),
    orderCur:  fN(a.oc || 0),
    orderPrev: fN(a.op || 0),
    orderMoM:  mom(a.oc || 0, a.op || 0),
    orderMoMStr: mStr(a.oc || 0, a.op || 0),
    drop:      fN(a.p - a.c),
    products:  buildProdBreakdown(a.pr),
  })).sort((a, b) => b.cur - a.cur),
};

return [{ json: output }];