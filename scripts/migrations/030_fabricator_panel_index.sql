-- ============================================================================
-- 030  Covering index for query_district_fabricators (the district panel).
-- ============================================================================
-- The panel timed out (anon's 3s statement_timeout) and showed "busy with a
-- data refresh". The single-district path intersected the district trigram
-- index with the date index and read ~1,000 heap pages; the state-wide path
-- read every fabricator row in the range from the heap. On this shared-CPU
-- instance, with the ingest running, that took 0.4s to 29s.
--
-- This index answers every path of the function (one district, a whole
-- state, all states) with an index-only scan of the fabricator rows in the
-- range. Measured 29 Sep 2026 for 1-27 Sep, West Bengal:
--   one district  358ms -> 49ms   whole state  3-21s -> 178ms
--   all states    0.5-29s -> 293ms
-- Applied live with CONCURRENTLY; run each statement on its own, outside a
-- transaction.
--
-- ROLLBACK
--   DROP INDEX CONCURRENTLY public.idx_field_visits_fab_date;
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_field_visits_fab_date
    ON public.field_visits (customer_type, visit_date)
    INCLUDE (state, district, customer_name, employee_name, city, pincode, visit_type);
