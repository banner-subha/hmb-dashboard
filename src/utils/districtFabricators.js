// Shapes query_district_fabricators for the district panel.
//
// Pure, and the role lookup comes in as a function, so this runs under node in
// scripts/test-district-fabricators.mjs without the app's other modules.

const byVisits = (a, b) =>
  b.visits - a.visits ||
  String(b.last_visit || '').localeCompare(String(a.last_visit || '')) ||
  a.name.localeCompare(b.name);

/**
 * { fabricators, reps, totals } for one district.
 *
 * role    'ALL', 'KRM', 'KRO' or 'OTHER'. A fabricator stays if a rep of that
 *         role visited it, and its visit count becomes that role's visits.
 * query   matches a fabricator, district or state name (all its reps stay) or a
 *         rep name (only that rep stays), case-insensitively.
 *
 * Each fabricator keeps its `state` and `district`: with "All districts" or
 * "All states" one list spans many districts, and the same name in two
 * districts is two fabricators.
 *
 * leadsOnly keeps only fabricators with a 'new lead' visit in the period.
 *
 * Visit counts are always the sum over the reps kept, which is the RPC's own
 * total when nothing is filtered out.
 */
export function shapeDistrictFabricators(payload, roleOf, { role = 'ALL', query = '', leadsOnly = false } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const fabricators = [];
  const repMap = new Map();

  for (const f of payload?.fabricators || []) {
    if (leadsOnly && !(f.new_lead_visits > 0)) continue;
    const fabHit = !q || [f.name, f.district, f.state]
      .some(v => String(v || '').toLowerCase().includes(q));
    const reps = (f.reps || [])
      .map(r => ({ name: r.name, visits: r.visits, role: roleOf(r.name) }))
      .filter(r => (role === 'ALL' || r.role === role) &&
                   (fabHit || r.name.toLowerCase().includes(q)));
    if (reps.length === 0) continue;

    const visits = reps.reduce((s, r) => s + r.visits, 0);
    fabricators.push({ ...f, visits, reps });

    for (const r of reps) {
      let entry = repMap.get(r.name);
      if (!entry) {
        entry = { name: r.name, role: r.role, visits: 0, fabricators: [] };
        repMap.set(r.name, entry);
      }
      entry.visits += r.visits;
      entry.fabricators.push({
        name: f.name, state: f.state, district: f.district, visits: r.visits, last_visit: f.last_visit,
        new_lead_visits: f.new_lead_visits, first_lead: f.first_lead,
      });
    }
  }

  fabricators.sort(byVisits);
  const reps = [...repMap.values()]
    .map(r => ({ ...r, fabricators: r.fabricators.sort(byVisits) }))
    .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));

  return {
    fabricators,
    reps,
    totals: {
      visits: fabricators.reduce((s, f) => s + f.visits, 0),
      fabricators: fabricators.length,
      reps: reps.length,
    },
  };
}
