import { calculateMoM, getBusinessImpact } from './src/utils/trendEngine.js';

const DATA_URL = 'https://hubydueitefxxxrbpnjk.supabase.co/storage/v1/object/public/dashboard-data/latest.json';

async function testLive() {
  console.log("Fetching live data from Supabase...");
  const res = await fetch(DATA_URL);
  const rawData = await res.json();
  console.log("Live data fetched successfully.");
  
  console.log("Simulating DataContext state processing...");
  const states = rawData.states || [];
  const processedStates = states.map(s => {
    const { impactScore, severity, theme } = getBusinessImpact(s.cur, s.prev, s.share || 0, 'STATE', s.state);
    return {
      ...s,
      impactScore,
      impactTier: severity,
      healthStatus: severity,
      healthColor: theme.color,
      displayColor: theme.color
    };
  });
  console.log("Processed states count:", processedStates.length);

  console.log("Simulating DataContext district processing...");
  const districts = rawData.districts || [];
  const dynamicTotalCur = rawData.totalCur || 1;
  const processedDistricts = districts.map(dist => {
    const distShare = dynamicTotalCur > 0 ? (dist.cur / dynamicTotalCur) * 100 : 0;
    const { impactScore, severity, theme } = getBusinessImpact(dist.cur, dist.prev, distShare, 'DISTRICT', dist.state);
    return {
      ...dist,
      impactScore,
      impactTier: severity,
      healthStatus: severity,
      healthColor: theme.color,
      displayColor: theme.color
    };
  });
  console.log("Processed districts count:", processedDistricts.length);

  console.log("Simulating DataContext dealer processing...");
  const dealers = rawData.dealers || [];
  const processedDealers = dealers.map(dl => {
    const dealerShare = dynamicTotalCur > 0 ? (dl.cur / dynamicTotalCur) * 100 : 0;
    const { impactScore, severity, theme } = getBusinessImpact(dl.cur, dl.prev, dealerShare, 'DEALER', dl.state);
    return {
      ...dl,
      impactScore,
      impactTier: severity,
      healthStatus: severity,
      healthColor: theme.color,
      displayColor: theme.color
    };
  });
  console.log("Processed dealers count:", processedDealers.length);

  console.log("Simulating GeoIntelligence.jsx wrapper logic on live data...");
  const geoStates = {};
  (rawData.states || []).forEach((s) => {
    if (!s.state) return;
    const cur = s.cur ?? 0;
    const prev = s.prev ?? 0;
    const mom = calculateMoM(cur, prev);
    const { impactScore, severity, theme } = getBusinessImpact(cur, prev, s.share ?? 0, 'STATE', s.state);

    const orderCur = s.orderCur ?? 0;
    const orderPrev = s.orderPrev ?? 0;
    const orderMoM = calculateMoM(orderCur, orderPrev);
    const orderImpact = getBusinessImpact(orderCur, orderPrev, 0, 0);

    geoStates[s.state] = {
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

  const geoDistricts = {};
  (rawData.districts || []).forEach((d) => {
    if (!d.state || !d.district) return;
    if (!geoDistricts[d.state]) geoDistricts[d.state] = {};
    const cur = d.cur ?? 0;
    const prev = d.prev ?? 0;
    const mom = calculateMoM(cur, prev);
    const share = dynamicTotalCur > 0 ? (cur / dynamicTotalCur) * 100 : 0;
    const { impactScore, severity, theme } = getBusinessImpact(cur, prev, share, 'DISTRICT', d.state);

    const orderCur = d.orderCur ?? 0;
    const orderPrev = d.orderPrev ?? 0;
    const orderMoM = calculateMoM(orderCur, orderPrev);
    const orderImpact = getBusinessImpact(orderCur, orderPrev, 0, 0);

    geoDistricts[d.state][d.district] = {
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
  console.log("SUCCESS: Simulated all processing on live data successfully!");
}

testLive().catch(e => {
  console.error("FAILURE in live data simulation:", e);
});
