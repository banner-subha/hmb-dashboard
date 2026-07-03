import fs from 'fs';

const content = fs.readFileSync('src/pages/GeoIntelligence.jsx', 'utf8');

// Let's print out the sections containing .attr("fill"
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('attr("fill"') || l.includes('heatColorScale') || l.includes('HEAT_COLORS') || l.includes('heatMap')) {
    console.log(`Line ${idx + 1}: ${l}`);
  }
});
