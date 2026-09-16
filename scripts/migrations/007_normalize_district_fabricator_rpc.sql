-- ---------------------------------------------------------------------------
-- Migration 007: District Canonical Normalization for Fabricator Visits RPC
-- Resolves word order transpositions (e.g. East Medinipur vs Medinipur East,
-- Purba Medinipur, 24 Parganas North/South) so that chatbot queries and dashboard
-- tables match 100%.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_district_key(d text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE 
    WHEN upper(d) ~ 'MEDINIPUR.*EAST|EAST.*MEDINIPUR|PURBA.*MEDINIPUR' THEN 'MEDINIPUR EAST'
    WHEN upper(d) ~ 'MEDINIPUR.*WEST|WEST.*MEDINIPUR|PASCHIM.*MEDINIPUR' THEN 'MEDINIPUR WEST'
    WHEN upper(d) ~ 'BARDHAMAN.*EAST|EAST.*BARDHAMAN|PURBA.*BARDHAMAN|BURDWAN.*EAST|EAST.*BURDWAN' THEN 'PURBA BARDHAMAN'
    WHEN upper(d) ~ 'BARDHAMAN.*WEST|WEST.*BARDHAMAN|PASCHIM.*BARDHAMAN|BURDWAN.*WEST|WEST.*BURDWAN' THEN 'PASCHIM BARDHAMAN'
    WHEN upper(d) ~ 'NORTH.*24.*PARG|24.*PARG.*NORTH' THEN 'NORTH 24 PARGANAS'
    WHEN upper(d) ~ 'SOUTH.*24.*PARG|24.*PARG.*SOUTH' THEN 'SOUTH 24 PARGANAS'
    ELSE upper(btrim(d))
  END;
$$;

CREATE OR REPLACE FUNCTION public.query_district_fabricator_visits(
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_cur_month text DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(grp jsonb, cur_fabricator_visits bigint, cur_unique_fabricators bigint,
              hist_avg_monthly_visits numeric, visit_growth numeric,
              avg_duration_mins numeric, pct_of_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_month text := coalesce(p_cur_month, public.visits_latest_month());
  v_cur_start date;
  v_cur_end date;
  v_hist_start date;
  v_hist_end date;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    p_limit := 100;
  end if;
  v_cur_start := (v_month || '-01')::date;
  v_cur_end   := (date_trunc('month', v_cur_start) + interval '1 month - 1 day')::date;
  v_hist_start := (v_cur_start - interval '6 months')::date;
  v_hist_end   := (v_cur_start - interval '1 day')::date;

  return query
  with df as (
    select state, 
           public.normalize_district_key(district) as norm_district,
           count(*) filter (where visit_date between v_cur_start and v_cur_end) as cur_v,
           count(distinct customer_name) filter (where visit_date between v_cur_start and v_cur_end) as cur_u,
           count(*) filter (where visit_date between v_hist_start and v_hist_end) as hist_v,
           round(avg(nullif(duration_minutes, 0))::numeric, 1) as dur
    from public.field_visits
    where customer_type = 'FABRICATOR'
      and (p_state is null or upper(btrim(state)) = upper(btrim(p_state)) or state ilike '%' || p_state || '%')
      and (p_district is null 
           or public.normalize_district_key(district) = public.normalize_district_key(p_district)
           or district ilike '%' || p_district || '%')
    group by state, public.normalize_district_key(district)
  )
  select jsonb_build_object('state', state, 'district', norm_district) as grp,
         cur_v, cur_u,
         round((hist_v::numeric / 6.0), 2),
         round(cur_v - (hist_v::numeric / 6.0), 2),
         coalesce(dur, 0),
         round(100.0 * cur_v / nullif(sum(cur_v) over (), 0), 2)
  from df
  order by cur_v desc
  limit p_limit;
end;
$function$;
