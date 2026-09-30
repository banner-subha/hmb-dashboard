-- ============================================================================
-- 031  mv_refresh_guarded(): drop the delete from agent.app_sessions.
-- ============================================================================
-- The storage cleanup dropped agent.app_sessions as obsolete, but
-- mv_refresh_guarded (017) still ended with
--     delete from agent.app_sessions where expires_at < now();
-- Every call then failed on its last line and rolled back all its work,
-- including the mv_refresh_state row. So:
--   * mv_despatch and mv_pending, the chatbot's data, stopped updating
--     after 16 Sep 2026 (latest despatch 20 Sep, pending 686 rows of ~1,900);
--   * the 20-minute agent_refresh() never saw a recorded refresh, so it
--     rebuilt both matviews in full every run (~5s CPU) and threw them away;
--   * post_ingest_refresh() caught the error, reported success, and took
--     ~28s on average.
--
-- Applied live 29 Sep 2026 by removing that one line from the live body
-- (same signature, same return shape). After it:
--   post_ingest_refresh()  6.0s, agent refresh ok, latest despatch 27 Sep
--   agent_refresh() with nothing changed  28ms, both matviews skipped
--
-- To re-apply: take 017's function body without the delete line.
--
-- ROLLBACK
--   Not useful: the table the line referenced does not exist.
-- ============================================================================

DO $$
DECLARE
    d text := pg_get_functiondef('agent.mv_refresh_guarded(boolean)'::regprocedure);
    n text;
BEGIN
    n := replace(d, E'  delete from agent.app_sessions where expires_at < now();\n\n', '');
    IF n <> d THEN
        EXECUTE n;
    END IF;
END $$;
