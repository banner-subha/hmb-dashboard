import { getData } from '../dataLoader.js';
import { filterByState, filterByDistrict, summarizeDistrict, sortByKey } from '../analysis.js';

export function getDistricts({ state, district } = {}, data) {
  const d = data || getData();
  let districts = d.districts || [];

  if (state) districts = filterByState(districts, state);
  if (district) districts = filterByDistrict(districts, district);

  return {
    count: districts.length,
    districts: sortByKey(districts, 'cur', true).map(summarizeDistrict)
  };
}
