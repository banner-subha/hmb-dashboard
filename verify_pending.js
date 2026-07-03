// Run with: node verify_pending.js
// Checks if pendingTotal === sum(states[].pending) === sum(districts[].pending) === sum(dealers[].pending)

const URL = 'https://hubydueitefxxxrbpnjk.supabase.co/storage/v1/object/public/dashboard-data/latest.json';

fetch(URL)
  .then(res => res.json())
  .then(data => {
    const stateSum    = (data.states    || []).reduce((s, x) => s + (x.pendingQty || 0), 0);
    const districtSum = (data.districts || []).reduce((s, x) => s + (x.pendingQty || 0), 0);
    const dealerSum   = (data.dealers   || []).reduce((s, x) => s + (x.pendingQty || 0), 0);

    console.log('--- PENDING TOTAL VERIFICATION ---');
    console.log('root pendingTotal       :', data.pendingTotal);
    console.log('sum(states[].pendingQty):', Math.round(stateSum * 100) / 100, '| diff:', Math.round((data.pendingTotal - stateSum) * 100) / 100);
    console.log('sum(districts[].pendingQty):', Math.round(districtSum * 100) / 100, '| diff:', Math.round((data.pendingTotal - districtSum) * 100) / 100);
    console.log('sum(dealers[].pendingQty):', Math.round(dealerSum * 100) / 100, '| diff:', Math.round((data.pendingTotal - dealerSum) * 100) / 100);

    if (Math.abs(data.pendingTotal - stateSum) > 0.5) {
      console.log('\n⚠️  STATE-LEVEL MISMATCH — states present in latest.json:');
      console.log(data.states.map(s => `${s.state}: ${s.pendingQty}`));
    }

    console.log('\nmeta.generatedAt:', data.meta?.generatedAt || data.generatedAt);
  })
  .catch(err => console.error('Fetch failed:', err.message));
