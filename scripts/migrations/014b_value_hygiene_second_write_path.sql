-- ============================================================================
-- 014b  APPLIED 2026-09-15.  The second write path 014 would have missed.
-- ============================================================================
-- 014 cleaned the stored rows, and n8n/data ingestion/main.py was patched so
-- the Python loader stops re-padding them. That looked like the whole fix.
--
-- It was not. pg_stat_statements showed writes arriving by more than one route,
-- so checking pg_proc rather than trusting main.py turned up
-- public.hmb_upsert_from_staging(uuid, text): a 15 KB DB-side upsert from
-- tmp_staging that read
--     row_data->>'OUTSTANDING'
--     row_data->>'Party Type'
-- verbatim, with no trim anywhere in its body (verified: position('btrim' in
-- prosrc) = 0). Any ingest going through staging would have undone 014.
--
-- HOW IT IS PATCHED
--   Replaying the function's own pg_get_functiondef() with two surgical
--   substitutions, rather than retyping 15 KB and risking drift in the other
--   ~90% of the body. Both substitutions assert they hit exactly once, and the
--   stored body is re-checked afterwards, so a silent partial rewrite fails
--   loudly instead of shipping.
--
--   The ON CONFLICT clauses (outstanding = EXCLUDED.outstanding,
--   party_type = EXCLUDED.party_type) need no change: EXCLUDED already carries
--   the cleaned value from the INSERT list.
--
-- VERIFIED
--   prosrc length 15,594 -> 15,756, which is exactly the two substitutions
--   only the two intended lines differ:
--     nullif(btrim(row_data->>'OUTSTANDING'), ''),
--     case when upper(btrim(row_data->>'Party Type'))
--            in ('CUSTOMER-DEBTORS','CUSTOMER/DEBTORS')
--          then 'Customer/Debtors'
--          else nullif(btrim(row_data->>'Party Type'), '') end,
--   The repo copy in n8n/data ingestion/supabase_schema.sql (lines 322, 369)
--   was updated to match, so source and database agree.
--
-- ROLLBACK
--   Replay the same DO block with the replacements reversed, or restore the
--   pre-014b body from git history. Reverting means the next staging ingest
--   reintroduces the padding and the split category.
-- ============================================================================

do $$
declare
  v_def    text;
  v_before int;
  v_after  int;
begin
  v_def := pg_get_functiondef('public.hmb_upsert_from_staging(uuid,text)'::regprocedure);

  select count(*) into v_before
  from regexp_matches(v_def, $f$row_data->>'OUTSTANDING'$f$, 'g');
  if v_before <> 1 then
    raise exception 'expected exactly 1 occurrence of row_data->>''OUTSTANDING'', found %', v_before;
  end if;

  v_def := replace(
    v_def,
    $f$row_data->>'OUTSTANDING'$f$,
    $r$nullif(btrim(row_data->>'OUTSTANDING'), '')$r$);

  select count(*) into v_before
  from regexp_matches(v_def, $f$row_data->>'Party Type'$f$, 'g');
  if v_before <> 1 then
    raise exception 'expected exactly 1 occurrence of row_data->>''Party Type'', found %', v_before;
  end if;

  v_def := replace(
    v_def,
    $f$row_data->>'Party Type'$f$,
    $r$case when upper(btrim(row_data->>'Party Type')) in ('CUSTOMER-DEBTORS','CUSTOMER/DEBTORS') then 'Customer/Debtors' else nullif(btrim(row_data->>'Party Type'), '') end$r$);

  execute v_def;

  select count(*) into v_after
  from pg_proc
  where proname = 'hmb_upsert_from_staging'
    and prosrc like '%nullif(btrim(row_data->>''OUTSTANDING''), '''')%'
    and prosrc like '%CUSTOMER-DEBTORS%';
  if v_after <> 1 then
    raise exception 'hmb_upsert_from_staging was not rewritten as expected';
  end if;
end $$;
