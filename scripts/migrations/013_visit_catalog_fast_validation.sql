-- ============================================================================
-- 013  Stop validating visit filters with sequential scans
-- ============================================================================
-- MEASURED BEFORE (pg_stat_statements, 10-day window from 2026-09-05):
--   select public.visits_value_exists($1,$2)
--       -> 9 calls, mean 3,987 ms, max 11,481 ms
--
-- WHY IT WAS SLOW
--   visits_value_exists() answers "is this a real state / district / employee /
--   customer?" with, for each dimension:
--       EXISTS (SELECT 1 FROM field_visits WHERE <col> ILIKE '%input%')
--   A leading-wildcard ILIKE over 298,081 rows, to return one boolean. The
--   agent calls this to decide whether a filter the user typed is real before
--   it runs the real query, so it sits directly in front of the answer.
--
--   The customer_type branch is worse: visits_customer_types() runs
--       SELECT DISTINCT customer_type FROM public.field_visits
--   scanning 298,081 rows to recover ten distinct values.
--
-- WHY dim_catalog COULD NOT ALREADY DO THIS
--   dim_catalog has no field_visits source at all -- verified: not one of its
--   16 dimensions lists field_visits in `sources`. Its `employee` dimension is
--   dia_wise_despatch only (86 values, against 149 in field_visits), and visit
--   customer names (26,185 distinct) are absent entirely. So the visit path had
--   no small object to resolve against and fell back to the fact table.
--
-- THE FIX
--   A dedicated small catalog of distinct visit dimension values with its own
--   trigram index, and the two resolvers repointed at it.
--
--   Measured shape of the catalog (run read-only against live data before
--   writing this migration, so these are real, not estimates):
--       customer       26,185 values
--       district          206
--       employee          149
--       state              16
--       customer_type      10
--       TOTAL          26,566 values, ~1.8 MB of value+norm bytes
--   With the unique btree and the GIN trigram index that lands at ~6 MB.
--
--   Note 26,185 rather than the 14,020 that pg_stats reports for
--   field_visits.customer_name -- that figure is a sampled estimate and is off
--   by nearly half. Sized off the real count.
--
--   THE TRIGRAM INDEX IS NOT OPTIONAL. Measured on dim_catalog (9,940 rows,
--   the same query shape) on this instance:
--       with    GIN trigram : Bitmap Index Scan,  9.9 ms
--       without (seq scan)  : Rows Removed 7,852, 322.1 ms
--   ILIKE is expensive per row on this shared free-tier CPU, so even a 26k-row
--   table would cost ~800 ms to scan. 6 MB of index buys back ~790 ms per
--   validation call.
--
--   Deliberately a SEPARATE object rather than new dimensions inside
--   dim_catalog: folding 26,185 visit customer names into dim_catalog's
--   `dealer` dimension would change dealer resolution for every existing
--   despatch question, and adding field_visits to `district` would shift the
--   group_key clustering that resolve_dimension_value() depends on. Neither
--   risk is worth taking for a validation helper.
--
-- WHAT IS NOT DROPPED, AND WHY
--   idx_field_visits_customer_trgm (20 MB, 102 scans) and
--   idx_field_visits_district_trgm (12 MB, 43 scans) STAY. They also serve the
--   ILIKE filters inside query_visits, query_dealer_visit_correlation,
--   query_rep_productivity and query_district_fabricator_visits, which filter
--   the 298k-row fact table itself rather than just validating a string.
--   Dropping them would slow the actual visit answers. They are reindexed
--   instead: GIN bloats badly after the 93,970 non-HOT updates this table has
--   taken, and pgstatindex cannot report GIN density so the bloat is invisible.
--
-- DEPENDS ON 010
--   The post_ingest_refresh() body below calls public.refresh_data_freshness(),
--   which migration 010 creates. Apply 010 first. If you apply this one alone
--   the call is caught by its own exception block and reported as
--   data_freshness: {ok:false}, so the ingest still succeeds -- but freshness
--   then stops updating, which is worse than not having applied either.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- The small catalog.
-- ---------------------------------------------------------------------------
drop materialized view if exists public.visit_dim_catalog;

create materialized view public.visit_dim_catalog as
with raw(dimension, value) as (
  select 'state',         state         from public.field_visits
  union all
  select 'district',      district      from public.field_visits
  union all
  select 'employee',      employee_name from public.field_visits
  union all
  select 'customer',      customer_name from public.field_visits
  union all
  select 'customer_type', customer_type from public.field_visits
)
select dimension,
       value,
       upper(regexp_replace(value, '[^a-zA-Z0-9]', '', 'g')) as value_norm,
       count(*) as row_count
from raw
where nullif(btrim(value), '') is not null
group by dimension, value;

comment on materialized view public.visit_dim_catalog is
  'Distinct field_visits dimension values (~26.6k rows). Exists so filter '
  'validation does not sequentially scan the 298k-row fact table. Refreshed by '
  'post_ingest_refresh(). Kept separate from dim_catalog on purpose: see the '
  'header of migration 013.';

-- Unique, and required: without it REFRESH MATERIALIZED VIEW CONCURRENTLY on
-- this view fails, which is precisely the bug migration 011 exists to fix on
-- agent.mv_despatch. Do not drop it because it looks unused in idx_scan.
create unique index visit_dim_catalog_pk
  on public.visit_dim_catalog (dimension, value);

-- Serves the ILIKE in both resolvers below. See the measurement in the header:
-- this index is worth ~790 ms per call, not a nicety.
create index visit_dim_catalog_trgm
  on public.visit_dim_catalog using gin (value gin_trgm_ops);

-- value_norm is materialised as a column but intentionally NOT indexed. Nothing
-- in this migration queries it; it is here so a future normalised resolver (the
-- dim_catalog value_norm / group_key pattern) can be built on this view without
-- a second migration. Add the index when something actually reads it.

-- ---------------------------------------------------------------------------
-- Repoint the resolvers. Same signatures, same return types, same semantics:
-- still a case-insensitive substring test, just against distinct values
-- instead of all 298,081 rows.
-- ---------------------------------------------------------------------------
create or replace function public.visits_value_exists(p_dimension text, p_input text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  SELECT CASE lower(btrim(p_dimension))
    WHEN 'customer_type' THEN
      coalesce(array_length(public.visits_customer_types(p_input), 1), 0) > 0
    WHEN 'state' THEN EXISTS (
      SELECT 1 FROM public.visit_dim_catalog
      WHERE dimension = 'state' AND value ILIKE public.visits_like_pattern(p_input))
    WHEN 'district' THEN EXISTS (
      SELECT 1 FROM public.visit_dim_catalog
      WHERE dimension = 'district' AND value ILIKE public.visits_like_pattern(p_input))
    WHEN 'employee' THEN EXISTS (
      SELECT 1 FROM public.visit_dim_catalog
      WHERE dimension = 'employee' AND value ILIKE public.visits_like_pattern(p_input))
    WHEN 'customer' THEN EXISTS (
      SELECT 1 FROM public.visit_dim_catalog
      WHERE dimension = 'customer' AND value ILIKE public.visits_like_pattern(p_input))
    ELSE true
  END;
$fn$;

-- The INFLUENCER expansion is unchanged; only the DISTINCT source moves off
-- the fact table.
create or replace function public.visits_customer_types(p_input text)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $fn$
  SELECT CASE
    WHEN p_input IS NULL THEN NULL
    WHEN upper(btrim(p_input)) = 'INFLUENCER' THEN
      ARRAY['INFLUENCER - CONTRACTOR','INFLUENCER - IHB',
            'INFLUENCER - MASON','INFLUENCER - OTHERS']
    ELSE
      (SELECT coalesce(array_agg(DISTINCT value), '{}'::text[])
       FROM public.visit_dim_catalog
       WHERE dimension = 'customer_type'
         AND upper(btrim(value)) = upper(btrim(p_input)))
  END;
$fn$;

-- ---------------------------------------------------------------------------
-- Keep it current. Concurrent refresh is safe here because
-- visit_dim_catalog_pk is unique -- the exact requirement migration 011 had to
-- add to agent.mv_despatch after it had been failing silently for weeks.
-- ---------------------------------------------------------------------------
create or replace function public.post_ingest_refresh()
returns json
language plpgsql
security definer
set search_path to 'public', 'agent', 'pg_temp'
set statement_timeout to '120s'
as $fn$
declare
  v_start timestamptz := clock_timestamp();
  v_dim   bigint;
  v_agent jsonb;
  v_fresh json;
  v_vdim  jsonb;
begin
  refresh materialized view concurrently public.dim_catalog;
  select count(*) into v_dim from public.dim_catalog;

  begin
    refresh materialized view concurrently public.visit_dim_catalog;
    v_vdim := jsonb_build_object('ok', true,
      'rows', (select count(*) from public.visit_dim_catalog));
  exception when others then
    v_vdim := jsonb_build_object('ok', false, 'error', SQLERRM);
  end;

  begin
    v_fresh := public.refresh_data_freshness();
  exception when others then
    v_fresh := json_build_object('ok', false, 'error', SQLERRM);
  end;

  begin
    v_agent := public.agent_refresh();
  exception when others then
    v_agent := jsonb_build_object('ok', false, 'error', SQLERRM);
  end;

  return json_build_object(
    'ok', true,
    'dim_catalog_rows', v_dim,
    'visit_dim_catalog', v_vdim,
    'data_freshness', v_fresh,
    'agent_refresh', v_agent,
    'duration_ms', round(extract(milliseconds from clock_timestamp() - v_start)),
    'refreshed_at', now()
  );
end;
$fn$;

commit;

-- ---------------------------------------------------------------------------
-- APPLIED 2026-09-15 WITH ONE DEVIATION.
--
-- The staged version of this migration dropped idx_field_visits_employee_trgm
-- (15 MB, idx_scan = 2, idx_tup_read = 0) on the grounds that it had never
-- returned a row and that employee matching now runs against 149 catalog rows
-- instead of 298,081 fact rows.
--
-- That reasoning was wrong, and measuring it before dropping caught it.
-- idx_tup_read = 0 only means nobody filtered visits by employee during the
-- 10-day stats window. It does not mean the index is unused: query_visits() and
-- query_rep_productivity() both apply employee_name ILIKE to the FACT TABLE,
-- not to the catalog. The catalog fixed validation, not filtering.
--
-- Measured on field_visits, employee_name ILIKE '%KAUSHIK%', warm cache:
--     with idx_field_visits_employee_trgm   Bitmap Index Scan,     7.1 ms
--     without (forced Parallel Seq Scan)    6,548 blocks read,   727.1 ms
-- Roughly 100x, for 11 MB after reindexing. Dropping it would have left a
-- ~730 ms penalty on "how is <rep> doing on visits", which is exactly the
-- question this engine exists to answer.
--
-- (The cold-cache numbers invert and are misleading: 1,417 ms with the index
-- against 961 ms without, because the bitmap heap scan pays random I/O on
-- 1,501 scattered blocks while the seq scan reads sequentially in parallel.
-- Compare warm, or the conclusion flips.)
--
-- So: all three trigram indexes are kept and reindexed. GIN bloats badly after
-- the 93,970 non-HOT updates this table has taken, and pgstatindex cannot
-- report GIN density, so the bloat was invisible until the rebuild.
--
-- Run one at a time, outside a transaction block.
-- ---------------------------------------------------------------------------
reindex index concurrently public.idx_field_visits_employee_trgm;   -- 15 MB -> 11 MB
reindex index concurrently public.idx_field_visits_customer_trgm;   -- 20 MB -> 14 MB
reindex index concurrently public.idx_field_visits_district_trgm;   -- 12 MB -> 7.5 MB

-- VERIFIED AFTER APPLYING
--   visit_dim_catalog: customer 26185, customer_type 10, district 206,
--                      employee 149, state 16; total 26,566 rows,
--                      5,464 kB (2,336 kB heap + 3,088 kB indexes)
--   all 21 resolver cases identical to the pre-migration baseline, including
--     the '' / null / unknown-dimension edges and visits_customer_types('BOGUS')
--     returning an empty array
--   inner EXISTS: Bitmap Index Scan on visit_dim_catalog_trgm, 10 buffers,
--     0.236 ms, no field_visits in the plan at all
--   visits_value_exists('customer','KAMALA'): 45 ms cold, 13.4 ms warm,
--     against a 3,987 ms mean before
--   post_ingest_refresh(): every stage ok, visit_dim_catalog refreshed
--     concurrently at 26,566 rows
--   agent.despatch still 60,016 rows / 694,095.82 MT, board_total unchanged
--     at 6,632.50 MT for 2026-09-01..13
--
-- NET SPACE (measured, not estimated)
--    +5.5 MB  visit_dim_catalog with its two indexes
--    -4 MB    reindex idx_field_visits_employee_trgm  (15 -> 11)
--    -6 MB    reindex idx_field_visits_customer_trgm  (20 -> 14)
--    -4.5 MB  reindex idx_field_visits_district_trgm  (12 -> 7.5)
--   --------
--   about -9 MB, and visits_value_exists goes 3,987 ms -> 13 ms
--
-- ROLLBACK
--   Re-apply visits_value_exists / visits_customer_types from migration 005,
--   restore the pre-013 post_ingest_refresh body, then
--     drop materialized view if exists public.visit_dim_catalog;
--   The reindexes need no rollback: same definitions, just compacted.
