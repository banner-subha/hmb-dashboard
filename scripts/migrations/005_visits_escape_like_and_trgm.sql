-- Migration 005: escape LIKE metacharacters, and make the trigram indexes
-- actually reachable. Applied to jhsttedcvzfkszbzczak.
--
-- Two defects found by adversarially probing the visit RPCs, neither reachable
-- through an ordinary question.
--
-- 1. Metacharacters were not escaped. The filters built
--    `col ILIKE '%' || p_input || '%'`, so a user typing '_' or '%' got a
--    wildcard rather than a literal:
--      p_customer = 'S_S' -> 16,146 visits across 1,777 customers (true: 0)
--      p_customer = '%'   -> all 298,081 rows: a filter meaning "everything"
--    No stored name contains either character, so this was only ever reachable
--    from user input -- which is exactly what the model is told to pass
--    through verbatim.
--
--    Empty and whitespace-only input also disagreed: '' matched every row
--    while '   ' matched none. Both now mean "no filter".
--
-- 2. The GIN trigram indexes from migration 004 were never used. Each filter
--    was `upper(btrim(col)) = upper(btrim(p)) OR col ILIKE ...`, and the
--    un-indexed equality branch forced a sequential scan:
--      OR form:    Parallel Seq Scan, cost 13177, 148,948 rows discarded
--      ILIKE only: Bitmap Index Scan on idx_field_visits_customer_trgm,
--                  cost 272  -- 48x cheaper
--    The equality branch was redundant: an exact match also contains-matches,
--    as long as the pattern is trimmed first, which is what it was there for.

CREATE OR REPLACE FUNCTION public.visits_like_pattern(p_input text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_input IS NULL OR btrim(p_input) = '' THEN NULL
    ELSE '%' || replace(replace(replace(btrim(p_input), '\', '\'), '%', '\%'), '_', '\_') || '%'
  END;
$$;

-- query_visits, query_dealer_visit_correlation,
-- query_district_fabricator_visits, visits_value_exists and
-- explain_visit_customer_match were all rewritten to use it, replacing every
-- `upper(btrim(col)) = ... OR col ILIKE '%'||p||'%'` predicate with a single
-- `col ILIKE public.visits_like_pattern(p)`. See 006 for query_rep_productivity,
-- which also gained scope parameters.
