-- ============================================================================
-- 027  query_district_fabricators(): 'ALL' states.
-- ============================================================================
-- The fabricator panel's State filter gains "All states". p_state = 'ALL'
-- (any case) reads every state and implies every district; the 31-day limit
-- for a whole state (025) covers it too. Fabricators are grouped on
-- (customer_name, state, district) and each carries its state, so a list
-- across states can say where each one is. One state or one district is
-- unchanged: all its rows share the same state.
--
-- Relies on 026: states are stored upper-case and one spelling each, so the
-- per-fabricator state is not split by spelling.
--
-- ROLLBACK
--   Re-run the function body from 025 (with 025b's 31-day guard).
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
    v_all_states boolean;
    v_result jsonb;
BEGIN
    v_all_states := v_state = 'ALL';
    v_all := v_district = 'ALL' OR v_all_states;
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
        RAISE EXCEPTION 'query_district_fabricators: a whole state or all states is limited to 31 days';
    END IF;

    WITH v AS MATERIALIZED (
        SELECT customer_name, employee_name, visit_date, city, pincode,
               coalesce(nullif(upper(trim(state)), 'UNKNOWN'), '') AS state,
               coalesce(nullif(district, 'UNKNOWN'), '') AS district
        FROM public.field_visits
        WHERE visit_date >= p_from AND visit_date <= p_to
          AND customer_type = 'FABRICATOR'
          AND (v_all_states OR upper(trim(coalesce(state, ''))) = v_state)
          AND CASE WHEN v_all THEN true
                   WHEN v_district = '' THEN coalesce(district, '') IN ('', 'UNKNOWN')
                   ELSE district = v_district END
    ),
    by_rep AS (
        SELECT customer_name, state, district,
               coalesce(nullif(trim(employee_name), ''), 'Not recorded') AS rep,
               count(*)::int AS visits
        FROM v GROUP BY 1, 2, 3, 4
    ),
    reps AS (
        SELECT customer_name, state, district,
               jsonb_agg(jsonb_build_object('name', rep, 'visits', visits)
                         ORDER BY visits DESC, rep) AS reps
        FROM by_rep GROUP BY 1, 2, 3
    ),
    fab AS (
        SELECT customer_name, state, district,
               count(*)::int AS visits,
               min(visit_date) AS first_visit,
               max(visit_date) AS last_visit,
               mode() WITHIN GROUP (ORDER BY city) FILTER (WHERE coalesce(city, '') <> '') AS city,
               mode() WITHIN GROUP (ORDER BY pincode) FILTER (WHERE coalesce(pincode, '') <> '') AS pincode
        FROM v GROUP BY 1, 2, 3
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
                'state', f.state,
                'district', f.district,
                'visits', f.visits,
                'first_visit', f.first_visit,
                'last_visit', f.last_visit,
                'city', f.city,
                'pincode', f.pincode,
                'reps', r.reps
            ) ORDER BY f.visits DESC, f.last_visit DESC, f.customer_name)
            FROM fab f JOIN reps r USING (customer_name, state, district)), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.query_district_fabricators(date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_district_fabricators(date, date, text, text)
    TO anon, authenticated, service_role;
