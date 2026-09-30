-- 037: how current each source is, for the master header.
-- data_freshness_snapshot has RLS on and no policy, so the dashboard (anon)
-- reads nothing from it directly. This returns only the dates, per source:
-- the latest day in the data, and when the file was last loaded.

create or replace function public.get_data_freshness()
returns table (source text, latest_data_date date, loaded_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.table_name,
         nullif(s.latest_data_date, '')::date,
         (select max(f.last_ingested_at) from public.file_hashes f
           where f.target_table = s.table_name and f.status = 'success')
  from public.data_freshness_snapshot s
  where s.table_name in ('despatch_orders', 'do_pending', 'field_visits');
$$;

revoke all on function public.get_data_freshness() from public;
grant execute on function public.get_data_freshness() to anon, authenticated, service_role;
