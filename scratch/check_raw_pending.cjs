const fs = require('fs');

const csvPath = 'C:\\Users\\admin\\Dropbox\\OFFICE HO\\BI DATA\\SALES DASHBOARD\\pending_export.csv';

if (!fs.existsSync(csvPath)) {
  console.error('File not found:', csvPath);
  process.exit(1);
}

const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/);

const header = lines[0].split(',');
const actualPendingIdx = header.indexOf('ACTUAL PENDING');

let pendingOverall = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const row = [];
  let inQuotes = false;
  let currentVal = '';
  for (let c = 0; c < line.length; c++) {
    const char = line[c];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  row.push(currentVal.trim());

  const pending = parseFloat(row[actualPendingIdx]) || 0;
  if (pending === 0) continue; // New logic
  
  pendingOverall += pending;
}

const fN = n => Math.round(n * 100) / 100;
console.log('--- Verification ---');
console.log('New Sum overall.pending:', pendingOverall);
console.log('New Sum formatted (fN):', fN(pendingOverall));
console.log('Expected:', 9396.85);
console.log('Match:', fN(pendingOverall) === 9396.85);
