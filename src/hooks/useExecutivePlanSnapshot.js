import { useEffect, useMemo, useState } from 'react';
import {
  fetchLatestPlanMonth,
  queryBusinessPlanVsActual,
  getBusinessPlanDataset,
  getBusinessPlanDatasetSync,
} from '../services/businessPlanService';
import { normalizeActualRow } from '../utils/businessPlan';

/**
 * Where the last good snapshot is parked between page loads.
 */
const CACHE_KEY = 'hmb.execPlanSnapshot.v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** Every access is wrapped: private mode and blocked site data both throw. */
function readCache() {
  const syncSnap = getBusinessPlanDatasetSync()?.executiveSnapshot;
  if (syncSnap?.month && Array.isArray(syncSnap.states)) {
    return {
      month: syncSnap.month,
      states: syncSnap.states.map((r) => normalizeActualRow(r, 'state')).filter(Boolean),
    };
  }
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.month || !Array.isArray(parsed.states)) return null;
    if (Date.now() - (parsed.at || 0) > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(month, states) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), month, states }));
  } catch {
    // Quota or a blocked store. The hook works without the cache; it is an
    // accelerator, never the source of truth.
  }
}

const fetchStates = async (month) => {
  const rows = await queryBusinessPlanVsActual({
    dimensions: ['state'],
    month,
    limit: 500,
    sort: 'target_desc',
  });
  return rows.map((r) => normalizeActualRow(r, 'state')).filter(Boolean);
};

export function useExecutivePlanSnapshot() {
  const [cached] = useState(readCache);

  const [month, setMonth] = useState(cached?.month ?? null);
  const [states, setStates] = useState(cached?.states ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    const cachedMonth = cached?.month ?? null;

    (async () => {
      // 1. Ultra-fast path: resolve directly from CDN dataset
      try {
        const dataset = await getBusinessPlanDataset();
        if (!live) return;
        if (dataset?.executiveSnapshot) {
          const snap = dataset.executiveSnapshot;
          const normStates = (snap.states || []).map((r) => normalizeActualRow(r, 'state')).filter(Boolean);
          setMonth(snap.month);
          setStates(normStates);
          setLoading(false);
          writeCache(snap.month, normStates);
          return;
        }
      } catch {
        // Fall back to network lookup below
      }

      // Fast path: refresh the figures for the month we already know, without
      // waiting on the lookup that would otherwise gate them.
      if (cachedMonth) {
        fetchStates(cachedMonth)
          .then((rows) => {
            if (!live) return;
            setMonth(cachedMonth);
            setStates(rows);
            setLoading(false);
            writeCache(cachedMonth, rows);
          })
          .catch(() => {});
      }

      try {
        const latest = await fetchLatestPlanMonth();
        if (!live) return;

        if (!latest) {
          setMonth(null);
          setStates([]);
          return;
        }

        if (latest === cachedMonth) return;

        const rows = await fetchStates(latest);
        if (!live) return;
        setMonth(latest);
        setStates(rows);
        writeCache(latest, rows);
      } catch (err) {
        if (live && !cachedMonth) setError(err?.message || 'Business plan data is unavailable');
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [cached]);

  const totals = useMemo(() => {
    if (!states.length) return null;

    const sum = states.reduce(
      (acc, r) => ({
        spTarget: acc.spTarget + r.spTarget,
        potential: acc.potential + r.potential,
        actual: acc.actual + r.actual,
        bpDealers: acc.bpDealers + r.bpDealers,
        activeDealers: acc.activeDealers + r.activeDealers,
      }),
      { spTarget: 0, potential: 0, actual: 0, bpDealers: 0, activeDealers: 0 }
    );

    return {
      ...sum,
      variance: sum.actual - sum.spTarget,
      // Null rather than zero when nothing was planned: a month with no target
      // has no achievement, which is a different statement from 0% achieved.
      achievementPct: sum.spTarget > 0 ? (sum.actual / sum.spTarget) * 100 : null,
      coveragePct: sum.bpDealers > 0 ? (sum.activeDealers / sum.bpDealers) * 100 : null,
    };
  }, [states]);

  return { month, states, totals, loading, error };
}
