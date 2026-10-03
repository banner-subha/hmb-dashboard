import { scopeVisitDataForUser } from '../src/utils/visits.js';

let passed = 0;
let failed = 0;

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}\n  got: ${a}\n  exp: ${e}`);
  }
}

const mockData = {
  dealers: [
    { dealer: 'ESSTO ENTERPRISE', state: 'West Bengal', district: 'Purba Bardhaman', curVisits: 10, quadrant: 'GROWTH_DRIVER' },
    { dealer: 'KOLKATA STEEL', state: 'West Bengal', district: 'Kolkata', curVisits: 5, quadrant: 'ORGANIC' },
    { dealer: 'PATNA TRADERS', state: 'Bihar', district: 'Patna', curVisits: 12, quadrant: 'RED_FLAG' },
    { dealer: 'RANCHI METALS', state: 'Jharkhand', district: 'Ranchi', curVisits: 8, quadrant: 'NEGLECTED' },
    { dealer: 'MISTAGGED AGRA', state: 'West Bengal', district: 'Agra', curVisits: 3, quadrant: 'NO_SALES_LINK' },
  ],
  districts: [
    { district: 'Purba Bardhaman', state: 'West Bengal', curFabricatorVisits: 100 },
    { district: 'Kolkata', state: 'West Bengal', curFabricatorVisits: 50 },
    { district: 'Patna', state: 'Bihar', curFabricatorVisits: 80 },
    { district: 'Ranchi', state: 'Jharkhand', curFabricatorVisits: 40 },
    { district: 'Agra', state: 'West Bengal', curFabricatorVisits: 20 }, // Mislabeled district
  ],
  employees: [
    { employee_name: 'Prakash Roy', totalVisits: 200 },
    { employee_name: 'Bihar Rep', totalVisits: 150 },
  ],
  summary: {
    curTotalVisits: 428,
    curDealerVisits: 38,
    curFabricatorVisits: 290,
    totalDealersTracked: 5,
    activeDealersVisited: 5,
  }
};

const adminUser = { role: 'admin', username: 'admin' };
const priyaDasUser = {
  role: 'client',
  username: 'priyadas',
  states: ['WB'],
  districts: [
    'ALIPURDUAR', 'BANKURA', 'BIRBHUM', 'COOCHBEHAR', 'DAKSHIN DINAJPUR', 'DARJEELING',
    'HOOGHLY', 'HOWRAH', 'JALPAIGURI', 'JHARGRAM', 'KALIMPONG', 'KOLKATA', 'MALDAH',
    'MEDINIPUR EAST', 'MEDINIPUR WEST', 'MURSHIDABAD', 'NADIA', 'NORTH 24 PARGANAS',
    'PASCHIM BARDHAMAN', 'PURBA BARDHAMAN', 'PURULIA', 'SOUTH 24 PARGANAS', 'UTTAR DINAJPUR'
  ]
};

// 1. Admin sees everything
const adminScoped = scopeVisitDataForUser(mockData, adminUser);
eq('admin sees all dealers', adminScoped.dealers.length, 5);
eq('admin sees all districts', adminScoped.districts.length, 5);

// 2. Priya Das sees ONLY West Bengal genuine districts and dealers
const priyaScoped = scopeVisitDataForUser(mockData, priyaDasUser);
eq('Priya Das sees only 2 WB dealers', priyaScoped.dealers.length, 2);
eq('Priya Das dealer names', priyaScoped.dealers.map(d => d.dealer), ['ESSTO ENTERPRISE', 'KOLKATA STEEL']);
eq('Priya Das sees only 2 WB districts (Agra, Patna, Ranchi filtered out)', priyaScoped.districts.length, 2);
eq('Priya Das district names', priyaScoped.districts.map(d => d.district), ['Purba Bardhaman', 'Kolkata']);

// 3. Summary metrics accurately recalculated for West Bengal
eq('Priya Das dealer visits', priyaScoped.summary.curDealerVisits, 15);
eq('Priya Das fabricator visits', priyaScoped.summary.curFabricatorVisits, 150);
eq('Priya Das total visits', priyaScoped.summary.curTotalVisits, 165);
eq('Priya Das total tracked dealers', priyaScoped.summary.totalDealersTracked, 2);
eq('Priya Das active visited dealers', priyaScoped.summary.activeDealersVisited, 2);
eq('Priya Das coverage pct', priyaScoped.summary.dealerCoveragePct, 100);

// 4. MoM base is the territory's same-days count, not the national one
const withPrev = {
  ...mockData,
  dealers: mockData.dealers.map(d => ({ ...d, prevVisitsMtd: 4 })),
  districts: mockData.districts.map(d => ({ ...d, prevFabricatorVisitsMtd: 30 })),
  summary: { ...mockData.summary, prevTotalVisits: 17680 },
};
eq('Priya Das prev total (2 dealers × 4 + 2 districts × 30)', scopeVisitDataForUser(withPrev, priyaDasUser).summary.prevTotalVisits, 68);
eq('no prev visits in territory means no trend', priyaScoped.summary.prevTotalVisits, null);

// 5. Priya Shaw multi-state scoping (Uttar Pradesh + West Bengal)
import { CLIENT_USERS } from '../src/data/clientRegistry.js';
const regPriyaShaw = CLIENT_USERS.find(u => u.name === 'PRIYA SHAW');
eq('Priya Shaw registered with UTTARPRADESH in states', regPriyaShaw.states.includes('UTTARPRADESH'), true);
eq('Priya Shaw registered with VARANASI in districts', regPriyaShaw.districts.includes('VARANASI'), true);
eq('Priya Shaw registered with LUCKNOW in districts', regPriyaShaw.districts.includes('LUCKNOW'), true);
eq('Priya Shaw registered with JHARGRAM in districts', regPriyaShaw.districts.includes('JHARGRAM'), true);

const priyaShawMockData = {
  dealers: [
    { dealer: 'MEDINIPUR STEEL', state: 'West Bengal', district: 'Medinipur West', curVisits: 10, quadrant: 'GROWTH_DRIVER' },
    { dealer: 'KOLKATA STEEL', state: 'West Bengal', district: 'Kolkata', curVisits: 5, quadrant: 'ORGANIC' },
    { dealer: 'VARANASI TRADERS', state: 'Uttar Pradesh', district: 'Varanasi', curVisits: 15, quadrant: 'GROWTH_DRIVER' },
    { dealer: 'PATNA TRADERS', state: 'Bihar', district: 'Patna', curVisits: 12, quadrant: 'RED_FLAG' },
  ],
  districts: [
    { district: 'Medinipur West', state: 'West Bengal', curFabricatorVisits: 60 },
    { district: 'Kolkata', state: 'West Bengal', curFabricatorVisits: 50 },
    { district: 'Varanasi', state: 'Uttar Pradesh', curFabricatorVisits: 120 },
    { district: 'Patna', state: 'Bihar', curFabricatorVisits: 80 },
  ],
  employees: [
    { employee_name: 'Priya Rep', totalVisits: 100 },
  ],
  summary: {
    curTotalVisits: 337,
    curDealerVisits: 42,
    curFabricatorVisits: 310,
    totalDealersTracked: 4,
    activeDealersVisited: 4,
  }
};

const priyaShawUser = {
  role: 'client',
  username: 'priyashaw',
  states: regPriyaShaw.states,
  districts: regPriyaShaw.districts,
};

const priyaShawScoped = scopeVisitDataForUser(priyaShawMockData, priyaShawUser);
eq('Priya Shaw sees Medinipur and Varanasi dealers (Kolkata and Patna filtered out)', priyaShawScoped.dealers.length, 2);
eq('Priya Shaw dealer names', priyaShawScoped.dealers.map(d => d.dealer), ['MEDINIPUR STEEL', 'VARANASI TRADERS']);
eq('Priya Shaw sees Medinipur and Varanasi districts', priyaShawScoped.districts.length, 2);
eq('Priya Shaw district names', priyaShawScoped.districts.map(d => d.district), ['Medinipur West', 'Varanasi']);
eq('Priya Shaw dealer visits', priyaShawScoped.summary.curDealerVisits, 25);
eq('Priya Shaw fabricator visits', priyaShawScoped.summary.curFabricatorVisits, 180);
eq('Priya Shaw total visits', priyaShawScoped.summary.curTotalVisits, 205);
eq('Priya Shaw dealer coverage pct', priyaShawScoped.summary.dealerCoveragePct, 100);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\nAll ${passed} tests passed!`);
