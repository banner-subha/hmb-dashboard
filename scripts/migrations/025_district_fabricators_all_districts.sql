-- ============================================================================
-- 025  query_district_fabricators(): 'ALL' districts in a state.
-- ============================================================================
-- The fabricator panel gains State and District filters, and "All districts"
-- lists every fabricator visited in a state. p_district = 'ALL' (any case)
-- now means every district of p_state; '' still means "not recorded", and any
-- other value is one district, as in 023.
--
-- Fabricators are grouped on (customer_name, district) and each carries its
-- district. For one district that is the same grouping as before, so its totals
-- still match the table row; across districts it keeps a name that occurs in
-- two districts as two fabricators, the way the table counts them.
--
-- Guard: 400 days for one district, as before. 31 days for a whole state:
-- West Bengal over 93 days is 5,700 fabricators, which took 2.1 s warm and
-- 12.9 s cold as anon (3 s timeout). A month is about 3,700 fabricators,
-- 110-130 ms warm, an 845 kB response before compression.
--
-- ROLLBACK
--   Re-run the function body from 023 (with 023b's join), or
--   DROP FUNCTION public.query_district_fabricators(date, date, text, text);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.query_district_fabricators(
    p_from date,
    p_to date,
    p_state text,
    p_district text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_state text := upper(trim(coalesce(p_state, '')));
    v_district text := upper(trim(coalesce(p_district, '')));
    v_all boolean;
    v_result jsonb;
BEGIN
    v_all := v_district = 'ALL';
    IF p_from IS NULL OR p_to IS NULL THEN
        RAISE EXCEPTION 'query_district_fabricators: both dates are required';
    END IF;
    IF p_to < p_from THEN
        RAISE EXCEPTION 'query_district_fabricators: the range ends before it starts';
    END IF;
    IF p_to - p_from > 400 THEN
        RAISE EXCEPTION 'query_district_fabricators: ranges are limited to 400 days';
    END IF;
    IF v_all AND p_to - p_from + 1 > 31 THEN
        RAISE EXCEPTION 'query_district_fabricators: a whole state is limited to 31 days';
    END IF;

    WITH v AS MATERIALIZED (
        SELECT customer_name, employee_name, visit_date, city, pincode,
               coalesce(nullif(district, 'UNKNOWN'), '') AS district
        FROM public.field_visits
        WHERE visit_date >= p_from AND visit_date <= p_to
          AND customer_type = 'FABRICATOR'
          AND upper(trim(coalesce(state, ''))) = v_state
          AND CASE WHEN v_all THEN true
                   WHEN v_district = '' THEN coalesce(district, '') IN ('', 'UNKNOWN')
                   ELSE district = v_district END
    ),
    by_rep AS (
        SELECT customer_name, district,
               coalesce(nullif(trim(employee_name), ''), 'Not recorded') AS rep,
               count(*)::int AS visits
        FROM v GROUP BY 1, 2, 3
    ),
    reps AS (
        SELECT customer_name, district,
               jsonb_agg(jsonb_build_object('name', rep, 'visits', visits)
                         ORDER BY visits DESC, rep) AS reps
        FROM by_rep GROUP BY 1, 2
    ),
    fab AS (
        SELECT customer_name, district,
               count(*)::int AS visits,
               min(visit_date) AS first_visit,
               max(visit_date) AS last_visit,
               mode() WITHIN GROUP (ORDER BY city) FILTER (WHERE coalesce(city, '') <> '') AS city,
               mode() WITHIN GROUP (ORDER BY pincode) FILTER (WHERE coalesce(pincode, '') <> '') AS pincode
        FROM v GROUP BY 1, 2
    )
    SELECT jsonb_build_object(
        'from', p_from,
        'to', p_to,
        'state', p_state,
        'district', p_district,
        'total_visits', (SELECT count(*) FROM v)::int,
        'fabricators', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'name', f.customer_name,
                'district', f.district,
                'visits', f.visits,
                'first_visit', f.first_visit,
                'last_visit', f.last_visit,
                'city', f.city,
                'pincode', f.pincode,
                'reps', r.reps
            ) ORDER BY f.visits DESC, f.last_visit DESC, f.customer_name)
            FROM fab f JOIN reps r USING (customer_name, district)), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.query_district_fabricators(date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_district_fabricators(date, date, text, text)
    TO anon, authenticated, service_role;
