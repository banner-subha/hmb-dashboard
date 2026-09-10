-- Migration 003: make public.field_visits incrementally loadable, and visible
-- to the agent's freshness check.
-- Target: Supabase Postgres jhsttedcvzfkszbzczak (us-east-1).
--
-- Context. Until now nothing wrote to field_visits at all: the only mechanism
-- that ever populated it was scratch/bulk_load_postgres.py, a manual script
-- that TRUNCATEd the table and reloaded it from a locally-downloaded CSV. The
-- deployed parser (cloud_run_visits/main.py) refreshed only the Storage CDN
-- JSON. So the dashboard was live and the table the chatbot would query was
-- frozen at the backfill.
--
-- Phase 0b moves the write into the deployed parser. That needs (1) a natural
-- key to upsert against, and (2) the table reporting its own staleness the way
-- every other source does.

-- ---------------------------------------------------------------------------
-- 1. Natural key
-- ---------------------------------------------------------------------------
-- This is the same tuple all three historical implementations deduplicated on:
--   (employee.upper(), visit_date, customer_name.upper(), checkin_time)
-- Verified against the live table before creating: 298,081 rows, 298,081
-- distinct keys, 0 violations.
--
-- NULLS NOT DISTINCT (PG15+) matters even though checkin_time is currently
-- never NULL. Under default NULL semantics two rows with a NULL checkin would
-- both be treated as unique and insert forever, silently reintroducing the
-- duplicates this key exists to prevent.

CREATE UNIQUE INDEX IF NOT EXISTS idx_field_visits_natural_key
    ON public.field_visits (
        upper(coalesce(employee_name, '')),
        visit_date,
        upper(customer_name),
        checkin_time
    ) NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- 2. Freshness
-- ---------------------------------------------------------------------------
-- app/prompt.py builds its "Data freshness, as of right now" block from this
-- view, and instructs the model that any answer drawing on a stale table must
-- say where the data stops. field_visits was absent, so once visit tools are
-- registered (Phase 3) the model would report visit figures with no idea how
-- old they were. Adding the row here is what makes that promise hold.

CREATE OR REPLACE VIEW public.v_data_freshness AS
 SELECT 'despatch_orders'::text AS table_name,
    'NEW DASHBOARD REPORT FORMAT-V2.xlsx'::text AS source_file,
    ( SELECT count(*) AS count
           FROM despatch_orders_clean) AS row_count,
    ( SELECT max(despatch_orders_clean.despatch_date) AS max
           FROM despatch_orders_clean
          WHERE despatch_orders_clean.record_type = 'DESPATCH'::text) AS latest_data_date,
    ( SELECT CURRENT_DATE - max(despatch_orders_clean.despatch_date)::date
           FROM despatch_orders_clean
          WHERE despatch_orders_clean.record_type = 'DESPATCH'::text) AS days_behind
UNION ALL
 SELECT 'dia_wise_despatch'::text AS table_name,
    'DIA WISE DESPATCH -BI.xlsx'::text AS source_file,
    ( SELECT count(*) AS count
           FROM dia_wise_despatch) AS row_count,
    ( SELECT max(dia_wise_despatch.invoice_date) AS max
           FROM dia_wise_despatch) AS latest_data_date,
    ( SELECT CURRENT_DATE - max(dia_wise_despatch.invoice_date)::date
           FROM dia_wise_despatch) AS days_behind
UNION ALL
 SELECT 'do_pending'::text AS table_name,
    'DO PENDING.xlsx'::text AS source_file,
    ( SELECT count(*) AS count
           FROM do_pending) AS row_count,
    ( SELECT max(do_pending.order_date) AS max
           FROM do_pending) AS latest_data_date,
    ( SELECT CURRENT_DATE - max(do_pending.order_date)::date
           FROM do_pending) AS days_behind
UNION ALL
 SELECT 'field_visits'::text AS table_name,
    'VISIT_TRACKER_SEPT.csv'::text AS source_file,
    ( SELECT count(*) AS count
           FROM field_visits) AS row_count,
    -- ::text because despatch_date in despatch_orders_clean is text, so the
    -- UNION's latest_data_date column resolves to text, not date.
    ( SELECT max(field_visits.visit_date)::text AS max
           FROM field_visits) AS latest_data_date,
    ( SELECT CURRENT_DATE - max(field_visits.visit_date)::date
           FROM field_visits) AS days_behind
UNION ALL
 SELECT 'dealer_targets'::text AS table_name,
    'SEASON_7_DEALER VS TARGET.xlsx'::text AS source_file,
    ( SELECT count(*) AS count
           FROM dealer_targets) AS row_count,
    NULL::text AS latest_data_date,
    NULL::integer AS days_behind
UNION ALL
 SELECT 'dealer_kro_mapping'::text AS table_name,
    'DEALER WISE JR-KRO NAME.xlsx'::text AS source_file,
    ( SELECT count(*) AS count
           FROM dealer_kro_mapping) AS row_count,
    NULL::text AS latest_data_date,
    NULL::integer AS days_behind;
