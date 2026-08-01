import { getData } from '../dataLoader.js';
import { filterByState } from '../analysis.js';

export function getInactiveDealers({ state, minPrevVolume } = {}, data) {
  const d = data || getData();
  const intel = d.intel || {};

  let dealers = intel.inactiveDealers || [];
  if (state) dealers = filterByState(dealers, state);
  if (minPrevVolume !== undefined) {
    dealers = dealers.filter(x => (x.prevVolume ?? 0) >= minPrevVolume);
  }

  return {
    count: dealers.length,
    inactiveDealerCount: intel.inactiveDealerCount ?? dealers.length,
    dealers: dealers.map(x => ({
      client: x.client ?? null,
      district: x.district ?? null,
      state: x.state ?? null,
      prevVolume: x.prevVolume ?? 0,
      products: x.products ?? null
    }))
  };
}
