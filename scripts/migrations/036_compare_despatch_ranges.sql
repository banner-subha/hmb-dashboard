-- 036: despatch totals for two date ranges, for the State / District / Dealer
-- period comparison (ADR 0001). One row per raw state, district, dealer and
-- product that despatched in either range. The page normalises names the same
-- way latest.json does (src/utils/despatchRange.js), so the SQL stays raw and
-- the district spelling map lives in one place.
--
-- Rows are arrays, not objects: about 3k rows per call, and keys would triple
-- the payload.
--   [state, district, dealer, product, a_qty, b_qty,
--    a_lead_sum, a_lead_n, b_lead_sum, b_lead_n]
-- lead = despatch_date - order_date, counted only when >= 0 (as latest.json does).

create or replace function public.compare_despatch_ranges(
  p_a_from date, p_a_to date,
  p_b_from date, p_b_to date,
  p_states text[] default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
set work_mem = '32MB'
as $$
declare
  v_latest date;
  v_earliest date;
  v_rows json;
begin
  if p_a_from is null or p_a_to is null or p_b_from is null or p_b_to is null then
    raise exception 'All four dates are required';
  end if;
  if p_a_from > p_a_to or p_b_from > p_b_to then
    raise exception 'A range starts after it ends';
  end if;
  if p_a_to - p_a_from > 400 or p_b_to - p_b_from > 400 then
    raise exception 'Ranges are limited to 400 days';
  end if;

  select min(despatch_date), max(despatch_date) into v_earliest, v_latest
  from agent.mv_despatch;

  select coalesce(json_agg(json_build_array(
           state, district, dealer, product_code,
           a_qty, b_qty, a_lead_sum, a_lead_n, b_lead_sum, b_lead_n)), '[]'::json)
    into v_rows
  from (
    select d.state, d.district, d.dealer, d.product_code,
      -- qty_mt carries float noise (36.400000000000006); whole kilograms are
      -- exact and half the payload.
      round(coalesce(sum(d.qty_mt) filter (where d.despatch_date between p_a_from and p_a_to), 0), 3) as a_qty,
      round(coalesce(sum(d.qty_mt) filter (where d.despatch_date between p_b_from and p_b_to), 0), 3) as b_qty,
      coalesce(sum(d.despatch_date - d.order_date) filter (
        where d.despatch_date between p_a_from and p_a_to and d.despatch_date >= d.order_date), 0) as a_lead_sum,
      count(*) filter (
        where d.despatch_date between p_a_from and p_a_to and d.despatch_date >= d.order_date) as a_lead_n,
      coalesce(sum(d.despatch_date - d.order_date) filter (
        where d.despatch_date between p_b_from and p_b_to and d.despatch_date >= d.order_date), 0) as b_lead_sum,
      count(*) filter (
        where d.despatch_date between p_b_from and p_b_to and d.despatch_date >= d.order_date) as b_lead_n
    from agent.mv_despatch d
    where (d.despatch_date between p_a_from and p_a_to
        or d.despatch_date between p_b_from and p_b_to)
      and (p_states is null or d.state = any(p_states))
    group by d.state, d.district, d.dealer, d.product_code
  ) g
  where a_qty <> 0 or b_qty <> 0;

  return json_build_object(
    'earliest', v_earliest,
    'latest', v_latest,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.compare_despatch_ranges(date, date, date, date, text[]) from public;
grant execute on function public.compare_despatch_ranges(date, date, date, date, text[])
  to anon, authenticated, service_role;
