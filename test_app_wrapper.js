import { sampleData } from './src/data/sampleData.js';
import { calculateMoM, getBusinessImpact } from './src/utils/trendEngine.js';

try {
  console.log("Simulating GeoIntelligenceWrapper...");
  
  // Build states map
  const states = {};
  (sampleData.states || []).forEach((s) => {
    if (!s.state) return;
    const cur = s.cur ?? 0;
    const prev = s.prev ?? 0;
    const mom = calculateMoM(cur, prev);
    const { impactScore, severity, theme } = getBusinessImpact(cur, prev, s.share ?? 0, 'STATE', s.state);

    const orderCur = s.orderCur ?? 0;
    const orderPrev = s.orderPrev ?? 0;
    const orderMoM = calculateMoM(orderCur, orderPrev);
    const orderImpact = getBusinessImpact(orderCur, orderPrev, 0, 0);

    states[s.state] = {
      cur,
      prev,
      volume: cur,
      trend: mom,
      impactScore,
      impact: severity,
      impactTier: severity,
      healthStatus: severity,
      healthColor: theme.color,
      slug: s.slug || '',
      orderCur,
      orderPrev,
      orderMoM,
      orderImpactScore: orderImpact.impactScore,
      orderImpactTier: orderImpact.severity,
      orderHealthStatus: orderImpact.severity,
      orderHealthColor: orderImpact.theme.color,
    };
  });
  console.log("States mapped successfully. Count:", Object.keys(states).length);

  // Build districts map
  const districts = {};
  const totalCur = sampleData.totalCur ?? 0;
  (sampleData.districts || []).forEach((d) => {
    if (!d.state || !d.district) return;
    if (!districts[d.state]) districts[d.state] = {};
    const cur = d.cur ?? 0;
    const prev = d.prev ?? 0;
    const mom = calculateMoM(cur, prev);
    const share = totalCur > 0 ? (cur / totalCur) * 100 : 0;
    const { impactScore, severity, theme } = getBusinessImpact(cur, prev, share, 'DISTRICT', d.state);

    const orderCur = d.orderCur ?? 0;
    const orderPrev = d.orderPrev ?? 0;
    const orderMoM = calculateMoM(orderCur, orderPrev);
    const orderImpact = getBusinessImpact(orderCur, orderPrev, 0, 0);

    districts[d.state][d.district] = {
      lookupKey: d.lookupKey,
      cur,
      prev,
      volume: cur,
      trend: mom,
      impactScore,
      impact: severity,
      slug: d.slug || '',
      impactTier: severity,
      healthStatus: severity,
      healthColor: theme.color,
      orderCur,
      orderPrev,
      orderMoM,
      orderImpactScore: orderImpact.impactScore,
      orderImpactTier: orderImpact.severity,
      orderHealthStatus: orderImpact.severity,
      orderHealthColor: orderImpact.theme.color,
    };
  });
  console.log("Districts mapped successfully. States count:", Object.keys(districts).length);
  
  console.log("SUCCESS: Simulated App.jsx wrapper logic completed without errors!");
} catch (e) {
  console.error("FAILURE in App.jsx wrapper logic simulation:", e);
}
