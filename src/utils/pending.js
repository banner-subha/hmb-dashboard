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

export function getBacklogAgeInfo(entity, periodKey = 'ALL', rawData = null) {
  if (!entity) return { days: 0, label: '0 days', oldestMonth: null };

  const pendingQty = getPendingForPeriod(entity, periodKey, rawData);
  if (pendingQty <= 0) {
    return { days: 0, label: '0 days', oldestMonth: null };
  }

  // Reference date: metadata generatedAt or current date
  const genAt = rawData?.meta?.generatedAt || entity?.meta?.generatedAt;
  const refDate = (genAt && !isNaN(new Date(genAt).getTime()))
    ? new Date(genAt)
    : new Date();

  const getMonthDate = (pk) => {
    if (!pk || pk === 'ALL') return null;
    const parts = String(pk).split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (y && m >= 1 && m <= 12) {
        return new Date(y, m - 1, 1);
      }
    }
    return null;
  };

  // 1. Specific period filter (e.g. '2026-05')
  if (periodKey && periodKey !== 'ALL') {
    const mDate = getMonthDate(periodKey);
    if (mDate) {
      const days = Math.max(0, Math.round((refDate - mDate) / (1000 * 60 * 60 * 24)));
      return {
        days,
        label: `${days} days`,
        oldestMonth: periodKey
      };
    }
  }

  // 2. 'ALL' / Total Backlog mode — derive from entity.pendingHistory
  const pendingHistory = entity.pendingHistory || {};
  const activeMonths = Object.keys(pendingHistory)
    .filter(m => (pendingHistory[m] || 0) > 0)
    .sort();

  if (activeMonths.length > 0) {
    const oldestMonth = activeMonths[0];
    const oldestDate = getMonthDate(oldestMonth);
    const oldestDays = oldestDate
      ? Math.max(0, Math.round((refDate - oldestDate) / (1000 * 60 * 60 * 24)))
      : 30;

    let totalVol = 0;
    let weightedDaysSum = 0;
    activeMonths.forEach(pk => {
      const vol = pendingHistory[pk] || 0;
      const d = getMonthDate(pk);
      if (d) {
        const days = Math.max(0, Math.round((refDate - d) / (1000 * 60 * 60 * 24)));
        totalVol += vol;
        weightedDaysSum += vol * days;
      }
    });

    const avgDays = totalVol > 0 ? Math.round(weightedDaysSum / totalVol) : oldestDays;

    return {
      days: avgDays,
      maxDays: oldestDays,
      label: `${avgDays} days`,
      oldestMonth
    };
  }

  // Fallback if no pendingHistory breakdown exists, but pendingQty > 0
  return {
    days: 30,
    label: '~30 days',
    oldestMonth: null
  };
}


export function getPendingAvailableMonths(rawData) {
  if (!rawData) return [];

  const map = new Map();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
