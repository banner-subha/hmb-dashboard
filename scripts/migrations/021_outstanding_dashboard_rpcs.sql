-- ============================================================================
-- 021  Outstanding Receivables tab: dealer book + exact bill drilldown.
-- ============================================================================
-- The three RPCs the chatbot uses stay as they are. They do not fit the tab:
--   * query_dealer_outstanding caps at 200 rows of ~1,037 account groups and
--     only orders by balance, so sorting by days overdue, filtering to a
--     bucket, or finding any credit-balance account was impossible.
--   * query_dealer_outstanding_vouchers matches the dealer with ILIKE '%x%'
--     (35 dealer names are substrings of other dealers' names) and stops at
--     100 rows (13 accounts have more, the largest 1,643).
--   * Net aging buckets hide the ledger's shape: ~Rs 443 Cr of open bills sit
--     against ~Rs 390 Cr of credits not yet set against them, so the 90+
--     bucket nets negative. The tab shows bills and credits separately.
--
--   * The ledger's overdue_days is days since the bill date (it equals
--     as_on_date - voucher_date on every row), so bills not yet due were
--     counted as overdue. Both functions here age entries by due date:
--     days_late = as_on_date - due_date, falling back to the ledger's
--     overdue_days only where due_date is missing (user decision 2026-09-25).
--     The chatbot RPCs still use the ledger figure.
--
-- query_outstanding_dealer_book(): one row per account group, grouped exactly
-- as query_dealer_outstanding groups (dealer, state, district), with the net
-- buckets plus the credit part of each bucket (bills = net - credit). Days
-- overdue and oldest due date count bills only, so a years-old credit note
-- does not make an account look years late.
--
-- query_outstanding_dealer_bills(): every entry for one account group, exact
-- match on the same three keys. No row cap; the client pages past the API's
-- 1,000-row response limit using voucher_count from the book.
--
-- ROLLBACK
--   DROP FUNCTION public.query_outstanding_dealer_book();
--   DROP FUNCTION public.query_outstanding_dealer_bills(text, text, text);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.query_outstanding_dealer_book()
RETURNS TABLE(
    dealer_name text,
    state text,
    district text,
    party_codes text,
    party_names text,
    employee_names text,
    total_outstanding numeric,
    overdue_amount numeric,
    current_amount numeric,
    bucket_0_30 numeric,
    bucket_31_60 numeric,
    bucket_61_90 numeric,
    bucket_90_plus numeric,
    credit_total numeric,
    credit_current numeric,
    credit_0_30 numeric,
    credit_31_60 numeric,
    credit_61_90 numeric,
    credit_90_plus numeric,
    voucher_count integer,
    bill_count integer,
    credit_count integer,
    max_bill_overdue_days numeric,
    oldest_bill_due_date date,
    as_on_date date
)
LANGUAGE sql
STABLE
AS $function$
    WITH o AS (
        SELECT p.*, COALESCE((p.as_on_date - p.due_date)::numeric, p.overdue_days) AS days_late
        FROM public.party_outstanding p
    )
    SELECT
        o.dealer_name,
        COALESCE(NULLIF(TRIM(o.state), ''), 'UNKNOWN') AS state,
        NULLIF(TRIM(o.district), '') AS district,
        string_agg(DISTINCT o.party_code, ', ') AS party_codes,
        string_agg(DISTINCT o.party_name, ', ') AS party_names,
        string_agg(DISTINCT NULLIF(TRIM(o.employee_name), ''), ', ') AS employee_names,
        ROUND(COALESCE(SUM(o.outstanding_amount), 0), 2) AS total_outstanding,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.days_late > 0), 0), 2) AS overdue_amount,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.days_late <= 0 OR o.days_late IS NULL), 0), 2) AS current_amount,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.days_late > 0 AND o.days_late <= 30), 0), 2) AS bucket_0_30,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.days_late > 30 AND o.days_late <= 60), 0), 2) AS bucket_31_60,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.days_late > 60 AND o.days_late <= 90), 0), 2) AS bucket_61_90,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.days_late > 90), 0), 2) AS bucket_90_plus,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.outstanding_amount < 0), 0), 2) AS credit_total,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.outstanding_amount < 0 AND (o.days_late <= 0 OR o.days_late IS NULL)), 0), 2) AS credit_current,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.outstanding_amount < 0 AND o.days_late > 0 AND o.days_late <= 30), 0), 2) AS credit_0_30,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.outstanding_amount < 0 AND o.days_late > 30 AND o.days_late <= 60), 0), 2) AS credit_31_60,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.outstanding_amount < 0 AND o.days_late > 60 AND o.days_late <= 90), 0), 2) AS credit_61_90,
        ROUND(COALESCE(SUM(o.outstanding_amount) FILTER (WHERE o.outstanding_amount < 0 AND o.days_late > 90), 0), 2) AS credit_90_plus,
        COUNT(*)::int AS voucher_count,
        (COUNT(*) FILTER (WHERE o.outstanding_amount > 0))::int AS bill_count,
        (COUNT(*) FILTER (WHERE o.outstanding_amount < 0))::int AS credit_count,
        MAX(o.days_late) FILTER (WHERE o.outstanding_amount > 0) AS max_bill_overdue_days,
        MIN(o.due_date) FILTER (WHERE o.outstanding_amount > 0) AS oldest_bill_due_date,
        MAX(o.as_on_date) AS as_on_date
    FROM o
    GROUP BY o.dealer_name, COALESCE(NULLIF(TRIM(o.state), ''), 'UNKNOWN'), NULLIF(TRIM(o.district), '')
    ORDER BY total_outstanding DESC, o.dealer_name, 2, 3;
$function$;

DROP FUNCTION IF EXISTS public.query_outstanding_dealer_bills(text, text, text);
CREATE FUNCTION public.query_outstanding_dealer_bills(
    p_dealer text,
    p_state text,
    p_district text DEFAULT NULL
)
RETURNS TABLE(
    id bigint,
    voucher_no text,
    voucher_date date,
    outstanding_amount numeric,
    due_date date,
    overdue_days numeric,
    days_since_bill numeric,
    payment_term_days integer,
    order_no text,
    match_source text,
    party_name text,
    party_code text,
    employee_name text
)
LANGUAGE sql
STABLE
AS $function$
    SELECT
        o.id,
        o.voucher_no,
        o.voucher_date,
        o.outstanding_amount,
        o.due_date,
        COALESCE((o.as_on_date - o.due_date)::numeric, o.overdue_days) AS overdue_days,
        o.overdue_days AS days_since_bill,
        o.payment_term_days,
        o.order_no,
        o.match_source,
        o.party_name,
        o.party_code,
        o.employee_name
    FROM public.party_outstanding o
    WHERE o.dealer_name = p_dealer
      AND COALESCE(NULLIF(TRIM(o.state), ''), 'UNKNOWN') = p_state
      AND NULLIF(TRIM(o.district), '') IS NOT DISTINCT FROM NULLIF(TRIM(p_district), '')
    ORDER BY 6 DESC NULLS LAST, o.outstanding_amount DESC, o.id;
$function$;

REVOKE ALL ON FUNCTION public.query_outstanding_dealer_book() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_outstanding_dealer_book()
    TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.query_outstanding_dealer_bills(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_outstanding_dealer_bills(text, text, text)
    TO anon, authenticated, service_role;
