-- ============================================================================
-- 029  get_visits_calendar(): month counts only, fast enough for anon.
-- ============================================================================
-- The Comparison tab calls this on every Visits page load (a prefetch, then the
-- tab itself) as anon, whose statement timeout is 3 s. It returned, per month,
-- count(*), count(DISTINCT customer_name) and count(DISTINCT employee_name).
-- The distinct counts sort all ~310k rows of field_visits on every call: 1.3 s
-- warm, 3.7-7.4 s cold or while the page's other requests ran, so it failed
-- with a 500 on most page loads on 2026-09-28 and slowed the requests beside
-- it.
--
-- Nothing reads those two counts: VisitComparisonTab.jsx uses `years`,
-- `by_year[year][].month` and `latest_month` only, and no chatbot or n8n code
-- calls this function. They are dropped; each month keeps `visits`, which a
-- parallel index-only scan of idx_field_visits_date counts in about 130 ms
-- warm (370 ms cold).
--
-- Output: { years: ['2026', '2025'], by_year: { '2026': [{ month: '2026-09',
-- visits }] , ... }, latest_month: '2026-09' }, months newest first.
--
-- ROLLBACK
--   Re-run get_visits_calendar from 020_compare_periods_wraps_ranges.sql.
-- ============================================================================

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
    WITH months AS (
        SELECT date_trunc('month', visit_date)::date AS m, count(*)::int AS visits
        FROM public.field_visits
        GROUP BY 1
    ),
    by_year AS (
        SELECT to_char(m, 'YYYY') AS yr,
               jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'visits', visits)
                         ORDER BY m DESC) AS months
        FROM months
        GROUP BY 1
    )
    SELECT jsonb_build_object(
        'years', (SELECT jsonb_agg(yr ORDER BY yr DESC) FROM by_year),
        'by_year', (SELECT jsonb_object_agg(yr, months) FROM by_year),
        'latest_month', (SELECT to_char(max(m), 'YYYY-MM') FROM months)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;
