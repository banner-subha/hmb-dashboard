import { calculateMoM, getBusinessImpact } from './trendEngine.js';

const testCases = [
  { name: 'Large state declining −16%', cur: 9376, prev: 11173 },
  { name: 'Small state declining −56%', cur: 137, prev: 312 },
  { name: 'Mid state declining −14%', cur: 3032, prev: 3510 },
  { name: 'District zeroed out', cur: 0, prev: 74 },
  { name: 'Active district −29%', cur: 390, prev: 549 },
  { name: 'State growing +1%', cur: 1780, prev: 1766 },
];

testCases.forEach(tc => {
  const result = getBusinessImpact(tc.cur, tc.prev);
  console.log(`${tc.name.padEnd(30)} | cur: ${String(tc.cur).padEnd(5)} | prev: ${String(tc.prev).padEnd(5)} | severity: ${result.severity.padEnd(8)} | score: ${result.impactScore}`);
});
