// Checks for src/utils/districtFabricators.js. Run: node scripts/test-district-fabricators.mjs
import { shapeDistrictFabricators as shape } from '../src/utils/districtFabricators.js';

let failed = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g === e) return console.log('ok  ', name);
  failed++;
  console.log('FAIL', name, '\n   got', g, '\n   exp', e);
};

const roles = { 'ASHA KRM': 'KRM', 'RAVI KRO': 'KRO', 'RAVI KRO-AGRA': 'KRO' };
const roleOf = name => roles[name] || 'OTHER';

const payload = {
  total_visits: 9,
  fabricators: [
    { name: 'Molla Engineering', visits: 5, last_visit: '2026-09-25',
      reps: [{ name: 'ASHA KRM', visits: 3 }, { name: 'SAYAN', visits: 2 }] },
    { name: 'Arup Gate Grill', visits: 3, last_visit: '2026-09-20',
      reps: [{ name: 'RAVI KRO', visits: 3 }] },
    { name: 'Biswas Welding', visits: 1, last_visit: '2026-09-26',
      reps: [{ name: 'SAYAN', visits: 1 }] },
  ],
};

let s = shape(payload, roleOf);
eq('all roles: totals match the RPC', s.totals, { visits: 9, fabricators: 3, reps: 3 });
eq('all roles: fabricators by visits', s.fabricators.map(f => f.name), ['Molla Engineering', 'Arup Gate Grill', 'Biswas Welding']);
eq('reps tagged with their role', s.fabricators[0].reps.map(r => r.role), ['KRM', 'OTHER']);
eq('by rep: visits summed across fabricators', s.reps.map(r => [r.name, r.visits, r.fabricators.length]),
   [['ASHA KRM', 3, 1], ['RAVI KRO', 3, 1], ['SAYAN', 3, 2]]);
eq('by rep: a rep lists its fabricators by its own visits', s.reps[2].fabricators.map(f => f.name), ['Molla Engineering', 'Biswas Welding']);

s = shape(payload, roleOf, { role: 'KRM' });
eq('KRM: only fabricators a KRM visited', s.fabricators.map(f => f.name), ['Molla Engineering']);
eq('KRM: visit count is the KRM visits only', s.fabricators[0].visits, 3);
eq('KRM: other reps dropped from the chips', s.fabricators[0].reps.map(r => r.name), ['ASHA KRM']);

s = shape(payload, roleOf, { role: 'OTHER' });
eq('Other: field reps only', s.totals, { visits: 3, fabricators: 2, reps: 1 });

s = shape(payload, roleOf, { query: 'arup' });
eq('search by fabricator keeps all its reps', s.fabricators.map(f => [f.name, f.reps.length]), [['Arup Gate Grill', 1]]);
s = shape(payload, roleOf, { query: 'sayan' });
eq('search by rep keeps only that rep', s.reps.map(r => r.name), ['SAYAN']);
eq('search by rep counts only that rep', s.totals, { visits: 3, fabricators: 2, reps: 1 });

const statePayload = {
  fabricators: [
    { name: 'Arup Gate Grill', district: 'HOOGHLY', visits: 2, last_visit: '2026-09-21', reps: [{ name: 'SAYAN', visits: 2 }] },
    { name: 'Arup Gate Grill', district: 'NADIA', visits: 1, last_visit: '2026-09-22', reps: [{ name: 'SAYAN', visits: 1 }] },
  ],
};
s = shape(statePayload, roleOf);
eq('all districts: same name in two districts stays two fabricators', s.totals, { visits: 3, fabricators: 2, reps: 1 });
eq('all districts: district carried to the rep view', s.reps[0].fabricators.map(f => f.district), ['HOOGHLY', 'NADIA']);
s = shape(statePayload, roleOf, { query: 'nadia' });
eq('search matches a district name', s.fabricators.map(f => f.district), ['NADIA']);

s = shape({ fabricators: [
  { name: 'Ma Tara Works', state: 'BIHAR', district: 'PATNA', visits: 1, last_visit: '2026-09-20', reps: [{ name: 'SAYAN', visits: 1 }] },
  { name: 'Ma Tara Works', state: 'WEST BENGAL', district: 'HOOGHLY', visits: 2, last_visit: '2026-09-21', reps: [{ name: 'SAYAN', visits: 2 }] },
] }, roleOf, { query: 'bihar' });
eq('all states: search matches a state name', s.fabricators.map(f => f.state), ['BIHAR']);
eq('all states: state carried to the rep view', s.reps[0].fabricators.map(f => f.state), ['BIHAR']);

s = shape({ fabricators: [
  { name: 'New Shop', visits: 2, last_visit: '2026-09-20', new_lead_visits: 1, first_lead: '2026-09-12', reps: [{ name: 'SAYAN', visits: 2 }] },
] }, roleOf);
eq('new lead kept on the fabricator', [s.fabricators[0].new_lead_visits, s.fabricators[0].first_lead], [1, '2026-09-12']);
eq('new lead carried to the rep view', [s.reps[0].fabricators[0].new_lead_visits, s.reps[0].fabricators[0].first_lead], [1, '2026-09-12']);

s = shape({ fabricators: [
  { name: 'New Shop', visits: 1, last_visit: '2026-09-20', new_lead_visits: 1, reps: [{ name: 'SAYAN', visits: 1 }] },
  { name: 'Old Shop', visits: 5, last_visit: '2026-09-21', new_lead_visits: 0, reps: [{ name: 'SAYAN', visits: 5 }] },
] }, roleOf, { leadsOnly: true });
eq('leads only keeps new-lead fabricators', [s.fabricators.map(f => f.name), s.totals], [['New Shop'], { visits: 1, fabricators: 1, reps: 1 }]);

s = shape(null, roleOf);
eq('empty payload', s.totals, { visits: 0, fabricators: 0, reps: 0 });

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
