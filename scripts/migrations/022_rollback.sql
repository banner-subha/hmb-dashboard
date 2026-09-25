-- Rollback for 022: the three chatbot outstanding RPCs as they were before
-- (captured from pg_get_functiondef on 2026-09-25). They age by the ledger's
-- overdue_days, which is days since the bill.

CREATE OR REPLACE FUNCTION public.query_outstanding_summary(p_state text DEFAULT NULL::text, p_district text DEFAULT NULL::text)
 RETURNS TABLE(total_outstanding numeric, total_overdue numeric, total_current numeric, bucket_0_30 numeric, bucket_31_60 numeric, bucket_61_90 numeric, bucket_90_plus numeric, dealer_count bigint, voucher_count bigint, as_on_date date)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
        ROUND(COALESCE(SUM(o.outstanding_amount), 0), 2) as total_outstanding,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 0 THEN o.outstanding_amount ELSE 0 END), 0), 2) as total_overdue,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days <= 0 OR o.overdue_days IS NULL THEN o.outstanding_amount ELSE 0 END), 0), 2) as total_current,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 0 AND o.overdue_days <= 30 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_0_30,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 30 AND o.overdue_days <= 60 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_31_60,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 60 AND o.overdue_days <= 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_61_90,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_90_plus,
        COUNT(DISTINCT o.dealer_name) as dealer_count,
        COUNT(*) as voucher_count,
        MAX(o.as_on_date) as as_on_date
    FROM public.party_outstanding o
    WHERE
        (p_state IS NULL OR o.state ILIKE '%' || TRIM(p_state) || '%' OR o.party_state ILIKE '%' || TRIM(p_state) || '%')
        AND (p_district IS NULL OR o.district ILIKE '%' || TRIM(p_district) || '%');
$function$;

CREATE OR REPLACE FUNCTION public.query_dealer_outstanding(p_dealer text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_only_overdue boolean DEFAULT false, p_limit integer DEFAULT 50)
 RETURNS TABLE(dealer_name text, party_code text, state text, district text, total_outstanding numeric, overdue_amount numeric, current_amount numeric, bucket_0_30 numeric, bucket_31_60 numeric, bucket_61_90 numeric, bucket_90_plus numeric, voucher_count integer, max_overdue_days numeric, oldest_due_date date, as_on_date date)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
        o.dealer_name,
        string_agg(DISTINCT o.party_code, ', ') as party_code,
        COALESCE(NULLIF(TRIM(o.state), ''), 'UNKNOWN') as state,
        NULLIF(TRIM(o.district), '') as district,
        ROUND(COALESCE(SUM(o.outstanding_amount), 0), 2) as total_outstanding,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 0 THEN o.outstanding_amount ELSE 0 END), 0), 2) as overdue_amount,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days <= 0 OR o.overdue_days IS NULL THEN o.outstanding_amount ELSE 0 END), 0), 2) as current_amount,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 0 AND o.overdue_days <= 30 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_0_30,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 30 AND o.overdue_days <= 60 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_31_60,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 60 AND o.overdue_days <= 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_61_90,
        ROUND(COALESCE(SUM(CASE WHEN o.overdue_days > 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_90_plus,
        COUNT(*)::INT as voucher_count,
        MAX(o.overdue_days) as max_overdue_days,
        MIN(o.due_date) as oldest_due_date,
        MAX(o.as_on_date) as as_on_date
    FROM public.party_outstanding o
    WHERE
        (p_dealer IS NULL OR o.dealer_name ILIKE '%' || TRIM(p_dealer) || '%' OR o.party_name ILIKE '%' || TRIM(p_dealer) || '%' OR o.party_code ILIKE '%' || TRIM(p_dealer) || '%')
        AND (p_state IS NULL OR o.state ILIKE '%' || TRIM(p_state) || '%' OR o.party_state ILIKE '%' || TRIM(p_state) || '%')
        AND (p_district IS NULL OR o.district ILIKE '%' || TRIM(p_district) || '%')
    GROUP BY o.dealer_name, COALESCE(NULLIF(TRIM(o.state), ''), 'UNKNOWN'), NULLIF(TRIM(o.district), '')
    HAVING (NOT p_only_overdue OR SUM(CASE WHEN o.overdue_days > 0 THEN o.outstanding_amount ELSE 0 END) > 0)
    ORDER BY total_outstanding DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 200);
$function$;

CREATE OR REPLACE FUNCTION public.query_dealer_outstanding_vouchers(p_dealer text DEFAULT NULL::text, p_party_code text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(voucher_no text, voucher_date date, outstanding_amount numeric, due_date date, overdue_days numeric, order_no text, match_source text, dealer_name text, party_name text, party_code text, state text, district text)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
        o.voucher_no,
        o.voucher_date,
        o.outstanding_amount,
        o.due_date,
        o.overdue_days,
        o.order_no,
        o.match_source,
        o.dealer_name,
        o.party_name,
        o.party_code,
        o.state,
        o.district
    FROM public.party_outstanding o
    WHERE
        (p_dealer IS NULL OR o.dealer_name ILIKE '%' || TRIM(p_dealer) || '%' OR o.party_name ILIKE '%' || TRIM(p_dealer) || '%')
        AND (p_party_code IS NULL OR o.party_code ILIKE '%' || TRIM(p_party_code) || '%')
    ORDER BY o.overdue_days DESC NULLS LAST, o.outstanding_amount DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 100);
$function$;
