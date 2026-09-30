import fs from 'fs';
import { canonDealerName, dealerKey, dealerStateKey, buildBusinessPlanDealerIndex, attachDealerSales } from '../src/utils/visits.js';

// Load public/visits_intelligence.json
const raw = fs.readFileSync('./public/visits_intelligence.json', 'utf8');
const data = JSON.parse(raw);
const dealers = data.dealers || [];

console.log('Testing dealer matching and isolation:');

// Test canonDealerName
console.log('canonDealerName tests:');
console.log('  "shree balaji steels" ->', canonDealerName('shree balaji steels'));
console.log('  "SHREE BALAJI STEEL" ->', canonDealerName('SHREE BALAJI STEEL'));
console.log('  "Shree Balaji Enterprises" ->', canonDealerName('Shree Balaji Enterprises'));
console.log('  "Balaji Traders" ->', canonDealerName('Balaji Traders'));

// Filter Balaji dealers
const kolkata = dealers.find(d => 
  (canonDealerName(d.dealer) === 'SHREEBALAJISTEEL') && 
  d.state === 'West Bengal' && 
  d.district === 'Kolkata'
);

const gorakhpur = dealers.find(d => 
  (canonDealerName(d.dealer) === 'SHREEBALAJISTEEL') && 
  d.state === 'Uttar Pradesh' && 
  d.district === 'Gorakhpur'
);

const mau = dealers.find(d => 
  (canonDealerName(d.dealer) === 'SHREEBALAJISTEEL') && 
  d.state === 'Uttar Pradesh' && 
  d.district === 'Mau'
);

console.log('\n--- Kolkata Dealer ---');
console.log('Dealer Name:', kolkata?.dealer);
console.log('State & District:', kolkata?.state, ',', kolkata?.district);
console.log('Cur Visits:', kolkata?.curVisits);
console.log('Primary Rep:', kolkata?.primaryRep);
console.log('Assigned KRM:', kolkata?.assignedKrm);
console.log('Assigned KRO:', kolkata?.assignedKro);
console.log('BP Target:', kolkata?.bpTarget);
console.log('KRM Visits:', JSON.stringify(kolkata?.krmVisits));
console.log('KRO Visits:', JSON.stringify(kolkata?.kroVisits));

console.log('\n--- Gorakhpur Dealer ---');
console.log('Dealer Name:', gorakhpur?.dealer);
console.log('State & District:', gorakhpur?.state, ',', gorakhpur?.district);
console.log('Cur Visits:', gorakhpur?.curVisits);
console.log('Primary Rep:', gorakhpur?.primaryRep);
console.log('Assigned KRM:', gorakhpur?.assignedKrm);
console.log('Assigned KRO:', gorakhpur?.assignedKro);
console.log('BP Target:', gorakhpur?.bpTarget);
console.log('KRM Visits:', JSON.stringify(gorakhpur?.krmVisits));
console.log('KRO Visits:', JSON.stringify(gorakhpur?.kroVisits));

console.log('\n--- Mau Dealer ---');
console.log('Dealer Name:', mau?.dealer);
console.log('State & District:', mau?.state, ',', mau?.district);
console.log('Cur Visits:', mau?.curVisits);

// Verification assertions
if (!kolkata) throw new Error('Kolkata dealer missing!');
if (!gorakhpur) throw new Error('Gorakhpur dealer missing!');
if (kolkata.assignedKrm !== null) throw new Error('Kolkata dealer should not have assigned KRM from UP!');
if (kolkata.assignedKro !== null) throw new Error('Kolkata dealer should not have assigned KRO from UP!');
if (kolkata.bpTarget !== null) throw new Error('Kolkata dealer should not have 10.0 MT UP target!');
if (kolkata.curVisits !== 2) throw new Error('Kolkata visits should be 2!');
if (kolkata.primaryRep !== 'KAUSHIK CHAKRABORTY') throw new Error('Kolkata rep should be Kaushik Chakraborty!');

if (gorakhpur.assignedKrm !== 'PRAKASH CHAND RAJPUT') throw new Error('Gorakhpur KRM should be Prakash Chand Rajput!');
if (gorakhpur.assignedKro !== 'BRIJESH SINGH') throw new Error('Gorakhpur KRO should be Brijesh Singh!');
if (gorakhpur.bpTarget !== 10.0) throw new Error('Gorakhpur target should be 10.0!');
if (gorakhpur.curVisits !== 4) throw new Error('Gorakhpur visits should be 4!');

console.log('\n>>> ALL DEALER MATCHING & ISOLATION CHECKS PASSED! <<<');
