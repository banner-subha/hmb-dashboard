-- ============================================================================
-- 028  New leads: visit_type = 'new lead' on dealers and fabricators.
-- ============================================================================
-- field_visits.visit_type is 'visit', 'call' or 'new lead' (15,036 of
-- 310,452 rows; in Sep 2026, 226 dealers and 340 fabricators). The Visits page
-- tags a dealer or fabricator as a new lead when it had a 'new lead' visit in
-- the period shown.
--
-- query_district_fabricators (027) gains new_lead_visits and first_lead per
-- fabricator; nothing else in it changes.
--
-- query_new_lead_dealers(from, to) lists the dealers with a 'new lead' visit
-- in an inclusive range, keyed the way the parser keys dealers (norm_name in
-- cloud_run_visits/main.py: upper case, letters and digits only), so the page
-- can tag rows from the month payload. At most 93 days, as elsewhere.
--
-- ROLLBACK
--   Re-run the function body from 027, and
--   DROP FUNCTION public.query_new_lead_dealers(date, date);
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
               lower(trim(visit_type)) = 'new lead' AS new_lead,
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
               count(*) FILTER (WHERE new_lead)::int AS new_lead_visits,
               min(visit_date) FILTER (WHERE new_lead) AS first_lead,
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
                'new_lead_visits', f.new_lead_visits,
                'first_lead', f.first_lead,
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

CREATE OR REPLACE FUNCTION public.query_new_lead_dealers(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
        RAISE EXCEPTION 'query_new_lead_dealers: an ordered range is required';
    END IF;
    IF p_to - p_from + 1 > 93 THEN
        RAISE EXCEPTION 'query_new_lead_dealers: ranges are limited to 93 days';
    END IF;
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                   'key', key, 'new_lead_visits', leads, 'first_lead', first_lead)
               ORDER BY key)
        FROM (
            SELECT upper(regexp_replace(customer_name, '[^a-zA-Z0-9]', '', 'g')) AS key,
                   count(*)::int AS leads,
                   min(visit_date) AS first_lead
            FROM public.field_visits
            WHERE visit_date >= p_from AND visit_date <= p_to
              AND customer_type = 'DEALER'
              AND lower(trim(visit_type)) = 'new lead'
            GROUP BY 1
        ) d
        WHERE key <> ''
    ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.query_new_lead_dealers(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_new_lead_dealers(date, date)
    TO anon, authenticated, service_role;
