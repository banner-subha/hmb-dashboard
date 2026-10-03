-- 039: field_visits date in the master header reads the table, not the snapshot.
-- data_freshness_snapshot is refreshed by post_ingest_refresh, which only runs
-- after the xlsx (despatch / pending) ingests. The visit parser writes
-- field_visits on its own schedule and never refreshes the snapshot, so the
-- header showed 29 Sep while the table held 2 Oct. max(visit_date) is an index
-- lookup (idx_field_visits_date). Same signature as 037.

create or replace function public.get_data_freshness()
returns table (source text, latest_data_date date, loaded_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.table_name,
         case when s.table_name = 'field_visits'
              then (select max(v.visit_date) from public.field_visits v)::date
              else nullif(s.latest_data_date, '')::date end,
         (select max(f.last_ingested_at) from public.file_hashes f
           where f.target_table = s.table_name and f.status = 'success')
  from public.data_freshness_snapshot s
  where s.table_name in ('despatch_orders', 'do_pending', 'field_visits');
$$;

revoke all on function public.get_data_freshness() from public;
grant execute on function public.get_data_freshness() to anon, authenticated, service_role;
