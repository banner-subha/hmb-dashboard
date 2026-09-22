import { useEffect, useMemo, useState } from 'react';
import { fetchLatestPlanMonth, queryBusinessPlanVsActual } from '../services/businessPlanService';
import { normalizeActualRow } from '../utils/businessPlan';

/**
 * Where the last good snapshot is parked between page loads.
 *
 * `sessionStorage` rather than `localStorage` on purpose: it survives the
 * refresh this cache exists for, and closing the tab throws it away, which
 * bounds how stale a cached figure can ever be without any expiry logic of
 * its own. The TTL below is the second bound, for a tab left open for days.
 */
const CACHE_KEY = 'hmb.execPlanSnapshot.v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** Every access is wrapped: private mode and blocked site data both throw. */
function readCache() {
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

/**
 * The Business Plan position, for pages that need the headline and nothing else.
 *
 * Deliberately not `useBusinessPlan`. That hook drives the Business Plan tab's
 * eight filters and two view switchers, and fires around ten requests to do it.
 * The Executive Overview needs one figure set: what was planned, what was
 * invoiced, and how many planned dealers actually billed.
 *
 * ── Why this is not a simple await-then-await ────────────────────────────────
 *
 * The obvious shape — resolve the latest plan month, then query it — costs two
 * serial round trips before anything can render, and measured here that was
 * 1.9s for the month lookup plus 0.75s for the data: about 3.4 seconds of empty
 * KPI tiles on every refresh. The month lookup is the expensive half and it
 * returns a couple of strings.
 *
 * So the month is treated as the slow-moving value it is. A remembered month
 * lets the data query start immediately, in parallel with the lookup that would
 * otherwise gate it, and the cached figures paint on the very first frame while
 * that happens. The lookup still runs, and still has the last word: if the plan
 * month has actually rolled over, its answer replaces what the fast path drew.
 *
 * States are the grouping because they are the one dimension guaranteed to be
 * complete — fourteen rows, never near the row ceiling — so summing them gives
 * a true national total. Grouping by dealer would risk adding up a list the
 * limit had already cut off.
 *
 * The month is returned so the UI can name it, rather than let a reader assume
 * it matches the running despatch cycle. The two genuinely can differ.
 */
export function useExecutivePlanSnapshot() {
  // Read once, at mount. A lazy initialiser rather than a ref, so the cached
  // snapshot seeds the state below instead of an empty one that would flash
  // before the effect gets a chance to run.
  const [cached] = useState(readCache);

  const [month, setMonth] = useState(cached?.month ?? null);
  const [states, setStates] = useState(cached?.states ?? []);
  // A cached snapshot is already on screen, so the page is not "loading" —
  // it is revalidating, which the tiles do not need to announce.
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    const cachedMonth = cached?.month ?? null;

    (async () => {
      // Fast path: refresh the figures for the month we already know, without
      // waiting on the lookup that would otherwise gate them. Errors here are
      // swallowed because the authoritative path below is what reports them.
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

        // No plan month is a legitimate state, not a failure: the cards render
        // their empty copy rather than an error.
        if (!latest) {
          setMonth(null);
          setStates([]);
          return;
        }

        // The fast path already asked for this month, and the service memoises
        // in-flight requests, so re-asking would be the same promise anyway.
        if (latest === cachedMonth) return;

        const rows = await fetchStates(latest);
        if (!live) return;
        setMonth(latest);
        setStates(rows);
        writeCache(latest, rows);
      } catch (err) {
        // With figures already on screen a failed revalidation is not worth
        // replacing them with an error; it only matters when there is nothing.
        if (live && !cachedMonth) setError(err?.message || 'Business plan data is unavailable');
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
    // `cached` is set once by its lazy initialiser and never changes, so this
    // runs exactly once without needing to lie about the dependency list.
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
