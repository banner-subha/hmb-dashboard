// Smart District Normalizer
// Maps spreadsheet/user sheet district name variations to canonical dataset names

const DISTRICT_ALIASES = {
  // 24 Parganas variations
  '24 PARAGANAS NORTH': ['North 24 Parganas', '24 PARAGANAS NORTH'],
  '24 PARGANAS NORTH': ['North 24 Parganas', '24 PARGANAS NORTH'],
  'NORTH 24 PARAGANAS': ['North 24 Parganas'],
  'NORTH 24 PARGANAS': ['North 24 Parganas'],

  '24 PARAGANAS SOUTH': ['South 24 Parganas', '24 PARAGANAS SOUTH'],
  '24 PARGANAS SOUTH': ['South 24 Parganas', '24 PARAGANAS SOUTH'],
  'SOUTH 24 PARAGANAS': ['South 24 Parganas'],
  'SOUTH 24 PARGANAS': ['South 24 Parganas'],

  // Bardhaman variations
  'EAST BARDHAMAN': ['Purba Bardhaman', 'EAST BARDHAMAN'],
  'EAST BURDWAN': ['Purba Bardhaman'],
  'PURBA BARDHAMAN': ['Purba Bardhaman'],
  'PURBA BURDWAN': ['Purba Bardhaman'],

  'WEST BARDHAMAN': ['Paschim Bardhaman', 'WEST BARDHAMAN'],
  'WEST BURDWAN': ['Paschim Bardhaman'],
  'PASCHIM BARDHAMAN': ['Paschim Bardhaman'],
  'PASCHIM BURDWAN': ['Paschim Bardhaman'],

  // Cooch Behar variations
  'COOCHBEHAR': ['Cooch Behar', 'COOCHBEHAR'],
  'COOCH BEHAR': ['Cooch Behar'],

  // Dinajpur variations
  'DINAJPUR UTTAR': ['Uttar Dinajpur', 'DINAJPUR UTTAR'],
  'NORTH DINAJPUR': ['Uttar Dinajpur'],
  'UTTAR DINAJPUR': ['Uttar Dinajpur'],

  'DINAJPUR DAKSHIN': ['Dakshin Dinajpur', 'DINAJPUR DAKSHIN'],
  'SOUTH DINAJPUR': ['Dakshin Dinajpur'],
  'DAKSHIN DINAJPUR': ['Dakshin Dinajpur'],

  // Medinipur variations
  'MEDINIPUR EAST': ['Medinipur East', 'MEDINIPUR EAST'],
  'EAST MIDNAPORE': ['Medinipur East'],
  'MEDINIPUR WEST': ['Medinipur West', 'MEDINIPUR WEST'],
  'WEST MIDNAPORE': ['Medinipur West'],

  // Kalimpong fallback
  'KALIMPONG': ['Kalimpong', 'Darjeeling']
};

/**
 * Normalizes a single district string into an array of matching candidate names.
 * Returns array of uppercase/canonical district names for matching.
 */
export function normalizeDistrictCandidates(distName) {
  if (!distName || typeof distName !== 'string') return [];
  const upper = distName.trim().toUpperCase();

  if (DISTRICT_ALIASES[upper]) {
    return [upper, ...DISTRICT_ALIASES[upper].map(d => d.toUpperCase())];
  }

  return [upper];
}

/**
 * Normalizes an array of assigned district names into a comprehensive array of matching names.
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
  if (!datasetDistrict || !assignedSet || assignedSet.size === 0) return false;
  const dUpper = datasetDistrict.trim().toUpperCase();
  if (assignedSet.has(dUpper)) return true;

  // Check aliases
  const candidates = normalizeDistrictCandidates(datasetDistrict);
  return candidates.some(c => assignedSet.has(c));
}
