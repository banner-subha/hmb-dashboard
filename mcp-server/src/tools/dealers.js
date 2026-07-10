import { getData } from '../dataLoader.js';
import { filterByState, filterByDistrict, summarizeDealer, sortByKey } from '../analysis.js';

export function getTopDealers({ limit = 10, state, district, minCur } = {}, data) {
  const d = data || getData();
  let dealers = d.dealers || [];

  if (state) dealers = filterByState(dealers, state);
  if (district) dealers = filterByDistrict(dealers, district);
  if (minCur !== undefined) dealers = dealers.filter(dl => (dl.cur || 0) >= minCur);

  const sorted = sortByKey(dealers, 'cur', true);
  const top = sorted.slice(0, limit);

  const totalCur = sorted.reduce((sum, dl) => sum + (dl.cur || 0), 0);
  const totalPrev = sorted.reduce((sum, dl) => sum + (dl.prev || 0), 0);

  return {
    totalDealers: dealers.length,
    returnedCount: top.length,
    totalCurTop: top.reduce((sum, dl) => sum + (dl.cur || 0), 0),
    dealers: top.map(dl => ({
      ...summarizeDealer(dl),
      shareOfReturned: totalCur > 0 ? Math.round(((dl.cur || 0) / totalCur) * 100) : 0
    })),
    inactiveDealers: (d.intel?.inactiveDealerCount) || 0
  };
}
