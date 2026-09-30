-- ============================================================================
-- 035  Visit ranges up to 400 days; query_visits_range sorts in byte order.
-- ============================================================================
-- field_visits now starts on 1 Jan 2026 (146k rows), so the Visits page's
-- 93-day cap blocked ranges the data could answer. query_visits_range and
-- query_new_lead_dealers now take up to 400 days, the limit
-- compare_visits_ranges and query_district_fabricators already use.
-- query_district_fabricators keeps its 31-day limit for a whole state or all
-- states: all states over Jan-Sep 2026 is a 5.3 MB response.
--
-- query_visits_range over Jan-Sep 2026 (146k rows) spent most of its time
-- sorting names under the database's language collation. The working set is
-- now COLLATE "C" (same equality, so every count is unchanged) and the two
-- final ORDER BYs keep the default collation, so row order is unchanged too.
-- Verified identical jsonb on 6 ranges (7 days to 9 months, all states and
-- single states); Jan-Sep all states 1,248ms -> 950ms, a month 169ms.
--
-- Each replace is checked; a body that no longer matches raises and nothing
-- is changed.
--
-- ROLLBACK
--   Swap each replacement back (93 days; drop the COLLATE clauses).
-- ============================================================================

DO $$
DECLARE
    d text;
    n text;
BEGIN
    d := pg_get_functiondef('public.query_visits_range'::regproc);
    n := replace(d, E'    IF v_days > 93 THEN\n        RAISE EXCEPTION ''query_visits_range: ranges are limited to 93 days'';',
                    E'    IF v_days > 400 THEN\n        RAISE EXCEPTION ''query_visits_range: ranges are limited to 400 days'';');
    n := replace(n, E'employee_name, visit_date, visit_time, customer_name, customer_type,\n               duration_minutes, upper(trim(state)) AS state, district',
                    E'employee_name COLLATE "C" AS employee_name, visit_date, visit_time,\n               customer_name COLLATE "C" AS customer_name, customer_type,\n               duration_minutes, upper(trim(state)) COLLATE "C" AS state, district COLLATE "C" AS district');
    n := replace(n, 'ORDER BY fab_visits DESC, district)', 'ORDER BY fab_visits DESC, district COLLATE "default")');
    n := replace(n, 'ORDER BY visits DESC, employee_name)', 'ORDER BY visits DESC, employee_name COLLATE "default")');
    IF position('limited to 400 days' in n) = 0
       OR (length(n) - length(replace(n, 'COLLATE "', ''))) / length('COLLATE "') <> 6 THEN
        RAISE EXCEPTION '035: query_visits_range body did not match';
    END IF;
    EXECUTE n;

    d := pg_get_functiondef('public.query_new_lead_dealers'::regproc);
    n := replace(d, E'    IF p_to - p_from + 1 > 93 THEN\n        RAISE EXCEPTION ''query_new_lead_dealers: ranges are limited to 93 days'';',
                    E'    IF p_to - p_from + 1 > 400 THEN\n        RAISE EXCEPTION ''query_new_lead_dealers: ranges are limited to 400 days'';');
    IF n = d THEN
        RAISE EXCEPTION '035: query_new_lead_dealers body did not match';
    END IF;
    EXECUTE n;
END $$;

-- Long ranges hold 100k+ rows in the working set. At the default 16MB
-- work_mem that set spills to temp files, and this instance's disk is
-- throttled: Jan-Sep 2026 on query_visits_range took 6-8s spilling and
-- ~0.9s in memory; four months against four on compare_visits_ranges went
-- from 7.5-8.5s to ~1.5s. 32MB is enough for both (EXPLAIN shows no temp
-- blocks) and is used only while these two functions run.
ALTER FUNCTION public.query_visits_range(date, date, text) SET work_mem = '32MB';
ALTER FUNCTION public.compare_visits_ranges(date, date, date, date, text, text) SET work_mem = '32MB';
