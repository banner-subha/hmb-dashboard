import { getData } from '../dataLoader.js';
import { filterByState, filterByDistrict } from '../analysis.js';

const normName = (name) => String(name || '').replace(/\s+/g, '').toUpperCase();

function summarizeEntity(x) {
  return {
    name: x.state || x.district || x.client || x.product,
    cur: x.cur ?? 0,
    prev: x.prev ?? 0,
    mom: x.mom ?? 0,
    share: x.share ?? 0,
    drop: x.drop ?? 0,
    pendingQty: x.pendingQty ?? 0,
    currentDailyRate: x.currentDailyRate ?? 0,
    expectedMtd: x.expectedMtd ?? 0,
    avgPeriod: x.avgPeriod ?? null,
    riskScore: x.riskScore ?? null,
    impactTier: x.impactTier ?? null,
    lossFlag: x.lossFlag ?? null
  };
}

export function compareEntities({ entityType, entityA, entityB } = {}, data) {
  const d = data || getData();
  if (!entityType || !entityA || !entityB) {
    return { error: 'entityType, entityA, and entityB parameters are required' };
  }

  const type = String(entityType).toLowerCase();
  const wantA = normName(entityA);
  const wantB = normName(entityB);

  const pick = (arr, key) => {
    const a = (arr || []).find(x => normName(x[key]) === wantA);
    const b = (arr || []).find(x => normName(x[key]) === wantB);
    return { a, b };
  };

  let result;
  if (type === 'state') {
    const { a, b } = pick(d.states, 'state');
    result = { stateA: a ? summarizeEntity(a) : null, stateB: b ? summarizeEntity(b) : null };
  } else if (type === 'district') {
    const { a, b } = pick(d.districts, 'district');
    result = { districtA: a ? summarizeEntity(a) : null, districtB: b ? summarizeEntity(b) : null };
  } else if (type === 'dealer') {
    const { a, b } = pick(d.dealers, 'client');
    result = { dealerA: a ? summarizeEntity(a) : null, dealerB: b ? summarizeEntity(b) : null };
  } else if (type === 'product') {
    const { a, b } = pick(d.products, 'product');
    result = { productA: a ? summarizeEntity(a) : null, productB: b ? summarizeEntity(b) : null };
  } else {
    return { error: `Unsupported entityType "${entityType}". Use state, district, dealer, or product.` };
  }

  const names = [result[`${type}A`], result[`${type}B`]];
  return {
    entityType: type,
    entityA: entityA,
    entityB: entityB,
    foundA: !!names[0],
    foundB: !!names[1],
    comparison: result
  };
}
