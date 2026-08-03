/**
 * Pending Orders Utility Module
 * 
 * Centralizes the logic for monthly pending-order distributions.
 */

export function getPendingForPeriod(entity, periodKey, rawData = null) {
  if (!entity) return 0;
  // If period is ALL or not specified, fallback to all-time total pendingQty
  if (periodKey === 'ALL' || !periodKey) {
    return entity.pendingQty ?? 0;
  }
  if (entity.pendingHistory && entity.pendingHistory[periodKey] !== undefined) {
    return entity.pendingHistory[periodKey];
  }
  // Fallback for current month (e.g. 2026-08) if entity.pendingHistory doesn't have an explicit periodKey entry
  if (rawData?.availableMonths?.length > 0) {
    const curMonthKey = rawData.availableMonths[0]?.periodKey || rawData.availableMonths[0]?.key;
    if (curMonthKey && periodKey === curMonthKey) {
      return entity.pendingQty ?? 0;
    }
  }
  return 0;
}

export function getTotalPendingForPeriod(entities, periodKey, rawData = null) {
  return (entities || []).reduce((sum, e) => sum + getPendingForPeriod(e, periodKey, rawData), 0);
}

export function getSharePctForPeriod(entity, periodKey, totalForPeriod, rawData = null) {
  if (!totalForPeriod) return 0;
  return Math.round((getPendingForPeriod(entity, periodKey, rawData) / totalForPeriod) * 100);
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

  const map = new Map();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const addKey = (pk, year, month, label) => {
    if (!pk || map.has(pk)) return;
    let y = year;
    let m = month;
    if (!y || !m) {
      const parts = String(pk).split('-');
      if (parts.length === 2) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
      }
    }
    if (y && m && m >= 1 && m <= 12) {
      const fullLabel = label || `${months[m - 1]} ${y}`;
      map.set(pk, { periodKey: pk, key: pk, year: y, month: m, label: fullLabel });
    }
  };

  // 1. Include explicit pendingAvailableMonths if present
  if (Array.isArray(rawData.pendingAvailableMonths)) {
    rawData.pendingAvailableMonths.forEach(m => {
      const pk = m.periodKey || m.key;
      addKey(pk, m.year, m.month, m.label);
    });
  }

  // 2. Include all availableMonths from rawData
  if (Array.isArray(rawData.availableMonths)) {
    rawData.availableMonths.forEach(m => {
      const pk = m.periodKey || m.key;
      addKey(pk, m.year, m.month, m.label);
    });
  }

  // 3. Include all pendingHistory keys across states, districts, dealers
  ['states', 'districts', 'dealers'].forEach(group => {
    (rawData[group] || []).forEach(e => {
      if (e.pendingHistory) {
        Object.keys(e.pendingHistory).forEach(pk => addKey(pk));
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}
