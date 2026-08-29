import { getBusinessImpact } from './trendEngine.js';

const stateTestCases = [
  { name: 'Large state declining −16%', cur: 9376, prev: 11173, sharePct: 35.0, level: 'STATE' },
  { name: 'Small state declining −56%', cur: 137, prev: 312, sharePct: 1.5, level: 'STATE' },
  { name: 'Mid state declining −14%', cur: 3032, prev: 3510, sharePct: 12.0, level: 'STATE' },
  { name: 'State growing +1%', cur: 1780, prev: 1766, sharePct: 8.0, level: 'STATE' },
];

console.log('=== State Scorer Verification ===');
stateTestCases.forEach(tc => {
  const result = getBusinessImpact(tc.cur, tc.prev, tc.sharePct, tc.level);
  console.log(`${tc.name.padEnd(30)} | cur: ${String(tc.cur).padEnd(5)} | prev: ${String(tc.prev).padEnd(5)} | share: ${String(tc.sharePct).padEnd(4)}% | severity: ${result.severity.padEnd(8)} | score: ${result.impactScore}`);
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
  console.log(`${tc.name.padEnd(30)} | cur: ${String(tc.cur).padEnd(5)} | prev: ${String(tc.prev).padEnd(5)} | share: ${String(tc.sharePct).padEnd(4)}% | severity: ${result.severity.padEnd(8)} | score: ${result.impactScore}`);
});

const dealerTestCases = [
  { name: 'Dealer completely collapsed', cur: 0, prev: 142, sharePct: 0.8 },
  { name: 'Dealer declining -44%', cur: 225, prev: 405, sharePct: 1.2 },
  { name: 'Dealer growing +49%', cur: 90, prev: 60, sharePct: 0.5 },
  { name: 'Small dealer collapsed', cur: 0, prev: 0.92, sharePct: 0.01 }
];

console.log('\n=== Dealer Scorer Verification ===');
dealerTestCases.forEach(tc => {
  const result = getBusinessImpact(tc.cur, tc.prev, tc.sharePct, 'DEALER');
  console.log(`${tc.name.padEnd(30)} | cur: ${String(tc.cur).padEnd(5)} | prev: ${String(tc.prev).padEnd(5)} | share: ${String(tc.sharePct).padEnd(4)}% | severity: ${result.severity.padEnd(8)} | score: ${result.impactScore}`);
});
