import fs from 'fs';
import { canonDealerName, dealerKey, dealerStateKey, buildBusinessPlanDealerIndex, attachDealerSales } from '../src/utils/visits.js';

// Simulated Business Plan rows
const sampleBpRows = [
  {
    grp: { state: 'Uttar Pradesh', district: 'Gorakhpur', dealer: 'shree Balaji steel' },
    total_sp_target: 10.0,
    total_potential: 20.0
  }
];

const bpIndex = buildBusinessPlanDealerIndex(sampleBpRows);

const sampleDealers = [
  {
    dealer: 'SHREE BALAJI STEELS',
    state: 'West Bengal',
    district: 'Kolkata',
    curVisits: 2,
    salesCur: 0
  },
  {
    dealer: 'shree Balaji steel',
    state: 'Uttar Pradesh',
    district: 'Gorakhpur',
    curVisits: 4,
    salesCur: 0
  }
];

const attached = attachDealerSales(sampleDealers, bpIndex, 27);
console.log('Attached results:');
for (const a of attached) {
  console.log(`- ${a.dealer} (${a.state}, ${a.district}): bpTarget = ${a.bpTarget}, paceStatus = ${a.paceStatus}, quadrant = ${a.quadrant}`);
}

const wb = attached.find(d => d.state === 'West Bengal');
const up = attached.find(d => d.state === 'Uttar Pradesh');

if (wb.bpTarget !== null) throw new Error('West Bengal dealer must NOT have BP target from UP!');
if (up.bpTarget !== 10) throw new Error('UP dealer must have 10.0 MT BP target!');

console.log('\n>>> attachDealerSales state isolation verified! <<<');
