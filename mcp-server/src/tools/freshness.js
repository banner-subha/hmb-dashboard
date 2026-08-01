import { getData } from '../dataLoader.js';

export function getDataFreshness(data) {
  const d = data || getData();
  const meta = d.meta || {};

  return {
    generatedAt: meta.generatedAt ?? d.generatedAt ?? null,
    dataAsOfDate: meta.dataAsOfDate ?? d.dataAsOfDate ?? null,
    curPeriod: meta.curPeriod ?? d.curPeriod ?? null,
    prevPeriod: meta.prevPeriod ?? d.prevPeriod ?? null,
    rowsProcessed: meta.rowsProcessed ?? d.rowsProcessed ?? 0,
    curElapsedDays: meta.curElapsedDays ?? d.curElapsedDays ?? null,
    availableMonths: (d.availableMonths || []).map(m => ({
      periodKey: m.periodKey,
      label: m.label,
      year: m.year,
      month: m.month
    })),
    historyMonths: Object.keys(d.monthlyHistory || {}).length
  };
}
