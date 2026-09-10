-- Migration 006: make query_rep_productivity respect territory scope.
-- Applied to jhsttedcvzfkszbzczak.
--
-- The tool took no p_state, so app/tools/dispatch.py apply_scope had nothing
-- to enforce against and returned the arguments untouched. A territory-scoped
-- user therefore saw every rep in the country: with scope WEST BENGAL,
-- ASHISH YADAV -- zero West Bengal visits, works Jharkhand and Uttar Pradesh --
-- appeared in the results with all 59 of his out-of-territory visits counted
-- toward his totals.
--
-- Latent rather than live: every account is admin today, so nothing was
-- exposed. It would have become live the moment a row's role flipped to 'kro'.
--
-- p_state and p_district filter before aggregation, so a scoped user sees each
-- rep's activity within their own territory rather than a national total
-- attributed to a local rep. apply_scope now also refuses outright when a tool
-- cannot express the scope at all, mirroring its existing behaviour for a
-- multi-state scope: honest failure over partial enforcement.

CREATE OR REPLACE FUNCTION public.query_rep_productivity(
    p_employee text DEFAULT NULL, p_date_from text DEFAULT NULL,
    p_date_to text DEFAULT NULL, p_state text DEFAULT NULL,
    p_district text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE(grp jsonb, total_visits bigint, active_days bigint,
              visits_per_active_day numeric, unique_customers bigint,
              dealer_visits bigint, fabricator_visits bigint,
              avg_duration_mins numeric, morning_visits bigint,
              midday_visits bigint, afternoon_visits bigint, pct_of_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_from date := coalesce(p_date_from::date, (public.visits_latest_month() || '-01')::date);
  v_to date := coalesce(p_date_to::date,
                        (select coalesce(max(visit_date), CURRENT_DATE) from public.field_visits));
  p_em text := public.visits_like_pattern(p_employee);
  p_st text := public.visits_like_pattern(p_state);
  p_di text := public.visits_like_pattern(p_district);
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then p_limit := 100; end if;

  return query
  with rs as (
    select employee_name,
           count(*) as total_v, count(distinct visit_date) as days,
           count(distinct customer_name) as uniq,
           count(*) filter (where customer_type = 'DEALER') as dealer_v,
           count(*) filter (where customer_type = 'FABRICATOR') as fab_v,
           round(avg(nullif(duration_minutes, 0))::numeric, 1) as dur,
           count(*) filter (where visit_time < '10:00:00'::time) as morn,
           count(*) filter (where visit_time >= '10:00:00'::time and visit_time < '14:00:00'::time) as mid,
           count(*) filter (where visit_time >= '14:00:00'::time) as aft
    from public.field_visits
    where visit_date between v_from and v_to
      and employee_name is not null and btrim(employee_name) <> ''
      and (p_em is null or employee_name ilike p_em)
      and (p_st is null or state ilike p_st)
      and (p_di is null or district ilike p_di)
    group by employee_name
  )
  select jsonb_build_object('employee', employee_name),
         total_v, days,
         case when days > 0 then round(total_v::numeric / days, 1) else 0 end,
         uniq, dealer_v, fab_v, coalesce(dur, 0), morn, mid, aft,
         round(100.0 * total_v / nullif(sum(total_v) over (), 0), 2)
  from rs order by total_v desc limit p_limit;
end;
$function$;

DROP FUNCTION IF EXISTS public.query_rep_productivity(text, text, text, integer);
