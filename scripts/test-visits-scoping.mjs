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

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\nAll ${passed} tests passed!`);
