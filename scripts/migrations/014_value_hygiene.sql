-- ============================================================================
-- 014  Value-level pollution that makes the agent answer wrong
-- ============================================================================
-- This migration reclaims almost no space. It is here because the pollution it
-- fixes corrupts answers, which matters more than the megabytes.
--
-- ---------------------------------------------------------------------------
-- FINDING 1: despatch_orders.outstanding is whitespace-padded
-- ---------------------------------------------------------------------------
--   select '['||outstanding||']', count(*) from despatch_orders group by 1;
--     [  < 7 Days]        28,405
--     [   8-15 Days]      13,558
--     [    16-30 Days]    10,551
--     [     >30 Days]      7,426
--     null                33,896
--
--   Four ageing buckets, every one carrying leading spaces, and the padding is
--   not even consistent in width. agent_run_sql() lets the model write its own
--   SQL against this table, so the natural
--       where outstanding = '< 7 Days'
--   silently returns zero rows. The zero reads as a real answer, so the model
--   reports no ageing receivables when there are some.
--
-- ---------------------------------------------------------------------------
-- FINDING 2: dia_wise_despatch.party_type holds one category under two spellings
-- ---------------------------------------------------------------------------
--   Customer/Debtors    188,967
--   Customer-Debtors        564     <- same category, different separator
--   Supplier/Customer         2
--
--   party_type is exposed to the model as a groupable dimension
--   (app/tools/registry.py line 147) and dim_catalog lists all three values as
--   distinct valid options. So "break this down by party type" returns
--   Customer/Debtors and Customer-Debtors as two separate lines, splitting one
--   category in a way a reader cannot detect.
--
-- ---------------------------------------------------------------------------
-- APPLIED 2026-09-15, TOGETHER WITH BOTH WRITE PATHS
-- ---------------------------------------------------------------------------
--   This file only cleans what is already stored. There turned out to be TWO
--   paths that would re-pollute it on the next ingest, not one:
--
--   1. The Python loader, n8n/data ingestion/main.py. Patched in the same
--      change: added _clean_text() and _clean_party_type() helpers and pointed
--      the two fields at them. 15 unit cases pass, including idempotency on
--      already-clean input.
--
--   2. public.hmb_upsert_from_staging(uuid, text), a 15 KB DB-side upsert that
--      read row_data->>'OUTSTANDING' and row_data->>'Party Type' verbatim with
--      no trim anywhere in its body. Found by checking pg_proc rather than
--      trusting that main.py was the only writer. Patched by migration 014b;
--      the repo copy in n8n/data ingestion/supabase_schema.sql was updated to
--      match (lines 322 and 369).
--
--   SAFE FOR natural_key: neither column appears in natural_key_cols
--   (despatch_orders: INVOICE NO, ORDER NO, ITEM, DESPATCH DATE, STATE,
--    DISTRICT, TYPE; dia_wise_despatch: Invoice No, Item Category,
--    Item Remarks, Item Sales Qty), and _natural_key() already strips its
--   parts, so upsert matching cannot shift and no duplicate rows can appear.
--
-- VERIFIED AFTER APPLYING
--   outstanding, all padding gone, every count preserved:
--     [< 7 Days] 28,405   [8-15 Days] 13,558
--     [16-30 Days] 10,551 [>30 Days] 7,426   null 33,896   total 93,836
--   party_type: Customer/Debtors 189,531 (188,967 + 564),
--               Supplier/Customer 2, total 189,533
--   dim_catalog party_type now lists 2 values; Customer-Debtors is gone
--   THE ACTUAL BUG: select count(*) from despatch_orders
--                   where outstanding = '< 7 Days'
--                   returns 28,405, where it returned 0 before
--
-- ROLLBACK
--   outstanding is reversible without a backup, since each bucket had exactly
--   one padding form: map back to '  < 7 Days', '   8-15 Days',
--   '    16-30 Days', '     >30 Days' (2, 3, 4 and 5 leading spaces).
--   party_type is lossy, so the 564 affected rows were snapshotted first:
--     update public.dia_wise_despatch d set party_type = b.party_type
--       from public._bak_014_party_type b where b.natural_key = d.natural_key;
--   Drop public._bak_014_party_type once this is settled.
--
-- FOLLOW-UP 2026-09-15: the snapshot table was created in public with no RLS,
--   so the Supabase linter flagged it at ERROR level (0013, rls_disabled_in_public)
--   as readable over the Data API. RLS is now enabled on it with no policy.
--   The rollback above still works, because it runs as the table owner and
--   owners bypass RLS unless FORCE ROW LEVEL SECURITY is set. Verified after
--   the change: the owner still reads all 564 rows.
--
--   public.data_freshness_snapshot, added by migration 010, carries the same
--   lint and has NOT been changed. It sits on the live freshness path that
--   prompt.py reads for its staleness guard, so it wants testing rather than a
--   one-line alter.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Insurance for the lossy half. 564 rows, a few tens of kB. The outstanding
-- change needs no backup: each bucket had exactly one padding form, so that
-- mapping is bijective.
-- ---------------------------------------------------------------------------
create table if not exists public._bak_014_party_type as
select natural_key, party_type
from public.dia_wise_despatch
where party_type = 'Customer-Debtors';

comment on table public._bak_014_party_type is
  'Pre-014 snapshot of the 564 dia_wise_despatch rows whose party_type read Customer-Debtors before being collapsed onto Customer/Debtors. Safe to drop once 014 is settled.';

-- ---------------------------------------------------------------------------
-- Strip the padding. btrim only; the bucket labels themselves are unchanged so
-- nothing that already matched stops matching.
-- ---------------------------------------------------------------------------
update public.despatch_orders
   set outstanding = nullif(btrim(outstanding), '')
 where outstanding is not null
   and outstanding <> nullif(btrim(outstanding), '');

-- ---------------------------------------------------------------------------
-- Collapse the separator variant onto the dominant spelling. Direction chosen
-- by weight of evidence: 188,967 rows say "Customer/Debtors" against 564.
-- Supplier/Customer (2 rows) is a genuinely different category -- left alone.
-- ---------------------------------------------------------------------------
update public.dia_wise_despatch
   set party_type = 'Customer/Debtors'
 where party_type = 'Customer-Debtors';

commit;

-- ---------------------------------------------------------------------------
-- dim_catalog sources both of these columns, so it now describes values that
-- no longer exist. Refresh it or the model keeps being offered
-- 'Customer-Debtors' as a filter that matches nothing.
-- ---------------------------------------------------------------------------
refresh materialized view concurrently public.dim_catalog;

-- VERIFY
--   select '['||outstanding||']', count(*) from public.despatch_orders
--     group by 1 order by 2 desc;
--   -- expect exactly: [< 7 Days], [8-15 Days], [16-30 Days], [>30 Days], null
--
--   select party_type, count(*) from public.dia_wise_despatch group by 1;
--   -- expect exactly: Customer/Debtors 189531, Supplier/Customer 2
--
--   select value from public.dim_catalog where dimension = 'party_type';
--   -- expect 2 rows, no Customer-Debtors
--
-- (Rollback is documented in the header. The party_type snapshot is created by
--  this migration rather than left as a suggestion.)
