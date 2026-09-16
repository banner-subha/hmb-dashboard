-- ============================================================================
-- 016  APPLIED 2026-09-15.  Every duration_ms in the refresh path wrapped at
--      60 seconds and under-reported by a full minute.
-- ============================================================================
-- FOUND WHILE VERIFYING 013
--   post_ingest_refresh() returned
--       "agent_refresh": {"took_ms": 34335}, ... "duration_ms": 3677
--   A total of 3,677 ms containing a 34,335 ms step is impossible.
--
-- CAUSE
--   The refresh functions all timed themselves with
--       round(extract(milliseconds from clock_timestamp() - t0))
--   extract(milliseconds from interval) returns the interval's SECONDS field
--   times 1000, not the elapsed total. Confirmed on this instance:
--       extract(milliseconds from interval '63.677 seconds')          = 3677
--       extract(milliseconds from interval '1 minute 3.677 seconds')  = 3677
--       extract(epoch     from interval '1 minute 3.677 seconds')*1000 = 63677
--   So anything over a minute silently lost 60,000 ms per minute, and the run
--   above actually took 63.7 s.
--
-- WHY IT MATTERS RATHER THAN BEING COSMETIC
--   post_ingest_refresh() carries statement_timeout 120s and now runs about
--   64 s: a concurrent dim_catalog refresh, the visit_dim_catalog refresh added
--   by 013, freshness, then agent_refresh. It is at roughly half its timeout
--   budget, and the metric that should show that was reporting 3.7 s. The next
--   time ingest volume grows, the first symptom would have been a 120 s
--   statement timeout with no prior warning in the numbers.
--
--   The bug predates this session in agent_refresh() and post_ingest_refresh().
--   refresh_data_freshness(), added in migration 010, inherited the same idiom
--   by being written to match the surrounding code.
--
-- CHANGE
--   extract(epoch from ...) * 1000 in all three. Reporting only: no refresh
--   behaviour, ordering, or exception handling is touched.
--
-- VERIFIED
--   agent_refresh() -> took_ms 6777 on a steady-state run, against the same
--   run reporting 34,335 immediately after the matviews were rebuilt from
--   scratch in 011/011b. Both are now true elapsed values.
--
-- ROLLBACK
--   Restore the three function bodies from git history. Reverting reinstates
--   the wrap.
--
-- NOTE FOR LATER
--   agent_refresh() at ~6.8 s steady state is the next thing worth attention in
--   post_ingest_refresh. It refreshes two matviews concurrently, and concurrent
--   refresh always costs more than a plain one because it diffs against a temp
--   copy. It runs every 20 minutes, so it is not on a user path, but it is the
--   largest remaining term in the 64 s total.
-- ============================================================================

begin;

create or replace function public.agent_refresh()
returns jsonb
language plpgsql
security definer
set search_path to 'agent', 'public', 'pg_temp'
as $fn$
declare t0 timestamptz := clock_timestamp(); n_d int; n_p int;
begin
  refresh materialized view concurrently agent.mv_despatch;
  refresh materialized view concurrently agent.mv_pending;
  select count(*) into n_d from agent.mv_despatch;
  select count(*) into n_p from agent.mv_pending;
  -- keep expired app sessions from accumulating
  delete from agent.app_sessions where expires_at < now();
  return jsonb_build_object('ok', true,
    'despatch_rows', n_d, 'pending_rows', n_p,
    'latest_despatch', (select max(despatch_date) from agent.mv_despatch),
    'took_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end;
$fn$;

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
    'duration_ms', round(extract(epoch from clock_timestamp() - v_start) * 1000));
end;
$fn$;

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
    'duration_ms', round(extract(epoch from clock_timestamp() - v_start) * 1000),
    'refreshed_at', now()
  );
end;
$fn$;

commit;
