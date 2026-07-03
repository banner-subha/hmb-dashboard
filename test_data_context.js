import { sampleData } from './src/data/sampleData.js';
import { getBusinessImpact } from './src/utils/trendEngine.js';

try {
  console.log("Simulating DataContext state processing...");
  const states = sampleData.states || [];
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
  const districts = sampleData.districts || [];
  const dynamicTotalCur = sampleData.totalCur || 1;
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
  const dealers = sampleData.dealers || [];
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
  
  console.log("SUCCESS: Simulated DataContext processing completed without errors!");
} catch (e) {
  console.error("FAILURE in DataContext simulation:", e);
}
