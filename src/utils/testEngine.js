import { getBusinessImpact } from './trendEngine.js';

const stateTestCases = [
  { name: 'West Bengal (Core growing +7.4%)', cur: 6846.55, prev: 6376.34, sharePct: 56.9, level: 'STATE', expectedMtd: 11258, lossFlag: 'BEHIND', lossDeltaPct: -17.1 },
  { name: 'Jharkhand (Core drop -23.4%)', cur: 1386.65, prev: 1809.12, sharePct: 11.5, level: 'STATE', expectedMtd: 2587, lossFlag: 'BEHIND', lossDeltaPct: -26.9 },
  { name: 'Uttar Pradesh (Massive drop -77%)', cur: 478.86, prev: 2111.88, sharePct: 4.0, level: 'STATE', expectedMtd: 3437, lossFlag: 'BEHIND', lossDeltaPct: -81.0 },
  { name: 'Assam (Core drop -16.7%)', cur: 1084.1, prev: 1300.7, sharePct: 9.0, level: 'STATE', expectedMtd: 2002, lossFlag: 'BEHIND', lossDeltaPct: -26.2 },
  { name: 'Odisha (Core flat -0.9%, ahead)', cur: 1346.47, prev: 1358.84, sharePct: 11.2, level: 'STATE', expectedMtd: 1745, lossFlag: 'AHEAD', lossDeltaPct: 5.2 },
  { name: 'Tripura (Low vol, dropped -59%)', cur: 34.84, prev: 85.21, sharePct: 0.3, level: 'STATE', expectedMtd: 201, lossFlag: 'BEHIND', lossDeltaPct: -76.4 },
  { name: 'Arunachal Pradesh (Low vol, 0 MT)', cur: 0, prev: 70.54, sharePct: 0.0, level: 'STATE', expectedMtd: 31.8, lossFlag: 'BEHIND', lossDeltaPct: -100 },
  { name: 'Rajasthan (Fringe, 0 MT)', cur: 0, prev: 35.11, sharePct: 0.0, level: 'STATE', expectedMtd: 21.9, lossFlag: 'BEHIND', lossDeltaPct: -100 },
  { name: 'Manipur (Fringe, 0 MT)', cur: 0, prev: 8.17, sharePct: 0.0, level: 'STATE', expectedMtd: 3.6, lossFlag: 'BEHIND', lossDeltaPct: -100 },
];

console.log('=== State Scorer Verification ===');
stateTestCases.forEach(tc => {
  const result = getBusinessImpact(tc.cur, tc.prev, tc.sharePct, tc.level, '', tc.expectedMtd, tc.lossFlag, tc.lossDeltaPct);
  console.log(`${tc.name.padEnd(35)} | cur: ${String(tc.cur).padEnd(8)} | prev: ${String(tc.prev).padEnd(8)} | tag: ${result.theme.severity.padEnd(8)} | score: ${result.impactScore}`);
});

const districtTestCases = [
  { name: 'Jhansi (District -53.2% drop)', cur: 92.21, prev: 197.03, sharePct: 0.41, level: 'DISTRICT' },
  { name: 'Mau (District -79.8% drop)', cur: 6.04, prev: 29.9, sharePct: 0.027, level: 'DISTRICT' },
  { name: 'District collapsed (prev 15 MT)', cur: 0, prev: 15, sharePct: 0.0, level: 'DISTRICT' },
  { name: 'District collapsed (prev 60 MT)', cur: 0, prev: 60, sharePct: 0.0, level: 'DISTRICT' },
  { name: 'Tiny District -83% drop', cur: 1, prev: 6, sharePct: 0.005, level: 'DISTRICT' },
];

console.log('\n=== District Scorer Verification ===');
districtTestCases.forEach(tc => {
  const result = getBusinessImpact(tc.cur, tc.prev, tc.sharePct, tc.level);
  console.log(`${tc.name.padEnd(35)} | cur: ${String(tc.cur).padEnd(8)} | prev: ${String(tc.prev).padEnd(8)} | tag: ${result.theme.severity.padEnd(8)} | score: ${result.impactScore}`);
});

const dealerTestCases = [
  { name: 'Dealer completely collapsed (142 MT)', cur: 0, prev: 142, sharePct: 0.8 },
  { name: 'Dealer declining -44% (405 MT)', cur: 225, prev: 405, sharePct: 1.2 },
  { name: 'Dealer growing +49%', cur: 90, prev: 60, sharePct: 0.5 },
  { name: 'Small dealer collapsed (0.92 MT)', cur: 0, prev: 0.92, sharePct: 0.01 }
];

console.log('\n=== Dealer Scorer Verification ===');
dealerTestCases.forEach(tc => {
  const result = getBusinessImpact(tc.cur, tc.prev, tc.sharePct, 'DEALER');
  console.log(`${tc.name.padEnd(36)} | cur: ${String(tc.cur).padEnd(8)} | prev: ${String(tc.prev).padEnd(8)} | tag: ${result.theme.severity.padEnd(8)} | score: ${result.impactScore}`);
});
