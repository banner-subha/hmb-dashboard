import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Outstanding Receivables RPCs (migration 021).
//
// The tab loads the whole dealer book once (~1,037 account groups, ~40ms in
// Postgres) and filters, sorts and totals it in the browser, so a filter change
// costs no round trip. The chatbot's three outstanding RPCs are not used here:
// they cap at 200 accounts and match dealer names loosely.
// ─────────────────────────────────────────────────────────────────────────────

/** PostgREST truncates any response at 1,000 rows, silently. */
const API_PAGE_SIZE = 1000;

/** The book has ~1,037 rows; three pages leaves room for the ledger to grow. */
const BOOK_ROW_CEILING = 3000;

/** The ledger is a snapshot replaced by an upload, not a live feed. */
const CACHE_TTL_MS = 5 * 60 * 1000;

// Same policy as visitService: anon has a 3s statement timeout, and a data
// refresh can push a normal call past it, so transient failures retry twice.
const RETRY_DELAYS_MS = [700, 1800];
const isTransient = (err) =>
  err?.code === '57014' || /statement timeout|failed to fetch|network/i.test(err?.message || '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpcPage(fnName, params, from, to) {
  for (let attempt = 0; ; attempt += 1) {
    const { data, error } = await supabase.rpc(fnName, params).range(from, to);
    if (!error) return data || [];
    if (!isTransient(error) || attempt >= RETRY_DELAYS_MS.length) {
      const detail = [error.message, error.hint].filter(Boolean).join(' ');
      throw new Error(
        isTransient(error)
          ? 'Outstanding data is being refreshed. Try again in a minute.'
          : `Could not load outstanding (${detail || 'request failed'}).`,
        { cause: error }
      );
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

/**
 * Every row of a set-returning RPC. Pages are requested together; the RPCs
 * order by a unique tail (dealer name, row id), so offsets never overlap.
 */
async function rpcAll(fnName, params, expectedRows) {
  const pages = Math.max(1, Math.ceil(expectedRows / API_PAGE_SIZE));
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      rpcPage(fnName, params, i * API_PAGE_SIZE, (i + 1) * API_PAGE_SIZE - 1)
    )
  );
  return results.flat();
}

const cache = new Map();

function cached(key, producer) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = producer().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** Every account group with net aging, credits and bill counts. */
export function fetchDealerBook({ force = false } = {}) {
  if (force) cache.delete('book');
  return cached('book', () => rpcAll('query_outstanding_dealer_book', {}, BOOK_ROW_CEILING));
}

/**
 * Every open entry for one account group: exact dealer, state and district,
 * as the book grouped them. `voucherCount` comes from the book row and sets
 * how many pages to ask for.
 */
export function fetchDealerBills({ dealer_name, state, district, voucher_count }) {
  const key = `bills|${dealer_name}|${state}|${district ?? ''}`;
  return cached(key, () =>
    rpcAll(
      'query_outstanding_dealer_bills',
      { p_dealer: dealer_name, p_state: state, p_district: district ?? null },
      voucher_count || 1
    )
  );
}
