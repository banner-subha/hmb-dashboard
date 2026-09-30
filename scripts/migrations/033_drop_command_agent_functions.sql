-- ============================================================================
-- 033  Drop the retired Command Agent functions.
-- ============================================================================
-- See 032 for why, and for the full definitions. No CASCADE: if anything
-- still depends on one of these, the drop fails instead of taking it along.
--
-- ROLLBACK
--   Run 032_command_agent_functions_backup.sql (the tables they use are gone,
--   so they will not work until those are recreated too).
-- ============================================================================

BEGIN;

DROP FUNCTION public.agent_api_wrapped(text, jsonb);
DROP FUNCTION public.agent_api2(text, jsonb);
DROP FUNCTION public.agent_gateway(text, jsonb);
DROP FUNCTION public.agent_app_html(text);
DROP FUNCTION public.agent_login(text, text, text);
DROP FUNCTION public.agent_set_password(text, text);
DROP FUNCTION public.agent_change_password(text, text, text);
DROP FUNCTION public.agent_request_reset(text, text);
DROP FUNCTION public.agent_list_resets(text);
DROP FUNCTION public.agent_approve_reset(text, bigint);
DROP FUNCTION public.agent_run_sql(text, text, integer, text);
DROP FUNCTION public.agent_metrics(text);
DROP FUNCTION public.agent_admin_activity(text, integer);
DROP FUNCTION public.agent_admin_health(text);
DROP FUNCTION public.agent_admin_set_user(text, text, jsonb);
DROP FUNCTION public.agent_admin_users(text);
DROP FUNCTION agent.snapshot_app_asset();
DROP FUNCTION agent.is_admin(text);

COMMIT;
