-- ============================================================================
-- 024  query_visits_range(): the Field Visits views over any date range.
-- ============================================================================
-- The Visits page is built from the parser's JSON, which only covers the
-- running month. This returns the visit side of the page (KPIs, the district
-- fabricator counts and the sales-team activity) for an inclusive range, and
-- the same figures for the equally long period just before it, so every count
-- still has a comparison. Sales and plan figures stay monthly and are not here.
--
-- Definitions follow cloud_run_visits/main.py so a range covering the running
-- month reads the same as the JSON:
--   dealer / fabricator   customer_type as stored ('DEALER', 'FABRICATOR')
--   unique fabricators    distinct customer_name, as the parser counts them
--   avg duration          visits with a duration above 0
--   midday / afternoon    visit_time hour 10-13 / 14 and later, as shares of
--                         visits that have a time
--   state                 upper-cased: 378 rows carry a mixed-case spelling
--                         ('West Bengal') that would split a district in two
--
-- Guard: at most 93 days, so one call reads at most 186 days of visits and
-- stays well inside anon's 3 s statement timeout.
--
-- ROLLBACK
--   DROP FUNCTION public.query_visits_range(date, date, text);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.query_visits_range(
    p_from date,
    p_to date,
    p_state text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_state text := nullif(upper(trim(coalesce(p_state, ''))), '');
    v_days int;
    v_prev_from date;
    v_prev_to date;
    v_result jsonb;
BEGIN
    IF p_from IS NULL OR p_to IS NULL THEN
        RAISE EXCEPTION 'query_visits_range: both dates are required';
    END IF;
    IF p_to < p_from THEN
        RAISE EXCEPTION 'query_visits_range: the range ends before it starts';
    END IF;
    v_days := p_to - p_from + 1;
    IF v_days > 93 THEN
        RAISE EXCEPTION 'query_visits_range: ranges are limited to 93 days';
    END IF;
    IF v_state = 'ALL' THEN
        v_state := NULL;
    END IF;
    v_prev_to := p_from - 1;
    v_prev_from := p_from - v_days;

    WITH v AS MATERIALIZED (
        SELECT visit_date >= p_from AS cur,
               employee_name, visit_date, visit_time, customer_name, customer_type,
               duration_minutes, upper(trim(state)) AS state, district
        FROM public.field_visits
        WHERE visit_date >= v_prev_from AND visit_date <= p_to
          AND (v_state IS NULL OR upper(trim(state)) = v_state)
    ),
    kpi AS (
        SELECT jsonb_build_object(
            'visits', count(*) FILTER (WHERE cur),
            'prev_visits', count(*) FILTER (WHERE NOT cur),
            'dealer_visits', count(*) FILTER (WHERE cur AND customer_type = 'DEALER'),
            'fabricator_visits', count(*) FILTER (WHERE cur AND customer_type = 'FABRICATOR'),
            'prev_dealer_visits', count(*) FILTER (WHERE NOT cur AND customer_type = 'DEALER'),
            'prev_fabricator_visits', count(*) FILTER (WHERE NOT cur AND customer_type = 'FABRICATOR'),
            'dealers_visited', count(DISTINCT upper(regexp_replace(customer_name, '[^a-zA-Z0-9]', '', 'g')))
                                 FILTER (WHERE cur AND customer_type = 'DEALER'),
            'active_reps', count(DISTINCT employee_name) FILTER (WHERE cur AND coalesce(employee_name, '') <> ''),
            'prev_active_reps', count(DISTINCT employee_name) FILTER (WHERE NOT cur AND coalesce(employee_name, '') <> ''),
            'avg_dealer_duration', round(avg(duration_minutes)
                                   FILTER (WHERE cur AND customer_type = 'DEALER' AND duration_minutes > 0), 1),
            'active_days', count(DISTINCT visit_date) FILTER (WHERE cur)
        ) AS kpi
        FROM v
    ),
    districts AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'state', state,
                   'district', district,
                   'fab_visits', fab_visits,
                   'prev_fab_visits', prev_fab_visits,
                   'unique_fabricators', unique_fabricators
               ) ORDER BY fab_visits DESC, district), '[]'::jsonb) AS districts
        FROM (
            SELECT state, district,
                   count(*) FILTER (WHERE cur)::int AS fab_visits,
                   count(*) FILTER (WHERE NOT cur)::int AS prev_fab_visits,
                   count(DISTINCT customer_name) FILTER (WHERE cur)::int AS unique_fabricators
            FROM v
            WHERE customer_type = 'FABRICATOR'
              AND coalesce(district, '') NOT IN ('', 'UNKNOWN')
            GROUP BY state, district
        ) d
    ),
    reps AS (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'rep', employee_name,
                   'visits', visits,
                   'prev_visits', prev_visits,
                   'active_days', active_days,
                   'customers', customers,
                   'dealer_visits', dealer_visits,
                   'fabricator_visits', fabricator_visits,
                   'avg_duration', avg_duration,
                   'midday_pct', CASE WHEN timed > 0 THEN round(midday * 100.0 / timed, 1) ELSE 0 END,
                   'afternoon_pct', CASE WHEN timed > 0 THEN round(afternoon * 100.0 / timed, 1) ELSE 0 END
               ) ORDER BY visits DESC, employee_name), '[]'::jsonb) AS reps
        FROM (
            SELECT employee_name,
                   count(*) FILTER (WHERE cur)::int AS visits,
                   count(*) FILTER (WHERE NOT cur)::int AS prev_visits,
                   count(DISTINCT visit_date) FILTER (WHERE cur)::int AS active_days,
                   count(DISTINCT customer_name) FILTER (WHERE cur)::int AS customers,
                   count(*) FILTER (WHERE cur AND customer_type = 'DEALER')::int AS dealer_visits,
                   count(*) FILTER (WHERE cur AND customer_type = 'FABRICATOR')::int AS fabricator_visits,
                   coalesce(round(avg(duration_minutes) FILTER (WHERE cur AND duration_minutes > 0)), 0)::int AS avg_duration,
                   count(*) FILTER (WHERE cur AND visit_time IS NOT NULL) AS timed,
                   count(*) FILTER (WHERE cur AND extract(hour FROM visit_time) >= 10
                                     AND extract(hour FROM visit_time) < 14) AS midday,
                   count(*) FILTER (WHERE cur AND extract(hour FROM visit_time) >= 14) AS afternoon
            FROM v
            WHERE coalesce(employee_name, '') <> ''
            GROUP BY employee_name
        ) r
        WHERE visits > 0 OR prev_visits > 0
    )
    SELECT jsonb_build_object(
        'from', p_from,
        'to', p_to,
        'prev_from', v_prev_from,
        'prev_to', v_prev_to,
        'days', v_days,
        'state', p_state,
        'kpi', (SELECT kpi FROM kpi),
        'districts', (SELECT districts FROM districts),
        'reps', (SELECT reps FROM reps)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.query_visits_range(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_visits_range(date, date, text)
    TO anon, authenticated, service_role;
