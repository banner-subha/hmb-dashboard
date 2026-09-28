-- ============================================================================
-- 023  query_district_fabricators(): the fabricators behind one district row.
-- ============================================================================
-- The Districts & Fabricators tab shows counts per district from the parser's
-- JSON, but never the fabricators themselves or who visited them. This returns
-- them for one district over an inclusive date range, so the same call serves
-- the running month now and any picked range later.
--
-- Fabricators are grouped on customer_name as recorded, the same grouping the
-- parser's curUniqueFabricators counts, so the panel's total matches the
-- table's. State and district match case-insensitively; an empty district
-- means "not recorded" (NULL, '' or the upsert's 'UNKNOWN').
--
-- district is compared as stored: the triggers from 009 keep it upper-case and
-- trimmed, and a bare equality lets the planner use a district index instead
-- of scanning the whole date range. Reps are aggregated with a GROUP BY and a
-- join, not a subquery per fabricator: that subquery rescanned every visit
-- once per fabricator and timed out as anon on a 400-day range.
--
-- Guard: the range must be ordered and at most 400 days, as in 019.
--
-- ROLLBACK
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
    v_result jsonb;
BEGIN
    IF p_from IS NULL OR p_to IS NULL THEN
        RAISE EXCEPTION 'query_district_fabricators: both dates are required';
    END IF;
    IF p_to < p_from THEN
        RAISE EXCEPTION 'query_district_fabricators: the range ends before it starts';
    END IF;
    IF p_to - p_from > 400 THEN
        RAISE EXCEPTION 'query_district_fabricators: ranges are limited to 400 days';
    END IF;

    WITH v AS MATERIALIZED (
        SELECT customer_name, employee_name, visit_date, city, pincode
        FROM public.field_visits
        WHERE visit_date >= p_from AND visit_date <= p_to
          AND customer_type = 'FABRICATOR'
          AND upper(trim(coalesce(state, ''))) = v_state
          AND CASE WHEN v_district = ''
                   THEN coalesce(district, '') IN ('', 'UNKNOWN')
                   ELSE district = v_district END
    ),
    by_rep AS (
        SELECT customer_name, coalesce(nullif(trim(employee_name), ''), 'Not recorded') AS rep,
               count(*)::int AS visits
        FROM v GROUP BY 1, 2
    ),
    reps AS (
        SELECT customer_name,
               jsonb_agg(jsonb_build_object('name', rep, 'visits', visits)
                         ORDER BY visits DESC, rep) AS reps
        FROM by_rep GROUP BY 1
    ),
    fab AS (
        SELECT customer_name,
               count(*)::int AS visits,
               min(visit_date) AS first_visit,
               max(visit_date) AS last_visit,
               mode() WITHIN GROUP (ORDER BY city) FILTER (WHERE coalesce(city, '') <> '') AS city,
               mode() WITHIN GROUP (ORDER BY pincode) FILTER (WHERE coalesce(pincode, '') <> '') AS pincode
        FROM v GROUP BY 1
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
                'visits', f.visits,
                'first_visit', f.first_visit,
                'last_visit', f.last_visit,
                'city', f.city,
                'pincode', f.pincode,
                'reps', r.reps
            ) ORDER BY f.visits DESC, f.last_visit DESC, f.customer_name)
            FROM fab f JOIN reps r USING (customer_name)), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.query_district_fabricators(date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_district_fabricators(date, date, text, text)
    TO anon, authenticated, service_role;
