-- ============================================================================
-- 012  Reclaim index space. No locks, no behaviour change, ~31 MB.
-- ============================================================================
-- Indexes are 178 MB of the 404 MB database. Two separate problems:
--   (a) three indexes that have never returned a single row, and
--   (b) severe leaf-page bloat from non-HOT updates.
--
-- On (b): field_visits took 93,970 updates with only 281 HOT, and
-- dia_wise_despatch took 250,748 updates with only 215 HOT. A non-HOT update
-- writes a new index entry for every index on the table, so repeated
-- re-ingestion shredded the btrees. Autovacuum reclaimed the dead heap tuples
-- (dead_tuple_percent is 0.00 everywhere) but cannot compact index leaf pages.
--
-- Measured leaf density (pgstatindex, 2026-09-15; a freshly built btree is ~90%):
--     idx_dia_wise_date_size          27 MB   46.65%   frag 48.46%
--     idx_dia_wise_state_date         20 MB   53.14%   frag 40.00%
--     idx_dia_wise_invoice           4.4 MB   54.56%   frag 45.26%
--     dia_wise_despatch_pkey          14 MB   75.21%   frag 16.82%
--     field_visits_pkey              7.8 MB   76.95%   frag 14.57%
--     idx_field_visits_cust          4.5 MB   75.93%   frag 22.96%
--     idx_field_visits_natural_key    24 MB   80.45%   frag 10.84%
--
-- NOT TOUCHED, deliberately:
--   mv_pending_key_idx        0 scans but UNIQUE, and REFRESH MATERIALIZED
--                             VIEW CONCURRENTLY agent.mv_pending requires it.
--                             Dropping it would break agent_refresh(). This is
--                             the trap a generic "drop unused indexes" script
--                             falls into.
--   idx_dia_wise_date_size    Its four INCLUDE columns look like waste but are
--   idx_dia_wise_state_date   earning index-only scans: 55,447 heap fetches
--                             against 7,261,128 index tuples read (0.8%) and
--                             44 against 7,435,410 (0.001%) respectively.
--                             Stripping the payload would save ~32 MB and
--                             regress the chatbot's main despatch analytics
--                             path. Reindexed here, not slimmed.
--   idx_field_visits_*_trgm   Handled in 013, which must land first because
--                             dropping them before repointing the resolvers
--                             would make visits_value_exists() seq-scan.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1: drop indexes that have never returned a row (pg_stat_user_indexes
-- idx_scan = 0 and idx_tup_read = 0 since stats reset 2026-09-05).
-- ---------------------------------------------------------------------------

-- 904 kB. do_pending.order_no is never filtered on; the chatbot reaches
-- do_pending through natural_key (do_pending_pkey, 679,479 scans) and
-- client_name (do_pending_client_idx, 445 scans).
drop index if exists public.idx_do_pending_order_no;

-- 280 kB. Byte-for-byte duplicate of idx_do_pending_date, which is the one the
-- planner actually picks (346 scans vs 0). Two identical indexes on
-- do_pending(order_date) doubled the write cost for nothing.
drop index if exists public.do_pending_order_date_idx;

-- 424 kB. agent.mv_despatch.product_code is not a filter in any of
-- agent.board_query / board_total / board_trend / board_lines.
drop index if exists agent.mv_despatch_product_idx;

-- ---------------------------------------------------------------------------
-- Part 2: rebuild the bloated indexes.
--
-- CONCURRENTLY so nothing blocks: readers and writers keep working, and the
-- chatbot stays up. Run these ONE AT A TIME, not as a batch -- each needs
-- transient free space equal to the finished index (27 MB worst case) and
-- REINDEX CONCURRENTLY cannot run inside a transaction block.
--
-- If one fails partway it leaves an invalid index behind; find it with
--     select indexrelid::regclass from pg_index where not indisvalid;
-- and drop that before retrying.
-- ---------------------------------------------------------------------------

reindex index concurrently public.idx_dia_wise_date_size;        -- 27 MB -> ~14 MB
reindex index concurrently public.idx_dia_wise_state_date;       -- 20 MB -> ~12 MB
reindex index concurrently public.idx_dia_wise_invoice;          -- 4.4 MB -> ~2.6 MB
reindex index concurrently public.dia_wise_despatch_pkey;        -- 14 MB -> ~11.6 MB
reindex index concurrently public.field_visits_pkey;             -- 7.8 MB -> ~6.6 MB
reindex index concurrently public.idx_field_visits_cust;         -- 4.5 MB -> ~3.7 MB
reindex index concurrently public.idx_field_visits_natural_key;  -- 24 MB -> ~22 MB

-- VERIFY
--   select indexrelname, pg_size_pretty(pg_relation_size(indexrelid)),
--          (pgstatindex(indexrelid::regclass)).avg_leaf_density
--   from pg_stat_user_indexes
--   where indexrelname in ('idx_dia_wise_date_size','idx_dia_wise_state_date',
--     'idx_dia_wise_invoice','dia_wise_despatch_pkey','field_visits_pkey',
--     'idx_field_visits_cust','idx_field_visits_natural_key');
--   -- expect avg_leaf_density ~90% on each
--
--   select pg_size_pretty(pg_database_size(current_database()));
--   -- expect ~373 MB, down from 404 MB
--
-- ROLLBACK
--   The reindexes need none (same definitions, just compacted). To restore the
--   three dropped indexes:
--     create index idx_do_pending_order_no on public.do_pending (order_no);
--     create index do_pending_order_date_idx on public.do_pending (order_date);
--     create index mv_despatch_product_idx on agent.mv_despatch (product_code);
