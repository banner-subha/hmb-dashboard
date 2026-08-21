// ═══════════════════════════════════════════════════════════════════════════════
// HMB ISPAT — NATIONWIDE CANONICAL DISTRICT NORMALIZER
// Unifies district and city name casing variations and spelling typos into Canonical Title Case.
// Preserves cities/districts (e.g. Jamshedpur, Itanagar, Guwahati) under their own clean Title Case names.
// Preserves critical placeholders: '0' (Unassigned / Pending) and 'VERBAL'.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Universal multi-word Title Casing helper.
 * Handles hyphens, slashes, periods, and multiple spaces cleanly.
 */
export function toTitleCase(str) {
  if (str == null) return '';
  const s = String(str).trim();
  if (!s) return '';
  if (s === '0' || s === '0.0') return '0';
  if (s.toUpperCase() === 'VERBAL') return 'VERBAL';
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s\-\/\.])([a-z])/g, (_, boundary, char) => boundary + char.toUpperCase());
}

/**
 * Generates an alphanumeric lowercase slug for O(1) hash lookups.
 */
export function distSlug(name) {
  if (name == null) return '';
  return String(name)
    .toLowerCase()
    .replace(/district\s*$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Spelling typo, synonym, and compound alias mapping table.
 * Distinct cities (e.g. Jamshedpur, Itanagar, Guwahati, Siliguri, Asansol, Durgapur, Rourkela, etc.)
 * map to their OWN clean Title Case names rather than being collapsed into parent districts.
 */
export const CANONICAL_DISTRICTS = {
  // ── West Bengal Aliases & Typo Normalizations ──
  'kolkata':                 'Kolkata',
  'calcutta':                'Kolkata',
  'howrah':                  'Howrah',
  'haorah':                  'Howrah',
  'haora':                   'Howrah',
  'hooghly':                 'Hooghly',
  'hugli':                   'Hooghly',
  'hugly':                   'Hooghly',
  'north24parganas':         'North 24 Parganas',
  '24parganasnorth':         'North 24 Parganas',
  '24paraganasnorth':        'North 24 Parganas',
  'north24paraganas':        'North 24 Parganas',
  'north24pgs':              'North 24 Parganas',
  '24pgsnorth':              'North 24 Parganas',
  'northtwentyfourparganas': 'North 24 Parganas',
  'n24parganas':             'North 24 Parganas',
  'south24parganas':         'South 24 Parganas',
  '24parganassouth':         'South 24 Parganas',
  '24paraganassouth':        'South 24 Parganas',
  'south24paraganas':        'South 24 Parganas',
  'south24pgs':              'South 24 Parganas',
  '24pgssouth':              'South 24 Parganas',
  'southtwentyfourparganas': 'South 24 Parganas',
  's24parganas':             'South 24 Parganas',
  'purbamedinipur':          'Purba Medinipur',
  'medinipureast':           'Purba Medinipur',
  'eastmedinipur':           'Purba Medinipur',
  'eastmidnapore':           'Purba Medinipur',
  'eastmidnapur':            'Purba Medinipur',
  'midnaporeast':            'Purba Medinipur',
  'midnapureast':            'Purba Medinipur',
  'purbamidnapore':          'Purba Medinipur',
  'purbamidnapur':           'Purba Medinipur',
  'purgamedinipur':          'Purba Medinipur',
  'paschimmedinipur':        'Paschim Medinipur',
  'medinipurwest':           'Paschim Medinipur',
  'westmedinipur':           'Paschim Medinipur',
  'westmidnapore':           'Paschim Medinipur',
  'westmidnapur':            'Paschim Medinipur',
  'midnaporwest':            'Paschim Medinipur',
  'midnapurwest':            'Paschim Medinipur',
  'paschimmidnapore':        'Paschim Medinipur',
  'paschimmidnapur':         'Paschim Medinipur',
  'midnapur':                'Paschim Medinipur',
  'jhargram':                'Jhargram',
  'bankura':                 'Bankura',
  'purulia':                 'Purulia',
  'puruliya':                'Purulia',
  'purbabardhaman':          'Purba Bardhaman',
  'eastbardhaman':           'Purba Bardhaman',
  'eastburdwan':             'Purba Bardhaman',
  'purpaburdwan':            'Purba Bardhaman',
  'purbaburdwan':            'Purba Bardhaman',
  'bardhaman':               'Purba Bardhaman',
  'burdwan':                 'Purba Bardhaman',
  'paschimbardhaman':        'Paschim Bardhaman',
  'westbardhaman':           'Paschim Bardhaman',
  'westburdwan':             'Paschim Bardhaman',
  'paschimburdwan':          'Paschim Bardhaman',
  'birbhum':                 'Birbhum',
  'murshidabad':             'Murshidabad',
  'nadia':                   'Nadia',
  'nadiya':                  'Nadia',
  'malda':                   'Malda',
  'maldah':                  'Malda',
  'uttardinajpur':           'Uttar Dinajpur',
  'northdinajpur':           'Uttar Dinajpur',
  'dinajpuruttar':           'Uttar Dinajpur',
  'dakshindinajpur':         'Dakshin Dinajpur',
  'southdinajpur':           'Dakshin Dinajpur',
  'dinajpurdakshin':         'Dakshin Dinajpur',
  'jalpaiguri':              'Jalpaiguri',
  'alipurduar':              'Alipurduar',
  'alipurduars':             'Alipurduar',
  'coochbehar':              'Cooch Behar',
  'coochbihar':              'Cooch Behar',
  'kochbihar':               'Cooch Behar',
  'kochbehar':               'Cooch Behar',
  'darjeeling':              'Darjeeling',
  'kalimpong':               'Kalimpong',

  // ── Jharkhand Aliases ──
  'eastsinghbhum':           'East Singhbhum',
  'purbisinghbhum':          'East Singhbhum',
  'purbisinghbhoom':         'East Singhbhum',
  'eastsinghbhoom':          'East Singhbhum',
  'westsinghbhum':           'West Singhbhum',
  'paschimisinghbhum':       'West Singhbhum',
  'paschimisinghbhoom':      'West Singhbhum',
  'westsinghbhoom':          'West Singhbhum',
  'saraikelakharsawan':      'Saraikela Kharsawan',
  'seraikelakharsawan':      'Saraikela Kharsawan',
  'seraikela':               'Saraikela Kharsawan',
  'saraikela':               'Saraikela Kharsawan',
  'hazaribagh':              'Hazaribagh',
  'hazaribag':               'Hazaribagh',
  'sahibganj':               'Sahibganj',
  'sahebganj':               'Sahibganj',
  'kodarma':                 'Kodarma',
  'koderma':                 'Kodarma',

  // ── Odisha Aliases ──
  'khordha':                 'Khordha',
  'khurda':                  'Khordha',
  'cuttack':                 'Cuttack',
  'cuttuck':                 'Cuttack',
  'baleshwar':               'Baleshwar',
  'balasore':                'Baleshwar',
  'baleswar':                'Baleshwar',
  'sundargarh':              'Sundargarh',
  'sundergarh':              'Sundargarh',
  'jajpur':                  'Jajpur',
  'jajapur':                 'Jajpur',
  'angul':                   'Angul',
  'anugul':                  'Angul',
  'jagatsinghpur':           'Jagatsinghpur',
  'jagatsinghapur':          'Jagatsinghpur',
  'kendrapara':              'Kendrapara',
  'kendraparha':             'Kendrapara',
  'balangir':                'Balangir',
  'bolangir':                'Balangir',
  'bargarh':                 'Bargarh',
  'baragarh':                'Bargarh',
  'subarnapur':              'Subarnapur',
  'sonepur':                 'Subarnapur',
  'kendujhar':               'Kendujhar',
  'keonjhar':                'Kendujhar',

  // ── Bihar Aliases ──
  'purnia':                  'Purnia',
  'purnea':                  'Purnia',
  'eastchamparan':           'East Champaran',
  'purbichamparan':          'East Champaran',
  'westchamparan':           'West Champaran',
  'paschimchamparan':        'West Champaran',

  // ── Assam & North East Aliases ──
  'kamrupmetropolitan':      'Kamrup Metropolitan',
  'kamrupmetro':             'Kamrup Metropolitan',
  'kamrup':                  'Kamrup',
  'kamruprural':             'Kamrup',
  'imphalwest':              'Imphal West',
  'westimphal':              'Imphal West',
  'imphaleast':              'Imphal East',
  'eastimphal':              'Imphal East',

  // ── Uttar Pradesh Aliases ──
  'kanpurnagar':             'Kanpur Nagar',
  'kanpurdehat':             'Kanpur Dehat',
  'prayagraj':               'Prayagraj',
  'allahabad':               'Prayagraj',
  'gautambuddhanagar':       'Gautam Buddha Nagar',
  'ayodhya':                 'Ayodhya',
  'faizabad':                'Ayodhya',

  // ── Rajasthan & Chhattisgarh & MP Aliases ──
  'sriganganagar':           'Sri Ganganagar',
  'ganganagar':              'Sri Ganganagar',
  'jhunjhunu':               'Jhunjhunu',
  'junjhunu':                'Jhunjhunu',
  'kabirdham':               'Kabirdham',
  'kawardha':                'Kabirdham',
  'janjgirchampa':           'Janjgir-Champa',
  'gaurelapendramarwahi':    'Gaurela-Pendra-Marwahi',
};

/**
 * Normalizes a raw district name string.
 * Preserves placeholders: '0' and 'VERBAL'.
 * Cleans whitespace and trailing 'District'.
 * Returns canonical Title Case or converts unlisted string to Title Case.
 */
export function normalizeDistrict(rawName, canonicalState) {
  if (rawName == null || rawName === '') return '';
  const s = String(rawName).trim();
  if (s === '0' || s === '0.0') return '0';
  if (s.toUpperCase() === 'VERBAL') return 'VERBAL';

  const stripped = s.replace(/\s+district\s*$/i, '').trim();
  if (!stripped || stripped === '0' || stripped === '0.0') return '0';
  if (stripped.toUpperCase() === 'VERBAL') return 'VERBAL';

  const slug = distSlug(stripped);
  if (CANONICAL_DISTRICTS[slug]) {
    return CANONICAL_DISTRICTS[slug];
  }

  return toTitleCase(stripped);
}

/**
 * Checks if a given district identifier is one of the valid placeholders.
 */
export function isDistrictPlaceholder(name) {
  if (name == null) return false;
  const s = String(name).trim();
  return s === '0' || s === '0.0' || s.toUpperCase() === 'VERBAL';
}

/**
 * Returns a human-friendly string for dropdowns and table displays.
 */
export function formatDistrictDisplay(name) {
  if (name == null) return '';
  const s = String(name).trim();
  if (s === '0' || s === '0.0') return '0 (Unassigned / Pending)';
  if (s.toUpperCase() === 'VERBAL') return 'VERBAL (Verbal Orders)';
  return s;
}

/**
 * Normalizes a single district string into an array of candidate uppercase aliases for legacy user matching.
 */
export function normalizeDistrictCandidates(distName) {
  if (distName == null || distName === '') return [];
  const s = String(distName).trim();
  const canonical = normalizeDistrict(s);
  const upper = canonical.toUpperCase();
  const rawUpper = s.toUpperCase();

  const candidates = new Set([upper, rawUpper]);
  const slug = distSlug(s);

  Object.keys(CANONICAL_DISTRICTS).forEach(aliasSlug => {
    if (CANONICAL_DISTRICTS[aliasSlug] === canonical) {
      candidates.add(CANONICAL_DISTRICTS[aliasSlug].toUpperCase());
    }
  });

  return Array.from(candidates);
}

/**
 * Normalizes an array of assigned district names into a comprehensive set of matching uppercase names.
 */
export function getNormalizedDistrictSet(districtsArray) {
  if (!Array.isArray(districtsArray)) return new Set();
  const set = new Set();
  districtsArray.forEach(d => {
    const candidates = normalizeDistrictCandidates(d);
    candidates.forEach(c => set.add(c));
  });
  return set;
}

/**
 * Checks if a dataset district matches an assigned user district set.
 */
export function matchesAssignedDistrict(datasetDistrict, assignedSet) {
  if (datasetDistrict == null || datasetDistrict === '' || !assignedSet || assignedSet.size === 0) return false;
  const norm = normalizeDistrict(datasetDistrict).toUpperCase();
  if (assignedSet.has(norm)) return true;

  const rawUpper = String(datasetDistrict).trim().toUpperCase();
  if (assignedSet.has(rawUpper)) return true;

  const candidates = normalizeDistrictCandidates(datasetDistrict);
  return candidates.some(c => assignedSet.has(c));
}
