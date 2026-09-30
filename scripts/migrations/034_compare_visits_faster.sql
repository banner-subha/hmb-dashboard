-- ============================================================================
-- 034  compare_visits_ranges(): same output, about 45% less work.
-- ============================================================================
-- The Comparison tab (compare_visits_periods wraps this) read two months,
-- about 32k rows, quickly (~12ms) and then spent the rest of its time in the
-- aggregates. Profiled 29 Sep 2026, Sep vs Aug 2026, all states:
--   count(distinct ...) for the KPIs   ~330ms  (sorting 32k names under the
--                                               database's language collation)
--   district_options                   ~110ms  (a jsonb object built per row
--                                               before DISTINCT)
--   ten ILIKE '%DEALER%' / '%FABRICATOR%' tests per row
--
-- Three changes, nothing else:
--   1. The working set's text columns are COLLATE "C". Distinct counts and
--      GROUP BY are unchanged (equality is byte equality under both); sorting
--      for them is much cheaper. The district filter keeps the default
--      collation for its ILIKE, so case folding is as before.
--   2. is_dealer / is_fab are computed once per row and reused.
--   3. district_options takes DISTINCT state, district first, then builds.
--
-- Verified against the old body on 7 filter combinations (months, weeks, a
-- year back, ALL, mixed-case state and district): every key equal as a set.
-- Rows with equal visits_a in reps and customer_types may come back in a
-- different order; that order was never defined (ORDER BY visits_a only).
--
-- Timed, three runs:
--   all states    old 626-972ms  ->  new 346-572ms
--   West Bengal   old 370-729ms  ->  new 214-376ms
--
-- ROLLBACK
--   Re-apply the previous body (from before 034) with CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compare_visits_ranges(p_a_from date, p_a_to date, p_b_from date, p_b_to date, p_state text DEFAULT NULL::text, p_district text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_a_start date;
    v_a_end date;
    v_b_start date;
    v_b_end date;
    v_result jsonb;
BEGIN
    IF p_a_from IS NULL OR p_a_to IS NULL OR p_b_from IS NULL OR p_b_to IS NULL THEN
        RAISE EXCEPTION 'compare_visits_ranges: all four dates are required';
    END IF;
    IF p_a_to < p_a_from OR p_b_to < p_b_from THEN
        RAISE EXCEPTION 'compare_visits_ranges: a range ends before it starts';
    END IF;
    IF p_a_to - p_a_from > 400 OR p_b_to - p_b_from > 400 THEN
        RAISE EXCEPTION 'compare_visits_ranges: ranges are limited to 400 days';
    END IF;

    -- Inclusive "to" dates become exclusive upper bounds.
    v_a_start := p_a_from;
    v_a_end := p_a_to + 1;
    v_b_start := p_b_from;
    v_b_end := p_b_to + 1;

    WITH visits_state AS MATERIALIZED (
        SELECT
            true AS is_a,
            v.employee_name COLLATE "C" AS employee_name,
            v.visit_date,
            v.customer_name COLLATE "C" AS customer_name,
            coalesce(v.customer_type, 'OTHER') COLLATE "C" AS customer_type,
            coalesce(v.duration_minutes, 0) AS duration_minutes,
            coalesce(v.state, 'Unknown') COLLATE "C" AS state,
            coalesce(v.district, 'Unknown') COLLATE "C" AS district,
            (coalesce(v.customer_type, 'OTHER') ILIKE '%DEALER%' AND coalesce(v.customer_type, 'OTHER') NOT ILIKE '%SUB%') AS is_dealer,
            coalesce(v.customer_type, 'OTHER') ILIKE '%FABRICATOR%' AS is_fab
        FROM public.field_visits v
        WHERE v.visit_date >= v_a_start AND v.visit_date < v_a_end
          AND (p_state IS NULL OR p_state = 'ALL' OR v.state ILIKE p_state)
        UNION ALL
        SELECT
            false AS is_a,
            v.employee_name COLLATE "C" AS employee_name,
            v.visit_date,
            v.customer_name COLLATE "C" AS customer_name,
            coalesce(v.customer_type, 'OTHER') COLLATE "C" AS customer_type,
            coalesce(v.duration_minutes, 0) AS duration_minutes,
            coalesce(v.state, 'Unknown') COLLATE "C" AS state,
            coalesce(v.district, 'Unknown') COLLATE "C" AS district,
            (coalesce(v.customer_type, 'OTHER') ILIKE '%DEALER%' AND coalesce(v.customer_type, 'OTHER') NOT ILIKE '%SUB%') AS is_dealer,
            coalesce(v.customer_type, 'OTHER') ILIKE '%FABRICATOR%' AS is_fab
        FROM public.field_visits v
        WHERE v.visit_date >= v_b_start AND v.visit_date < v_b_end
          AND (p_state IS NULL OR p_state = 'ALL' OR v.state ILIKE p_state)
    ),
    district_options AS (
        SELECT jsonb_agg(d ORDER BY d->>'state', d->>'district') AS district_options
        FROM (
            SELECT jsonb_build_object('state', state, 'district', district) AS d FROM (SELECT DISTINCT state, district
            FROM visits_state
            WHERE district IS NOT NULL
              AND trim(district) != ''
              AND upper(trim(district)) != 'UNKNOWN'
              AND state IS NOT NULL
              AND trim(state) != ''
              AND upper(trim(state)) != 'UNKNOWN'
        ) u) x
    ),
    visits AS MATERIALIZED (
        SELECT *
        FROM visits_state
        WHERE p_district IS NULL OR p_district = 'ALL' OR district COLLATE "default" ILIKE p_district
    ),
    totals AS (
        SELECT
            count(*) FILTER (WHERE is_a)::int as tot_a,
            count(*) FILTER (WHERE NOT is_a)::int as tot_b
        FROM visits
    ),
    kpi AS (
        SELECT
            jsonb_build_object(
                'total_visits', count(*) FILTER (WHERE is_a)::int,
                'unique_customers', count(distinct customer_name) FILTER (WHERE is_a)::int,
                'active_reps', count(distinct employee_name) FILTER (WHERE is_a)::int,
                'avg_duration', round(coalesce(avg(duration_minutes) FILTER (WHERE is_a), 0), 1)::numeric,
                'dealer_visits', count(*) FILTER (WHERE is_a AND is_dealer)::int,
                'fabricator_visits', count(*) FILTER (WHERE is_a AND is_fab)::int
            ) as kpi_a,
            jsonb_build_object(
                'total_visits', count(*) FILTER (WHERE NOT is_a)::int,
                'unique_customers', count(distinct customer_name) FILTER (WHERE NOT is_a)::int,
                'active_reps', count(distinct employee_name) FILTER (WHERE NOT is_a)::int,
                'avg_duration', round(coalesce(avg(duration_minutes) FILTER (WHERE NOT is_a), 0), 1)::numeric,
                'dealer_visits', count(*) FILTER (WHERE NOT is_a AND is_dealer)::int,
                'fabricator_visits', count(*) FILTER (WHERE NOT is_a AND is_fab)::int
            ) as kpi_b
        FROM visits
    ),
    states_agg AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'state', state,
                'visits_a', visits_a,
                'visits_b', visits_b,
                'delta', visits_a - visits_b,
                'growth_pct', round(CASE WHEN visits_b > 0 THEN ((visits_a::numeric - visits_b) / visits_b::numeric) * 100 ELSE NULL END, 1),
                'dealers_a', dealers_a,
                'dealers_b', dealers_b,
                'fabricators_a', fab_a,
                'fabricators_b', fab_b
            ) ORDER BY visits_a DESC
        ) as states
        FROM (
            SELECT
                state,
                count(*) FILTER (WHERE is_a)::int as visits_a,
                count(*) FILTER (WHERE NOT is_a)::int as visits_b,
                count(*) FILTER (WHERE is_a AND is_dealer)::int as dealers_a,
                count(*) FILTER (WHERE NOT is_a AND is_dealer)::int as dealers_b,
                count(*) FILTER (WHERE is_a AND is_fab)::int as fab_a,
                count(*) FILTER (WHERE NOT is_a AND is_fab)::int as fab_b
            FROM visits
            WHERE state IS NOT NULL
              AND trim(state) != ''
              AND upper(trim(state)) != 'UNKNOWN'
            GROUP BY state
        ) s
    ),
    dist_agg AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'state', state,
                'district', district,
                'visits_a', visits_a,
                'visits_b', visits_b,
                'delta', visits_a - visits_b,
                'growth_pct', round(CASE WHEN visits_b > 0 THEN ((visits_a::numeric - visits_b) / visits_b::numeric) * 100 ELSE NULL END, 1),
                'fabricators_a', fab_a,
                'fabricators_b', fab_b,
                'customers_a', cust_a,
                'customers_b', cust_b
            ) ORDER BY visits_a DESC
        ) as districts
        FROM (
            SELECT
                state, district,
                count(*) FILTER (WHERE is_a)::int as visits_a,
                count(*) FILTER (WHERE NOT is_a)::int as visits_b,
                count(*) FILTER (WHERE is_a AND is_fab)::int as fab_a,
                count(*) FILTER (WHERE NOT is_a AND is_fab)::int as fab_b,
                count(distinct customer_name) FILTER (WHERE is_a)::int as cust_a,
                count(distinct customer_name) FILTER (WHERE NOT is_a)::int as cust_b
            FROM visits
            WHERE district IS NOT NULL
              AND trim(district) != ''
              AND upper(trim(district)) != 'UNKNOWN'
            GROUP BY state, district
        ) d
    ),
    reps_agg AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'rep', employee_name,
                'visits_a', visits_a,
                'visits_b', visits_b,
                'delta', visits_a - visits_b,
                'growth_pct', round(CASE WHEN visits_b > 0 THEN ((visits_a::numeric - visits_b) / visits_b::numeric) * 100 ELSE NULL END, 1),
                'active_days_a', days_a,
                'active_days_b', days_b,
                'customers_a', cust_a,
                'customers_b', cust_b
            ) ORDER BY visits_a DESC
        ) as reps
        FROM (
            SELECT
                employee_name,
                count(*) FILTER (WHERE is_a)::int as visits_a,
                count(*) FILTER (WHERE NOT is_a)::int as visits_b,
                count(distinct visit_date) FILTER (WHERE is_a)::int as days_a,
                count(distinct visit_date) FILTER (WHERE NOT is_a)::int as days_b,
                count(distinct customer_name) FILTER (WHERE is_a)::int as cust_a,
                count(distinct customer_name) FILTER (WHERE NOT is_a)::int as cust_b
            FROM visits
            WHERE employee_name IS NOT NULL AND employee_name != ''
            GROUP BY employee_name
        ) r
    ),
    cust_types_agg AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'customer_type', customer_type,
                'visits_a', visits_a,
                'visits_b', visits_b,
                'delta', visits_a - visits_b,
                'growth_pct', round(CASE WHEN visits_b > 0 THEN ((visits_a::numeric - visits_b) / visits_b::numeric) * 100 ELSE NULL END, 1),
                'share_a_pct', round(CASE WHEN (SELECT tot_a FROM totals) > 0 THEN (visits_a::numeric / (SELECT tot_a FROM totals)::numeric) * 100 ELSE 0 END, 1),
                'share_b_pct', round(CASE WHEN (SELECT tot_b FROM totals) > 0 THEN (visits_b::numeric / (SELECT tot_b FROM totals)::numeric) * 100 ELSE 0 END, 1)
            ) ORDER BY visits_a DESC
        ) as customer_types
        FROM (
            SELECT
                customer_type,
                count(*) FILTER (WHERE is_a)::int as visits_a,
                count(*) FILTER (WHERE NOT is_a)::int as visits_b
            FROM visits
            GROUP BY customer_type
        ) ct
    ),
    cust_acc AS MATERIALIZED (
        SELECT
            customer_name, state, district, customer_type,
            count(*) FILTER (WHERE is_a)::int as visits_a,
            count(*) FILTER (WHERE NOT is_a)::int as visits_b,
            (count(*) FILTER (WHERE is_a) - count(*) FILTER (WHERE NOT is_a))::int as delta
        FROM visits
        WHERE customer_name IS NOT NULL AND customer_name != ''
        GROUP BY customer_name, state, district, customer_type
    ),
    gainers AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'customer_name', customer_name,
                'state', state,
                'district', district,
                'customer_type', customer_type,
                'visits_a', visits_a,
                'visits_b', visits_b,
                'delta', delta
            )
        ) as top_gainers
        FROM (
            SELECT * FROM cust_acc WHERE delta > 0 ORDER BY delta DESC LIMIT 10
        ) g
    ),
    decliners AS (
        SELECT jsonb_agg(
            jsonb_build_object(
                'customer_name', customer_name,
                'state', state,
                'district', district,
                'customer_type', customer_type,
                'visits_a', visits_a,
                'visits_b', visits_b,
                'delta', delta
            )
        ) as top_decliners
        FROM (
            SELECT * FROM cust_acc WHERE delta < 0 ORDER BY delta ASC LIMIT 10
        ) d
    )
    SELECT jsonb_build_object(
        'period_a', p_a_from::text || '..' || p_a_to::text,
        'period_b', p_b_from::text || '..' || p_b_to::text,
        'state_filter', p_state,
        'district_filter', p_district,
        'district_options', coalesce(dopt.district_options, '[]'::jsonb),
        'kpi_a', k.kpi_a,
        'kpi_b', k.kpi_b,
        'states', coalesce(s.states, '[]'::jsonb),
        'districts', coalesce(di.districts, '[]'::jsonb),
        'reps', coalesce(r.reps, '[]'::jsonb),
        'customer_types', coalesce(ct.customer_types, '[]'::jsonb),
        'top_gainers', coalesce(g.top_gainers, '[]'::jsonb),
        'top_decliners', coalesce(de.top_decliners, '[]'::jsonb)
    ) INTO v_result
    FROM kpi k, states_agg s, dist_agg di, reps_agg r, cust_types_agg ct,
         gainers g, decliners de, district_options dopt;

    RETURN v_result;
END;
$function$;
