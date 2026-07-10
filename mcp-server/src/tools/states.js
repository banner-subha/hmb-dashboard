import { getData } from '../dataLoader.js';
import { filterByState, summarizeState, sortByKey } from '../analysis.js';

export function getStates({ state } = {}, data) {
  const d = data || getData();
  let states = d.states || [];

  if (state) {
    states = filterByState(states, state);
  }

  return {
    count: states.length,
    states: sortByKey(states, 'cur', true).map(summarizeState)
  };
}
