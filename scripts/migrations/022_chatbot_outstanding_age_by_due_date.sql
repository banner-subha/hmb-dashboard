-- ============================================================================
-- 022  Chatbot outstanding RPCs age bills by due date (follow-up to 021).
-- ============================================================================
-- party_outstanding.overdue_days is days since the bill (as_on_date -
-- voucher_date on every row), copied as-is from the ERP's "OverDue Days"
-- column. These three RPCs treated it as days past due, so the assistant said
-- Rs 53.33 Cr overdue where the Outstanding tab (021, ADR 0002) says 21.60 Cr.
--
-- Same rule as 021: days_late = as_on_date - due_date, falling back to the
-- ledger's overdue_days only where due_date is null. Signatures and return
-- columns are unchanged, so the agent's tools keep working as they are.
--
-- query_dealer_outstanding_vouchers also:
--   * matches p_dealer exactly (case-insensitive, dealer or party name) when
--     such a dealer exists, and only falls back to ILIKE '%x%' when none does.
--     35 dealer names are substrings of others ("KALIMATA HARDWARE" matched
--     "SECURITY DEPOSIT - KALIMATA HARDWARE").
--   * caps at 2,000 rows instead of 100 (the largest account has 1,643).
--   * returns overdue_days as days past due, like query_outstanding_dealer_bills.
--
-- ROLLBACK: re-run the previous definitions (saved in
-- scripts/migrations/022_rollback.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.query_outstanding_summary(p_state text DEFAULT NULL::text, p_district text DEFAULT NULL::text)
 RETURNS TABLE(total_outstanding numeric, total_overdue numeric, total_current numeric, bucket_0_30 numeric, bucket_31_60 numeric, bucket_61_90 numeric, bucket_90_plus numeric, dealer_count bigint, voucher_count bigint, as_on_date date)
 LANGUAGE sql
 STABLE
AS $function$
    WITH o AS (
        SELECT p.*, COALESCE((p.as_on_date - p.due_date)::numeric, p.overdue_days) AS days_late
        FROM public.party_outstanding p
    )
    SELECT
        ROUND(COALESCE(SUM(o.outstanding_amount), 0), 2) as total_outstanding,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 0 THEN o.outstanding_amount ELSE 0 END), 0), 2) as total_overdue,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late <= 0 OR o.days_late IS NULL THEN o.outstanding_amount ELSE 0 END), 0), 2) as total_current,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 0 AND o.days_late <= 30 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_0_30,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 30 AND o.days_late <= 60 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_31_60,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 60 AND o.days_late <= 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_61_90,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_90_plus,
        COUNT(DISTINCT o.dealer_name) as dealer_count,
        COUNT(*) as voucher_count,
        MAX(o.as_on_date) as as_on_date
    FROM o
    WHERE
        (p_state IS NULL OR o.state ILIKE '%' || TRIM(p_state) || '%' OR o.party_state ILIKE '%' || TRIM(p_state) || '%')
        AND (p_district IS NULL OR o.district ILIKE '%' || TRIM(p_district) || '%');
$function$;

CREATE OR REPLACE FUNCTION public.query_dealer_outstanding(p_dealer text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_only_overdue boolean DEFAULT false, p_limit integer DEFAULT 50)
 RETURNS TABLE(dealer_name text, party_code text, state text, district text, total_outstanding numeric, overdue_amount numeric, current_amount numeric, bucket_0_30 numeric, bucket_31_60 numeric, bucket_61_90 numeric, bucket_90_plus numeric, voucher_count integer, max_overdue_days numeric, oldest_due_date date, as_on_date date)
 LANGUAGE sql
 STABLE
AS $function$
    WITH o AS (
        SELECT p.*, COALESCE((p.as_on_date - p.due_date)::numeric, p.overdue_days) AS days_late
        FROM public.party_outstanding p
    )
    SELECT
        o.dealer_name,
        string_agg(DISTINCT o.party_code, ', ') as party_code,
        COALESCE(NULLIF(TRIM(o.state), ''), 'UNKNOWN') as state,
        NULLIF(TRIM(o.district), '') as district,
        ROUND(COALESCE(SUM(o.outstanding_amount), 0), 2) as total_outstanding,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 0 THEN o.outstanding_amount ELSE 0 END), 0), 2) as overdue_amount,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late <= 0 OR o.days_late IS NULL THEN o.outstanding_amount ELSE 0 END), 0), 2) as current_amount,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 0 AND o.days_late <= 30 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_0_30,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 30 AND o.days_late <= 60 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_31_60,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 60 AND o.days_late <= 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_61_90,
        ROUND(COALESCE(SUM(CASE WHEN o.days_late > 90 THEN o.outstanding_amount ELSE 0 END), 0), 2) as bucket_90_plus,
        COUNT(*)::INT as voucher_count,
        MAX(o.days_late) as max_overdue_days,
        MIN(o.due_date) as oldest_due_date,
        MAX(o.as_on_date) as as_on_date
    FROM o
    WHERE
        (p_dealer IS NULL OR o.dealer_name ILIKE '%' || TRIM(p_dealer) || '%' OR o.party_name ILIKE '%' || TRIM(p_dealer) || '%' OR o.party_code ILIKE '%' || TRIM(p_dealer) || '%')
        AND (p_state IS NULL OR o.state ILIKE '%' || TRIM(p_state) || '%' OR o.party_state ILIKE '%' || TRIM(p_state) || '%')
        AND (p_district IS NULL OR o.district ILIKE '%' || TRIM(p_district) || '%')
    GROUP BY o.dealer_name, COALESCE(NULLIF(TRIM(o.state), ''), 'UNKNOWN'), NULLIF(TRIM(o.district), '')
    HAVING (NOT p_only_overdue OR SUM(CASE WHEN o.days_late > 0 THEN o.outstanding_amount ELSE 0 END) > 0)
    ORDER BY total_outstanding DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 200);
$function$;

CREATE OR REPLACE FUNCTION public.query_dealer_outstanding_vouchers(p_dealer text DEFAULT NULL::text, p_party_code text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(voucher_no text, voucher_date date, outstanding_amount numeric, due_date date, overdue_days numeric, order_no text, match_source text, dealer_name text, party_name text, party_code text, state text, district text)
 LANGUAGE sql
 STABLE
AS $function$
    WITH o AS (
        SELECT p.*, COALESCE((p.as_on_date - p.due_date)::numeric, p.overdue_days) AS days_late
        FROM public.party_outstanding p
    ),
    exact AS (
        SELECT EXISTS (
            SELECT 1 FROM public.party_outstanding x
            WHERE UPPER(x.dealer_name) = UPPER(TRIM(p_dealer)) OR UPPER(x.party_name) = UPPER(TRIM(p_dealer))
        ) AS hit
    )
    SELECT
        o.voucher_no,
        o.voucher_date,
        o.outstanding_amount,
        o.due_date,
        o.days_late,
        o.order_no,
        o.match_source,
        o.dealer_name,
        o.party_name,
        o.party_code,
        o.state,
        o.district
    FROM o, exact
    WHERE
        (p_dealer IS NULL
         OR (exact.hit AND (UPPER(o.dealer_name) = UPPER(TRIM(p_dealer)) OR UPPER(o.party_name) = UPPER(TRIM(p_dealer))))
         OR (NOT exact.hit AND (o.dealer_name ILIKE '%' || TRIM(p_dealer) || '%' OR o.party_name ILIKE '%' || TRIM(p_dealer) || '%')))
        AND (p_party_code IS NULL OR o.party_code ILIKE '%' || TRIM(p_party_code) || '%')
    ORDER BY o.days_late DESC NULLS LAST, o.outstanding_amount DESC
    LIMIT LEAST(COALESCE(p_limit, 50), 2000);
$function$;
