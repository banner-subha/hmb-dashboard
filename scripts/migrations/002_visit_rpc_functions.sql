-- Migration 002: Visit Analytics RPC functions for HMB Sales Chatbot
-- Target: Supabase Postgres (Sales Project: igyfelwdrnidaojzqksb)

-- 1. General Visit Analytics Tool
CREATE OR REPLACE FUNCTION public.query_visits(
    p_dimensions text[] DEFAULT '{}'::text[],
    p_date_from text DEFAULT NULL::text,
    p_date_to text DEFAULT NULL::text,
    p_state text DEFAULT NULL::text,
    p_district text DEFAULT NULL::text,
    p_customer text DEFAULT NULL::text,
    p_customer_type text DEFAULT NULL::text,
    p_employee text DEFAULT NULL::text,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(result jsonb) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_date_from date := COALESCE(p_date_from::date, '2025-01-01'::date);
    v_date_to date := COALESCE(p_date_to::date, CURRENT_DATE);
    v_dims text := array_to_string(p_dimensions, ',');
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT 
            v.employee_name,
            v.visit_date,
            v.customer_name,
            v.customer_type,
            v.state,
            v.district,
            v.duration_minutes
        FROM public.field_visits v
        WHERE v.visit_date >= v_date_from AND v.visit_date <= v_date_to
          AND (p_state IS NULL OR v.state ILIKE '%' || p_state || '%')
          AND (p_district IS NULL OR v.district ILIKE '%' || p_district || '%')
          AND (p_customer IS NULL OR v.customer_name ILIKE '%' || p_customer || '%')
          AND (p_customer_type IS NULL OR v.customer_type ILIKE '%' || p_customer_type || '%')
          AND (p_employee IS NULL OR v.employee_name ILIKE '%' || p_employee || '%')
    ),
    aggregated AS (
        SELECT
            CASE WHEN 'state' = ANY(p_dimensions) THEN state ELSE NULL END AS dim_state,
            CASE WHEN 'district' = ANY(p_dimensions) THEN district ELSE NULL END AS dim_district,
            CASE WHEN 'customer_type' = ANY(p_dimensions) THEN customer_type ELSE NULL END AS dim_customer_type,
            CASE WHEN 'customer' = ANY(p_dimensions) OR 'dealer' = ANY(p_dimensions) THEN customer_name ELSE NULL END AS dim_customer,
            CASE WHEN 'employee' = ANY(p_dimensions) THEN employee_name ELSE NULL END AS dim_employee,
            COUNT(*)::bigint AS visit_count,
            COUNT(DISTINCT customer_name)::bigint AS unique_customers,
            ROUND(AVG(NULLIF(duration_minutes, 0))::numeric, 1) AS avg_duration_mins
        FROM filtered
        GROUP BY 1, 2, 3, 4, 5
        ORDER BY visit_count DESC
        LIMIT p_limit
    ),
    total_val AS (
        SELECT SUM(visit_count) AS total_visits FROM aggregated
    )
    SELECT 
        jsonb_build_object(
            'state', a.dim_state,
            'district', a.dim_district,
            'customer_type', a.dim_customer_type,
            'customer_name', a.dim_customer,
            'employee_name', a.dim_employee,
            'visit_count', a.visit_count,
            'unique_customers', a.unique_customers,
            'avg_duration_mins', COALESCE(a.avg_duration_mins, 0),
            'pct_of_total', CASE WHEN t.total_visits > 0 THEN ROUND((a.visit_count::numeric / t.total_visits * 100)::numeric, 2) ELSE 0 END
        )
    FROM aggregated a
    CROSS JOIN total_val t;
END;
$$;


-- 2. Dealer Visit vs Historical Run Rate Correlation Tool
CREATE OR REPLACE FUNCTION public.query_dealer_visit_correlation(
    p_state text DEFAULT NULL::text,
    p_district text DEFAULT NULL::text,
    p_dealer text DEFAULT NULL::text,
    p_cur_month text DEFAULT '2026-09'::text,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(result jsonb) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cur_start date := (p_cur_month || '-01')::date;
    v_cur_end date := (date_trunc('month', v_cur_start) + interval '1 month - 1 day')::date;
    v_hist_start date := (v_cur_start - interval '6 months')::date;
    v_hist_end date := (v_cur_start - interval '1 day')::date;
BEGIN
    RETURN QUERY
    WITH dealer_visits AS (
        SELECT 
            customer_name,
            state,
            district,
            -- Current active month visits
            COUNT(*) FILTER (WHERE visit_date >= v_cur_start AND visit_date <= v_cur_end) AS cur_visits,
            -- Historical 6-month visits
            COUNT(*) FILTER (WHERE visit_date >= v_hist_start AND visit_date <= v_hist_end) AS hist_total_visits,
            ROUND(AVG(NULLIF(duration_minutes, 0))::numeric, 1) AS avg_duration_mins
        FROM public.field_visits
        WHERE customer_type = 'DEALER'
          AND (p_state IS NULL OR state ILIKE '%' || p_state || '%')
          AND (p_district IS NULL OR district ILIKE '%' || p_district || '%')
          AND (p_dealer IS NULL OR customer_name ILIKE '%' || p_dealer || '%')
        GROUP BY customer_name, state, district
    )
    SELECT 
        jsonb_build_object(
            'dealer', dv.customer_name,
            'state', dv.state,
            'district', dv.district,
            'cur_visits', dv.cur_visits,
            'hist_avg_monthly_visits', ROUND((dv.hist_total_visits::numeric / 6.0)::numeric, 2),
            'visit_growth', dv.cur_visits - ROUND((dv.hist_total_visits::numeric / 6.0)::numeric, 2),
            'visit_growth_status', CASE 
                WHEN dv.cur_visits > ROUND((dv.hist_total_visits::numeric / 6.0)::numeric, 2) THEN 'GROWTH'
                ELSE 'DEGROWTH'
            END,
            'avg_duration_mins', COALESCE(dv.avg_duration_mins, 0)
        )
    FROM dealer_visits dv
    WHERE dv.cur_visits > 0 OR dv.hist_total_visits > 0
    ORDER BY dv.cur_visits DESC, dv.customer_name
    LIMIT p_limit;
END;
$$;


-- 3. District Fabricator Visit Intensity Tool
CREATE OR REPLACE FUNCTION public.query_district_fabricator_visits(
    p_state text DEFAULT NULL::text,
    p_district text DEFAULT NULL::text,
    p_cur_month text DEFAULT '2026-09'::text,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(result jsonb) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cur_start date := (p_cur_month || '-01')::date;
    v_cur_end date := (date_trunc('month', v_cur_start) + interval '1 month - 1 day')::date;
    v_hist_start date := (v_cur_start - interval '6 months')::date;
    v_hist_end date := (v_cur_start - interval '1 day')::date;
BEGIN
    RETURN QUERY
    WITH district_fab AS (
        SELECT 
            state,
            district,
            COUNT(*) FILTER (WHERE visit_date >= v_cur_start AND visit_date <= v_cur_end) AS cur_fab_visits,
            COUNT(DISTINCT customer_name) FILTER (WHERE visit_date >= v_cur_start AND visit_date <= v_cur_end) AS cur_unique_fabricators,
            COUNT(*) FILTER (WHERE visit_date >= v_hist_start AND visit_date <= v_hist_end) AS hist_total_fab_visits,
            ROUND(AVG(NULLIF(duration_minutes, 0))::numeric, 1) AS avg_duration_mins
        FROM public.field_visits
        WHERE customer_type = 'FABRICATOR'
          AND (p_state IS NULL OR state ILIKE '%' || p_state || '%')
          AND (p_district IS NULL OR district ILIKE '%' || p_district || '%')
        GROUP BY state, district
    )
    SELECT 
        jsonb_build_object(
            'state', df.state,
            'district', df.district,
            'cur_fabricator_visits', df.cur_fab_visits,
            'cur_unique_fabricators', df.cur_unique_fabricators,
            'hist_avg_monthly_visits', ROUND((df.hist_total_fab_visits::numeric / 6.0)::numeric, 2),
            'visit_growth', df.cur_fab_visits - ROUND((df.hist_total_fab_visits::numeric / 6.0)::numeric, 2),
            'visit_trend', CASE 
                WHEN df.cur_fab_visits > ROUND((df.hist_total_fab_visits::numeric / 6.0)::numeric, 2) THEN 'ACCELERATING'
                ELSE 'LAGGING'
            END,
            'avg_duration_mins', COALESCE(df.avg_duration_mins, 0)
        )
    FROM district_fab df
    ORDER BY df.cur_fab_visits DESC
    LIMIT p_limit;
END;
$$;


-- 4. Field Rep Productivity & Time Metrics Tool
CREATE OR REPLACE FUNCTION public.query_rep_productivity(
    p_employee text DEFAULT NULL::text,
    p_date_from text DEFAULT NULL::text,
    p_date_to text DEFAULT NULL::text,
    p_limit integer DEFAULT 100
)
RETURNS TABLE(result jsonb) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_date_from date := COALESCE(p_date_from::date, '2026-08-01'::date);
    v_date_to date := COALESCE(p_date_to::date, CURRENT_DATE);
BEGIN
    RETURN QUERY
    WITH rep_stats AS (
        SELECT 
            employee_name,
            COUNT(*)::bigint AS total_visits,
            COUNT(DISTINCT visit_date)::bigint AS active_days,
            COUNT(DISTINCT customer_name)::bigint AS unique_customers_visited,
            COUNT(*) FILTER (WHERE customer_type = 'DEALER')::bigint AS dealer_visits,
            COUNT(*) FILTER (WHERE customer_type = 'FABRICATOR')::bigint AS fabricator_visits,
            ROUND(AVG(NULLIF(duration_minutes, 0))::numeric, 1) AS avg_duration_mins,
            -- Checkin time buckets
            COUNT(*) FILTER (WHERE visit_time < '10:00:00'::time)::bigint AS morning_visits,
            COUNT(*) FILTER (WHERE visit_time >= '10:00:00'::time AND visit_time < '14:00:00'::time)::bigint AS midday_visits,
            COUNT(*) FILTER (WHERE visit_time >= '14:00:00'::time)::bigint AS afternoon_visits
        FROM public.field_visits
        WHERE visit_date >= v_date_from AND visit_date <= v_date_to
          AND employee_name IS NOT NULL AND TRIM(employee_name) != ''
          AND (p_employee IS NULL OR employee_name ILIKE '%' || p_employee || '%')
        GROUP BY employee_name
    )
    SELECT 
        jsonb_build_object(
            'employee_name', rs.employee_name,
            'total_visits', rs.total_visits,
            'active_days', rs.active_days,
            'visits_per_active_day', CASE WHEN rs.active_days > 0 THEN ROUND((rs.total_visits::numeric / rs.active_days)::numeric, 1) ELSE 0 END,
            'unique_customers', rs.unique_customers_visited,
            'dealer_visits', rs.dealer_visits,
            'fabricator_visits', rs.fabricator_visits,
            'avg_duration_mins', COALESCE(rs.avg_duration_mins, 0),
            'morning_visits', rs.morning_visits,
            'midday_visits', rs.midday_visits,
            'afternoon_visits', rs.afternoon_visits
        )
    FROM rep_stats rs
    ORDER BY rs.total_visits DESC
    LIMIT p_limit;
END;
$$;
