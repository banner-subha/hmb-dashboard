-- ============================================================================
-- 020  compare_visits_periods() becomes a wrapper over compare_visits_ranges();
--      get_visits_calendar() reports the latest visit day.
-- ============================================================================
-- 1. One copy of the comparison math. compare_visits_periods keeps its
--    signature and its exact output (period_a / period_b stay 'YYYY-MM'),
--    verified 2026-09-24 by md5 of the full jsonb for five month pairs across
--    state and district scopes, before and after.
--
-- 2. The week picker needs the last day with visits, not just the month, to
--    know how much of the running week exists and to trim the benchmark to
--    the same days. Added as 'latest_date' ('YYYY-MM-DD'); existing keys are
--    unchanged. search_path is now pinned, as on every other SECURITY DEFINER
--    function here.
--
-- ROLLBACK
--   Re-create compare_visits_periods from the body in 019 (swap the date
--   arithmetic back to p_period_a || '-01'), and get_visits_calendar without
--   'latest_date'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compare_visits_periods(
    p_period_a text,
    p_period_b text,
    p_state text DEFAULT NULL,
    p_district text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_a_start date := (p_period_a || '-01')::date;
    v_b_start date := (p_period_b || '-01')::date;
BEGIN
    RETURN public.compare_visits_ranges(
        v_a_start, (v_a_start + INTERVAL '1 month')::date - 1,
        v_b_start, (v_b_start + INTERVAL '1 month')::date - 1,
        p_state, p_district
    ) || jsonb_build_object('period_a', p_period_a, 'period_b', p_period_b);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_visits_calendar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    WITH bounds AS (
        SELECT
            date_trunc('month', min(visit_date))::date AS min_month,
            date_trunc('month', max(visit_date))::date AS max_month
        FROM public.field_visits
    ),
    months_series AS (
        SELECT
            to_char(m, 'YYYY') AS yr,
            to_char(m, 'YYYY-MM') AS ym
        FROM bounds b,
             generate_series(b.min_month, b.max_month, '1 month'::interval) m
    ),
    by_year AS (
        SELECT
            yr,
            jsonb_agg(
                jsonb_build_object(
                    'month', ym
                ) ORDER BY ym DESC
            ) as months
        FROM months_series
        GROUP BY yr
        ORDER BY yr DESC
    ),
    all_years AS (
        SELECT jsonb_agg(DISTINCT yr ORDER BY yr DESC) as years FROM months_series
    ),
    latest AS (
        SELECT
            to_char(max(visit_date), 'YYYY-MM') as latest_ym,
            to_char(max(visit_date), 'YYYY-MM-DD') as latest_day
        FROM public.field_visits
    )
    SELECT jsonb_build_object(
        'years', (SELECT years FROM all_years),
        'by_year', jsonb_object_agg(yr, months),
        'latest_month', (SELECT latest_ym FROM latest),
        'latest_date', (SELECT latest_day FROM latest)
    )
    INTO v_result
    FROM by_year;

    RETURN v_result;
END;
$function$;
