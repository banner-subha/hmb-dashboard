-- ============================================================================
-- 010  Freshness becomes snapshot state instead of a full-table scan
-- ============================================================================
-- MEASURED BEFORE (pg_stat_statements, 10-day window from 2026-09-05):
--   select ... from v_data_freshness  ->  111 calls, mean 6,413 ms, max 40,794 ms
--
-- WHY IT WAS SLOW
--   v_data_freshness ran 6 count(*) and 8 max() subqueries across the largest
--   tables (~600k rows) on every read. Two of the max() calls are over TEXT
--   date columns (dia_wise_despatch.invoice_date, do_pending.order_date), so
--   no index could serve them -- guaranteed sequential scans.
--
-- WHY IT HURT THE CHATBOT
--   app/prompt.py injects this block into the system prompt, and
--   app/db.py:data_freshness() caches it for only 300s. So every ~5 minutes
--   one real user turn paid the full 6.4s (worst case 40.8s) before the model
--   had even been called.
--
-- THE FIX
--   Freshness changes only when a file lands, so it is state, not a query.
--   Snapshot it once per ingest; serve it from a 6-row table.
--
-- CONTRACT PRESERVED
--   Same view name, same 5 columns, same types (row_count bigint,
--   latest_data_date text, days_behind integer). prompt.py needs no change.
--
--   days_behind is deliberately NOT snapshotted -- it is recomputed live from
--   latest_data_date against current_date. Freezing it would freeze the
--   staleness guard the model relies on to refuse reporting half a number as
--   if it were whole, which is the failure mode prompt.py exists to prevent.
--
-- ROLLBACK
--   See 010_freshness_snapshot_rollback.sql -- restores the original view
--   verbatim. Nothing is dropped and no data is altered by this migration.
-- ============================================================================

begin;

create table if not exists public.data_freshness_snapshot (
  table_name       text primary key,
  source_file      text,
  row_count        bigint,
  latest_data_date text,
  computed_at      timestamptz not null default now()
);

comment on table public.data_freshness_snapshot is
  'Per-table ingest freshness, refreshed by refresh_data_freshness() during '
  'post_ingest_refresh(). Serves v_data_freshness so the chatbot system '
  'prompt does not trigger full-table scans. days_behind is computed live in '
  'the view, never stored.';

-- The expensive scans now happen exactly once per ingest, off the user path.
create or replace function public.refresh_data_freshness()
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_start timestamptz := clock_timestamp();
  v_n     int;
begin
  with fresh(table_name, source_file, row_count, latest_data_date) as (
    select 'despatch_orders', 'NEW DASHBOARD REPORT FORMAT-V2.xlsx',
           (select count(*) from public.despatch_orders_clean),
           (select max(despatch_date)::text from public.despatch_orders_clean
             where record_type = 'DESPATCH')
    union all
    select 'dia_wise_despatch', 'DIA WISE DESPATCH -BI.xlsx',
           (select count(*) from public.dia_wise_despatch),
           (select max(invoice_date)::text from public.dia_wise_despatch)
    union all
    select 'do_pending', 'DO PENDING.xlsx',
           (select count(*) from public.do_pending),
           (select max(order_date)::text from public.do_pending)
    union all
    select 'field_visits', 'VISIT_TRACKER_SEPT.csv',
           (select count(*) from public.field_visits),
           (select max(visit_date)::text from public.field_visits)
    union all
    select 'dealer_targets', 'SEASON_7_DEALER VS TARGET.xlsx',
           (select count(*) from public.dealer_targets), null
    union all
    select 'dealer_kro_mapping', 'DEALER WISE JR-KRO NAME.xlsx',
           (select count(*) from public.dealer_kro_mapping), null
  )
  insert into public.data_freshness_snapshot
        (table_name, source_file, row_count, latest_data_date, computed_at)
  select table_name, source_file, row_count, latest_data_date, now() from fresh
  on conflict (table_name) do update
    set source_file      = excluded.source_file,
        row_count        = excluded.row_count,
        latest_data_date = excluded.latest_data_date,
        computed_at      = excluded.computed_at;

  select count(*) into v_n from public.data_freshness_snapshot;
  return json_build_object('ok', true, 'tables', v_n,
    'duration_ms', round(extract(milliseconds from clock_timestamp() - v_start)));
end;
$fn$;

-- Seed before swapping the view, so the prompt is never served an empty
-- freshness block (which would silently remove the staleness warning).
select public.refresh_data_freshness();

create or replace view public.v_data_freshness as
select
  s.table_name,
  s.source_file,
  s.row_count,
  s.latest_data_date,
  case
    when s.latest_data_date is null then null
    when s.latest_data_date ~ '^\d{4}-\d{2}-\d{2}' then
      (current_date - (left(s.latest_data_date, 10))::date)::integer
    else null
  end as days_behind
from public.data_freshness_snapshot s;

-- Wire the refresh into the existing post-ingest hook. Body is otherwise
-- unchanged from the deployed version; the freshness call is wrapped in its
-- own exception block so a freshness failure can never fail an ingest.
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
begin
  refresh materialized view concurrently public.dim_catalog;
  select count(*) into v_dim from public.dim_catalog;

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
    'data_freshness', v_fresh,
    'agent_refresh', v_agent,
    'duration_ms', round(extract(milliseconds from clock_timestamp() - v_start)),
    'refreshed_at', now()
  );
end;
$fn$;

commit;

-- VERIFY: must match the pre-migration baseline exactly.
--   dealer_kro_mapping  DEALER WISE JR-KRO NAME.xlsx        1164  <null>      <null>
--   dealer_targets      SEASON_7_DEALER VS TARGET.xlsx        701  <null>      <null>
--   despatch_orders     NEW DASHBOARD REPORT FORMAT-V2.xlsx 93836  2026-09-13      2
--   dia_wise_despatch   DIA WISE DESPATCH -BI.xlsx         189533  2026-09-03     12
--   do_pending          DO PENDING.xlsx                     17566  2026-09-13      2
--   field_visits        VISIT_TRACKER_SEPT.csv             298081  2026-09-07      8
--
-- select table_name, source_file, row_count, latest_data_date, days_behind
-- from v_data_freshness order by table_name;
