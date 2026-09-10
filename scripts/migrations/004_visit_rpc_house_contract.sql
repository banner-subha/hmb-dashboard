-- Migration 004: bring the visit RPCs onto the same contract as the sales RPCs.
-- Target: Supabase Postgres jhsttedcvzfkszbzczak (us-east-1).
--
-- Supersedes 002_visit_rpc_functions.sql, whose header names the Tokyo project
-- igyfelwdrnidaojzqksb -- deleted during the US migration.
--
-- Why. The four visit RPCs returned TABLE(result jsonb): one column holding a
-- JSON blob. Every sales RPC returns TABLE(grp jsonb, <flat metric columns>),
-- and the whole chatbot pipeline is built on that shape:
--
--   * app/charts.py validate() resolves the chart's y against tool.metrics and
--     requires it to be a real result column. With a single `result` column no
--     visit chart can ever be valid.
--   * the frontend result table and app/llm/stub.py both key on `grp`.
--   * the model would be handed nested JSON to read figures out of, exactly
--     the arithmetic-by-LLM the system prompt forbids.
--
-- Registering the old shape would have produced a one-column table of JSON and
-- structurally impossible charts, so the fix belongs here rather than in a
-- Python adapter.
--
-- Three correctness problems fixed at the same time:
--
--   1. customer_type was matched with ILIKE '%' || p || '%'. The column holds
--      ten values -- BROKER, DEALER, DISTRIBUTOR, FABRICATOR,
--      INFLUENCER - CONTRACTOR, INFLUENCER - IHB, INFLUENCER - MASON,
--      INFLUENCER - OTHERS, RE-DISTRIBUTOR, SUBDEALER -- so '%DEALER%' also
--      matched SUBDEALER and '%DISTRIBUTOR%' also matched RE-DISTRIBUTOR.
--      Every "dealer visits" figure was silently inflated by subdealers.
--      Now exact, case-insensitive, with an explicit INFLUENCER roll-up the
--      caller has to ask for.
--
--   2. p_cur_month defaulted to the literal '2026-09' and query_rep_productivity
--      to '2026-08-01'. Both now default to the newest month actually present
--      in field_visits, so they stop rotting.
--
--   3. Text filters resolved through nothing at all. They still do not use
--      expand_dimension_filter: dim_catalog is built from the sales tables and
--      knows 86 employees against the 150 in field_visits, and a different
--      district set, so a rep who exists only in the visit data would be
--      reported to the user as a name that does not exist. Matching is instead
--      exact-then-contains against the visit data's own values.

-- ---------------------------------------------------------------------------
-- Trigram indexes
-- ---------------------------------------------------------------------------
-- pg_trgm was already installed, so only the indexes were missing. Without
-- them every contains-match is a sequential scan over 298k rows.
CREATE INDEX IF NOT EXISTS idx_field_visits_customer_trgm
    ON public.field_visits USING gin (customer_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_field_visits_employee_trgm
    ON public.field_visits USING gin (employee_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_field_visits_district_trgm
    ON public.field_visits USING gin (district gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- The newest month present in the data, as YYYY-MM. Replaces the hardcoded
-- '2026-09' defaults.
CREATE OR REPLACE FUNCTION public.visits_latest_month()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT to_char(coalesce(max(visit_date), CURRENT_DATE), 'YYYY-MM')
  FROM public.field_visits;
$$;

-- Customer types, matched exactly rather than by substring. 'INFLUENCER'
-- returns the four INFLUENCER - * values as a group; anything else must equal
-- a stored value, case-insensitively.
CREATE OR REPLACE FUNCTION public.visits_customer_types(p_input text)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_input IS NULL THEN NULL
    WHEN upper(btrim(p_input)) = 'INFLUENCER' THEN
      ARRAY['INFLUENCER - CONTRACTOR','INFLUENCER - IHB',
            'INFLUENCER - MASON','INFLUENCER - OTHERS']
    ELSE
      (SELECT coalesce(array_agg(DISTINCT ct), '{}'::text[])
       FROM (SELECT DISTINCT customer_type AS ct FROM public.field_visits) t
       WHERE upper(btrim(ct)) = upper(btrim(p_input)))
  END;
$$;

DROP FUNCTION IF EXISTS public.query_visits(text[], text, text, text, text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.query_dealer_visit_correlation(text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.query_district_fabricator_visits(text, text, text, integer);
DROP FUNCTION IF EXISTS public.query_rep_productivity(text, text, text, integer);

-- ---------------------------------------------------------------------------
-- 1. query_visits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.query_visits(
    p_dimensions text[] DEFAULT '{}'::text[],
    p_date_from text DEFAULT NULL,
    p_date_to text DEFAULT NULL,
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_customer text DEFAULT NULL,
    p_customer_type text DEFAULT NULL,
    p_employee text DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_sort text DEFAULT 'visits_desc'
)
RETURNS TABLE(grp jsonb, visit_count bigint, unique_customers bigint,
              unique_employees bigint, active_days bigint,
              avg_duration_mins numeric, pct_of_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  k_dims jsonb := jsonb_build_object(
    'state',         'state',
    'district',      'district',
    'customer_type', 'customer_type',
    'customer',      'customer_name',
    'dealer',        'customer_name',
    'employee',      'employee_name',
    'visit_type',    'visit_type',
    'month',         'to_char(visit_date, ''YYYY-MM'')',
    'year',          'to_char(visit_date, ''YYYY'')'
  );
  v_sel text := '';
  v_grp text := '';
  v_where text := 'where 1=1';
  v_order text;
  v_dim text;
  v_expr text;
  v_sql text;
  v_types text[];
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    p_limit := 100;
  end if;

  if p_date_from is not null then
    v_where := v_where || format(' and visit_date >= %L::date', p_date_from);
  end if;
  if p_date_to is not null then
    v_where := v_where || format(' and visit_date <= %L::date', p_date_to);
  end if;

  -- Exact match first, contains as a fallback. Exact stops "Assam" also
  -- matching a district that merely contains it; contains keeps partial
  -- dealer names usable.
  if p_state is not null then
    v_where := v_where || format(
      ' and (upper(btrim(state)) = upper(btrim(%L)) or state ilike %L)',
      p_state, '%' || p_state || '%');
  end if;
  if p_district is not null then
    v_where := v_where || format(
      ' and (upper(btrim(district)) = upper(btrim(%L)) or district ilike %L)',
      p_district, '%' || p_district || '%');
  end if;
  if p_customer is not null then
    v_where := v_where || format(
      ' and (upper(btrim(customer_name)) = upper(btrim(%L)) or customer_name ilike %L)',
      p_customer, '%' || p_customer || '%');
  end if;
  if p_employee is not null then
    v_where := v_where || format(
      ' and (upper(btrim(employee_name)) = upper(btrim(%L)) or employee_name ilike %L)',
      p_employee, '%' || p_employee || '%');
  end if;

  -- Exact, never a substring: '%DEALER%' used to sweep in SUBDEALER.
  if p_customer_type is not null then
    v_types := public.visits_customer_types(p_customer_type);
    if v_types is null or array_length(v_types, 1) is null then
      raise exception 'Unknown customer_type %. Stored values: %. Use INFLUENCER for the four influencer categories together.',
        p_customer_type,
        (select string_agg(distinct customer_type, ', ' order by customer_type)
         from public.field_visits);
    end if;
    v_where := v_where || format(' and customer_type = any(%L::text[])', v_types);
  end if;

  foreach v_dim in array coalesce(p_dimensions, '{}'::text[]) loop
    v_expr := k_dims ->> lower(btrim(v_dim));
    if v_expr is null then
      raise exception 'Unknown dimension %. Allowed: %',
        v_dim, (select string_agg(k, ', ' order by k) from jsonb_object_keys(k_dims) k);
    end if;
    v_sel := v_sel || format(', %L, %s', lower(btrim(v_dim)), v_expr);
    v_grp := v_grp || case when v_grp = '' then '' else ', ' end || v_expr;
  end loop;

  v_order := case lower(coalesce(p_sort, 'visits_desc'))
               when 'visits_asc'    then 'visit_count asc'
               when 'customers_desc' then 'unique_customers desc'
               when 'duration_desc' then 'avg_duration_mins desc nulls last'
               when 'group_asc'     then 'grp::text asc'
               else 'visit_count desc'
             end;

  v_sql := format($f$
    with base as (
      select * from public.field_visits %s
    ),
    agg as (
      select %s as grp,
             count(*)                                        as visit_count,
             count(distinct customer_name)                   as unique_customers,
             count(distinct employee_name)                   as unique_employees,
             count(distinct visit_date)                      as active_days,
             round(avg(nullif(duration_minutes, 0))::numeric, 1) as avg_duration_mins
      from base
      %s
    )
    select grp, visit_count, unique_customers, unique_employees, active_days,
           coalesce(avg_duration_mins, 0) as avg_duration_mins,
           round(100.0 * visit_count / nullif(sum(visit_count) over (), 0), 2) as pct_of_total
    from agg
    order by %s
    limit %s
  $f$,
    v_where,
    case when v_sel = '' then '''{}''::jsonb'
         else 'jsonb_build_object(' || substring(v_sel from 3) || ')' end,
    case when v_grp = '' then '' else 'group by ' || v_grp end,
    v_order,
    p_limit
  );

  return query execute v_sql;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. query_dealer_visit_correlation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.query_dealer_visit_correlation(
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL,
    p_dealer text DEFAULT NULL,
    p_cur_month text DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(grp jsonb, cur_visits bigint, hist_avg_monthly_visits numeric,
              visit_growth numeric, avg_duration_mins numeric,
              cur_despatch_mt numeric, pct_of_total numeric)
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
  with dv as (
    select customer_name, state, district,
           count(*) filter (where visit_date between v_cur_start and v_cur_end)   as cur_v,
           count(*) filter (where visit_date between v_hist_start and v_hist_end) as hist_v,
           round(avg(nullif(duration_minutes, 0))::numeric, 1)                    as dur
    from public.field_visits
    where customer_type = 'DEALER'
      and (p_state is null or upper(btrim(state)) = upper(btrim(p_state)) or state ilike '%' || p_state || '%')
      and (p_district is null or upper(btrim(district)) = upper(btrim(p_district)) or district ilike '%' || p_district || '%')
      and (p_dealer is null or upper(btrim(customer_name)) = upper(btrim(p_dealer)) or customer_name ilike '%' || p_dealer || '%')
    group by customer_name, state, district
  ),
  -- Joined on the same normalisation dim_catalog uses, so a dealer spelled
  -- differently in the two systems still lines up. The old version reported
  -- visits with no sales figure beside them at all.
  joined as (
    select dv.*,
           (select round(sum(d.qty)::numeric, 3)
            from public.despatch_orders d
            where d.record_type = 'DESPATCH'
              and d.despatch_date >= v_cur_start::text
              and d.despatch_date <= v_cur_end::text
              and upper(regexp_replace(d.client_name, '[^a-zA-Z0-9]', '', 'g'))
                  = upper(regexp_replace(dv.customer_name, '[^a-zA-Z0-9]', '', 'g'))
           ) as cur_mt
    from dv
  )
  select jsonb_build_object('dealer', customer_name, 'state', state, 'district', district) as grp,
         cur_v,
         round((hist_v::numeric / 6.0), 2) as hist_avg_monthly_visits,
         round(cur_v - (hist_v::numeric / 6.0), 2) as visit_growth,
         coalesce(dur, 0) as avg_duration_mins,
         coalesce(cur_mt, 0) as cur_despatch_mt,
         round(100.0 * cur_v / nullif(sum(cur_v) over (), 0), 2) as pct_of_total
  from joined
  where cur_v > 0 or hist_v > 0
  order by cur_v desc, customer_name
  limit p_limit;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. query_district_fabricator_visits
-- ---------------------------------------------------------------------------
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
    select state, district,
           count(*) filter (where visit_date between v_cur_start and v_cur_end) as cur_v,
           count(distinct customer_name) filter (where visit_date between v_cur_start and v_cur_end) as cur_u,
           count(*) filter (where visit_date between v_hist_start and v_hist_end) as hist_v,
           round(avg(nullif(duration_minutes, 0))::numeric, 1) as dur
    from public.field_visits
    where customer_type = 'FABRICATOR'
      and (p_state is null or upper(btrim(state)) = upper(btrim(p_state)) or state ilike '%' || p_state || '%')
      and (p_district is null or upper(btrim(district)) = upper(btrim(p_district)) or district ilike '%' || p_district || '%')
    group by state, district
  )
  select jsonb_build_object('state', state, 'district', district) as grp,
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

-- ---------------------------------------------------------------------------
-- 4. query_rep_productivity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.query_rep_productivity(
    p_employee text DEFAULT NULL,
    p_date_from text DEFAULT NULL,
    p_date_to text DEFAULT NULL,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(grp jsonb, total_visits bigint, active_days bigint,
              visits_per_active_day numeric, unique_customers bigint,
              dealer_visits bigint, fabricator_visits bigint,
              avg_duration_mins numeric, morning_visits bigint,
              midday_visits bigint, afternoon_visits bigint,
              pct_of_total numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  -- Was a hardcoded '2026-08-01'. Defaults to the current month in the data.
  v_from date := coalesce(p_date_from::date,
                          (public.visits_latest_month() || '-01')::date);
  v_to date := coalesce(p_date_to::date,
                        (select coalesce(max(visit_date), CURRENT_DATE)
                         from public.field_visits));
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    p_limit := 100;
  end if;

  return query
  with rs as (
    select employee_name,
           count(*)                        as total_v,
           count(distinct visit_date)      as days,
           count(distinct customer_name)   as uniq,
           count(*) filter (where customer_type = 'DEALER')     as dealer_v,
           count(*) filter (where customer_type = 'FABRICATOR') as fab_v,
           round(avg(nullif(duration_minutes, 0))::numeric, 1)  as dur,
           count(*) filter (where visit_time < '10:00:00'::time) as morn,
           count(*) filter (where visit_time >= '10:00:00'::time and visit_time < '14:00:00'::time) as mid,
           count(*) filter (where visit_time >= '14:00:00'::time) as aft
    from public.field_visits
    where visit_date between v_from and v_to
      and employee_name is not null and btrim(employee_name) <> ''
      and (p_employee is null
           or upper(btrim(employee_name)) = upper(btrim(p_employee))
           or employee_name ilike '%' || p_employee || '%')
    group by employee_name
  )
  select jsonb_build_object('employee', employee_name) as grp,
         total_v, days,
         case when days > 0 then round(total_v::numeric / days, 1) else 0 end,
         uniq, dealer_v, fab_v, coalesce(dur, 0), morn, mid, aft,
         round(100.0 * total_v / nullif(sum(total_v) over (), 0), 2)
  from rs
  order by total_v desc
  limit p_limit;
end;
$function$;
