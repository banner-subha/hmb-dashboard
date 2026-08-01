import { getData } from '../dataLoader.js';

export function getRootCauseAnalysis({ dimension } = {}, data) {
  const d = data || getData();
  const intel = d.intel || {};

  // Prefer the AI-generated root cause analysis; fall back to intel.declineDrivers.
  let causes = (d.intelligence?.root_cause_analysis) || [];

  if (causes.length === 0 && Array.isArray(intel.declineDrivers)) {
    causes = intel.declineDrivers.map(drv => ({
      dimension: drv.type || 'OVERALL',
      finding: `${drv.name}: ${drv.drop ?? 0} MT volume decline`,
      impact_mt: drv.drop ?? 0,
      pct_of_total_decline: drv.pctOfTotal ?? 0
    }));
  }

  if (dimension) {
    const want = String(dimension).replace(/[\s_]/g, '').toUpperCase();
    causes = causes.filter(c => String(c.dimension || '').replace(/[\s_]/g, '').toUpperCase() === want);
  }

  return {
    count: causes.length,
    dimension: dimension || null,
    causes: causes.map(c => ({
      dimension: c.dimension ?? null,
      finding: c.finding ?? null,
      impact_mt: c.impact_mt ?? 0,
      pct_of_total_decline: c.pct_of_total_decline ?? 0
    }))
  };
}
