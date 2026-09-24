-- ============================================================================
-- 018  Keep field_visits' visibility map fresh after each daily ingest.
-- ============================================================================
-- compare_visits_periods reads through the covering index
-- idx_field_visits_comparison. That is only an index-only scan while the heap
-- pages are marked all-visible; every page the ingest touches loses the mark
-- until a vacuum runs, and the scan falls back to heap fetches.
--
-- MEASURED, 2026-09-24
--   relallvisible / relpages          56.5%   (last vacuum 2026-09-19)
--   compare_visits_periods buffers    9,864 per call, 14k heap fetches
--   anon calls cancelled by the 3s statement_timeout several times a day
--   After a manual VACUUM (ANALYZE):  100% visible, 1,506 buffers per call
--
-- Why it never vacuumed on its own: the insert trigger is
--   autovacuum_vacuum_insert_threshold (1000)
--   + autovacuum_vacuum_insert_scale_factor (0.2) * 307k rows  = ~62k inserts,
-- and the feed adds ~850 rows a day. A scale factor of 0.01 would still wait
-- ~5 days, so the trigger is a flat 500 rows: roughly one vacuum per daily
-- load. On an otherwise all-visible table that vacuum only visits the pages
-- the load changed.
--
-- ROLLBACK
--   ALTER TABLE public.field_visits RESET
--     (autovacuum_vacuum_insert_threshold, autovacuum_vacuum_insert_scale_factor);
-- ============================================================================

ALTER TABLE public.field_visits SET (
  autovacuum_vacuum_insert_threshold = 500,
  autovacuum_vacuum_insert_scale_factor = 0
);
