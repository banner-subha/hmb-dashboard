import { sampleData } from './src/data/sampleData.js';
import { calculateMoM, getBusinessImpact } from './src/utils/trendEngine.js';

// Setup mock state
const filterState = {
  type: "ALL",
  item: [],
  month: "CURRENT"
};

const totalVolume = { cur: sampleData.totalCur || 1, prev: sampleData.totalPrev || 1 };

try {
  console.log("Simulating GeoIntelligence.jsx filteredSalesData processing...");
  const states = {};
  const districts = {};

  const propSalesData = {
    states: {},
    districts: {}
  };

  // Populate propSalesData from sampleData
  (sampleData.states || []).forEach(s => {
    propSalesData.states[s.state] = s;
  });
  (sampleData.districts || []).forEach(d => {
    if (!propSalesData.districts[d.state]) propSalesData.districts[d.state] = {};
    propSalesData.districts[d.state][d.district] = d;
  });

  // Process States
  Object.entries(propSalesData.states || {}).forEach(([stateName, s]) => {
    let cur = s.cur;
    let prev = s.prev;
    let displayVolume = cur;
    let trend = calculateMoM(cur, prev);
    const sharePct = (cur / (totalVolume.cur || 1)) * 100;

    const { impactScore, severity, theme } = getBusinessImpact(
      cur,
      prev,
      sharePct,
      'STATE',
      stateName
    );

    states[stateName] = {
      ...s,
      name: stateName,
      cur,
      prev,
      volume: displayVolume,
      trend,
      impactScore,
      impact: severity,
      impactTier: severity,
      healthStatus: severity,
      healthColor: theme.color,
    };
  });
  console.log("Processed states successfully. Count:", Object.keys(states).length);

  // Process Districts
  Object.entries(propSalesData.districts || {}).forEach(([stateName, districtMap]) => {
    districts[stateName] = {};
    Object.entries(districtMap).forEach(([districtName, d]) => {
      let cur = d.cur;
      let prev = d.prev;
      let displayVolume = cur;
      let trend = calculateMoM(cur, prev);
      const distShare = (cur / (totalVolume.cur || 1)) * 100;

      const { impactScore, severity, theme } = getBusinessImpact(
        cur,
        prev,
        distShare,
        'DISTRICT',
        stateName
      );

      districts[stateName][districtName] = {
        ...d,
        name: districtName,
        cur,
        prev,
        volume: displayVolume,
        trend,
        impactScore,
        impact: severity,
        impactTier: severity,
        healthStatus: severity,
        healthColor: theme.color,
      };
    });
  });
  console.log("Processed districts successfully. States count:", Object.keys(districts).length);
  
  console.log("SUCCESS: Simulated GeoIntelligence.jsx processing completed without errors!");
} catch (e) {
  console.error("FAILURE in GeoIntelligence.jsx simulation:", e);
}
