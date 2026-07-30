/**
 * Pending Orders Utility Module
 * 
 * Centralizes the logic for monthly pending-order distributions.
 */

export function getPendingForPeriod(entity, periodKey) {
  if (!entity) return 0;
  // If period is ALL or not specified, fallback to all-time total pendingQty
  if (periodKey === 'ALL' || !periodKey) {
    return entity.pendingQty ?? 0;
  }
  return entity.pendingHistory?.[periodKey] ?? 0;
}

export function getTotalPendingForPeriod(entities, periodKey) {
  return (entities || []).reduce((sum, e) => sum + getPendingForPeriod(e, periodKey), 0);
}

export function getSharePctForPeriod(entity, periodKey, totalForPeriod) {
  if (!totalForPeriod) return 0;
  return Math.round((getPendingForPeriod(entity, periodKey) / totalForPeriod) * 100);
}

export function getBacklogClearance(pendingQty = 0, dailyAvgQty = 0) {
  const pending = Number(pendingQty) || 0;
  const dailyAvg = Number(dailyAvgQty) || 0;
  if (pending <= 0) {
    return { days: 0, text: '0 days (Clear)', status: 'CLEAR' };
  }
  if (dailyAvg <= 0) {
    return { days: 999, text: 'Stalled (No Pace)', status: 'AT_RISK' };
  }
  const days = pending / dailyAvg;
  let status = 'ON_TRACK';
  if (days > 15) status = 'CRITICAL';
  else if (days > 7) status = 'AT_RISK';
  else if (days > 3) status = 'MONITOR';
  return {
    days,
    text: `${days.toFixed(1)} days`,
    status
  };
}

export function isAgingPeriod(periodKey, availableMonths) {
  if (!periodKey || periodKey === 'ALL') return false;
  const idx = (availableMonths || []).findIndex(m => m.periodKey === periodKey);
  return idx >= 2; // Index 0 is current, Index 1 is ~30 days, Index 2+ is >=60 days
}

export function getPendingAvailableMonths(rawData) {
  if (!rawData) return [];
  if (rawData.pendingAvailableMonths) return rawData.pendingAvailableMonths;

  // Extract all unique period keys from pendingHistory across states & districts
  const keys = new Set();
  (rawData.states || []).forEach(s => {
    if (s.pendingHistory) Object.keys(s.pendingHistory).forEach(k => keys.add(k));
  });
  (rawData.districts || []).forEach(d => {
    if (d.pendingHistory) Object.keys(d.pendingHistory).forEach(k => keys.add(k));
  });

  // Fall back to availableMonths at root if pendingHistory yields nothing
  if (keys.size === 0 && rawData.availableMonths) {
    return rawData.availableMonths;
  }

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return Array.from(keys).sort().reverse().map(pk => {
    const [yearStr, monthStr] = pk.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const label = `${months[month - 1]} ${year}`;
    return { periodKey: pk, year, month, label };
  });
}
