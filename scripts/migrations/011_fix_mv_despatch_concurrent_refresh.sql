-- ============================================================================
-- 011  APPLIED 2026-09-15.  agent.mv_despatch: refresh was dead, join
--      double-counted. See also 011b, which fixes the same bug in mv_pending.
-- ============================================================================
-- Two bugs. Fixing either alone makes things worse, so they went together.
--
-- ---------------------------------------------------------------------------
-- BUG 1 -- the refresh had never once succeeded
-- ---------------------------------------------------------------------------
-- postgres_logs, one occurrence every 20 minutes, every run, zero successes:
--     cannot refresh materialized view "agent.mv_despatch" concurrently
--
-- REFRESH ... CONCURRENTLY requires a UNIQUE index with no WHERE clause.
-- mv_despatch had eight indexes and not one was unique.
--
-- Drift at audit time:
--     agent.mv_despatch      max(despatch_date) 2026-09-09, 59,663 rows
--     despatch_orders_clean  max(despatch_date) 2026-09-13, 60,016 rows
-- Four days and 353 rows behind. agent.board_query / board_total / board_trend
-- / board_lines all read it, so every board answer under-reported those days.
--
-- Invisible because post_ingest_refresh() catches the error into an `ok:false`
-- field nothing reads, while still returning ok:true at the top level. The
-- session cleanup at the end of agent_refresh() never ran either, since it sits
-- after the failing statement.
--
-- ---------------------------------------------------------------------------
-- BUG 2 -- found by trying to fix bug 1, and why bug 1 could not be fixed alone
-- ---------------------------------------------------------------------------
-- The first attempt added the unique index and called REFRESH. The index built
-- against the stale snapshot and the REFRESH then failed rebuilding it:
--     could not create unique index "mv_despatch_key_idx"
--     DETAIL: Key (natural_key)=(H2M26-12420|GG 191125 04|GI|2025-11-23|WB|
--             Alipurduar|DESPATCH) is duplicated.
--
-- natural_key was unique in the stale data but NOT in current data, because of
--     LEFT JOIN dealer_kro_mapping dk
--       ON upper(trim(dk.dealer_name)) = upper(trim(d.client_name))
--
-- Name only. dealer_kro_mapping holds two names that legitimately appear twice
-- -- two different shops sharing a trade name in different districts, the
-- second of each added 2026-09-12:
--     MAA ENTERPRISE   SOUTH 24 PARGANAS  kro BALARAM MONDAL
--     MAA ENTERPRISE   NORTH 24 PARGANAS  kro SANKAR NARAYAN DEY
--     PAUL HARDWARE    JALPAIGURI         kro KUNDAN PRASAD
--     PAUL HARDWARE    ALIPURDUAR         kro ASHOK DAS
--
-- Not duplicate data. A wrong join key. Every despatch row for those names fans
-- out, and qty_mt is summed by board_total / board_query / board_trend:
--     rows affected 162, true 1,177.49 MT, after fan-out 2,354.99 MT
--
-- The live view was stale enough to predate those mapping rows, so answers were
-- four days short but NOT inflated. Restoring the refresh alone would have
-- introduced a 1,177 MT phantom on its first success.
--
-- ---------------------------------------------------------------------------
-- THE JOIN FIX -- four options, measured on live data
-- ---------------------------------------------------------------------------
-- (dealer_name, district) is verified unique in dealer_kro_mapping: zero
-- duplicates on the raw or normalize_district_key() form. District is a
-- sufficient disambiguator.
--
-- Against 60,016 true base rows / 694,095.82 MT:
--     join key                      rows    distinct  attributed   total MT
--     name only (was in place)     60,178    60,016      50,639    inflated
--     name + district              60,016    60,016      49,909    694,095.82
--     name + district, fall back   60,016    60,016      50,477    694,095.82
--
-- Strict name+district fixes the count but silently drops KRO on 730 rows where
-- the name matches and the district spelling does not. The tiered version keeps
-- both: 50,477 is exactly 50,639 minus the 162 phantoms, so no legitimate
-- attribution is lost. 568 rows attribute via the name fallback.
--
-- LATERAL ... LIMIT 1 is what structurally prevents recurrence. A third
-- same-name row degrades to picking one, never to double-counting.
--
-- A kro_match column ('district' | 'name' | null) records which tier each row
-- used, so imperfect attribution is auditable instead of silent.
--
-- ---------------------------------------------------------------------------
-- HOW IT WAS APPLIED -- not DROP ... CASCADE
-- ---------------------------------------------------------------------------
-- The obvious approach, "drop the matview and recreate it", fails:
--     cannot drop materialized view agent.mv_despatch because other objects
--     depend on it
-- 15 views depend on it, four levels deep: despatch -> board_plan, cycle,
-- plan_coverage, plan_unmatched -> board_dealer, board_district, board_plan_kro,
-- board_product, board_state, kpi_summary, trend_daily, trend_monthly ->
-- alerts, board_executive.
--
-- DROP ... CASCADE would have meant recreating ~27 KB of view definitions on
-- production. Not necessary: all 15 reach the matview through agent.despatch,
-- which is a plain 16-column pass-through, and CREATE OR REPLACE VIEW permits
-- any change to the query body as long as column names, types and order hold.
--
-- So: repoint agent.despatch at the base tables, swap the matview underneath,
-- repoint it back. One transaction, so dependents never observe a missing
-- object, and not one dependent view is dropped or rebuilt.
--
-- kro_match is deliberately NOT exposed through agent.despatch, which keeps its
-- original 16 columns and leaves all 14 downstream views untouched.
-- ============================================================================
--
-- VERIFIED AFTER APPLYING
--   rows 60,016 = distinct natural_key 60,016            -> no fan-out
--   mv total 694,095.82 MT = source total 694,095.82 MT  -> no double-count
--   max(despatch_date) 2026-09-13                        -> staleness gone
--   agent_refresh() -> {"ok": true, "despatch_rows": 60016,
--                       "pending_rows": 619,
--                       "latest_despatch": "2026-09-13", "took_ms": 7318}
--   all 17 agent views return rows (despatch 60016, board_dealer 819,
--     alerts 153, kpi_summary 1, board_state 10, board_district 88,
--     board_executive 39, board_plan 687, trend_daily 30, ...)
--   board_total('2026-09-01','2026-09-13') mt = 6,632.50
--     = agent.despatch same window = despatch_orders same window, exactly
--   the two ambiguous dealers now resolve per district:
--     MAA ENTERPRISE  NORTH 24 PARGANAS  SANKAR NARAYAN DEY  district    2 rows
--     MAA ENTERPRISE  SOUTH 24 PARGANAS  BALARAM MONDAL      district    9 rows
--     MAA ENTERPRISE  BANKURA            BALARAM MONDAL      name        8 rows
--     PAUL HARDWARE   ALIPURDUAR         ASHOK DAS           district  143 rows
--     (162 rows total, matching the measured fan-out exactly; BANKURA has no
--      mapping row of its own, so it falls back to name and is flagged as such)
--
-- ROLLBACK
--   Reverse the three steps with the pre-011 definitions from git history, and
--   drop mv_despatch_key_idx. Note that reverting reinstates both bugs.
-- ============================================================================

begin;

-- Re-verify the join-key assumption rather than trusting this file.
do $$
declare v_dupes bigint;
begin
  select count(*) into v_dupes from (
    select 1 from public.dealer_kro_mapping
    group by upper(btrim(dealer_name)), public.normalize_district_key(district)
    having count(*) > 1
  ) x;
  if v_dupes <> 0 then
    raise exception
      'dealer_kro_mapping has % (dealer_name, district) pairs duplicated; the two-tier join assumes that pair is unique', v_dupes;
  end if;
end $$;

-- Step 1: break the dependency by pointing agent.despatch at the base tables.
create or replace view agent.despatch as
select
    d.natural_key,
    d.despatch_date::date                      as despatch_date,
    nullif(d.order_date, '')::date             as order_date,
    d.client_name                              as dealer,
    d.state                                    as state_code,
    coalesce(sd.display, initcap(d.state))     as state,
    nullif(btrim(d.district), '')              as district,
    d.item                                     as product_code,
    coalesce(pd.name, d.item)                  as product,
    d.qty                                      as qty_mt,
    d.invoice_no,
    d.order_no,
    coalesce(nullif(btrim(d.kro), ''), m.kro)  as kro,
    m.krm,
    m.jr_kro,
    m.responsible
from public.despatch_orders d
left join agent.state_display   sd on sd.code = d.state
left join agent.product_display pd on pd.code = d.item
left join lateral (
    select dk.kro, dk.krm, dk.jr_kro, dk.responsible
    from public.dealer_kro_mapping dk
    where upper(btrim(dk.dealer_name)) = upper(btrim(d.client_name))
    order by (public.normalize_district_key(dk.district)
              = public.normalize_district_key(d.district)) desc nulls last
    limit 1
) m on true
where d.record_type = 'DESPATCH'
  and d.despatch_date ~ '^\d{4}-\d{2}-\d{2}$'
  and d.qty is not null;

-- Step 2: nothing depends on the matview now, so it can be replaced.
drop materialized view agent.mv_despatch;

create materialized view agent.mv_despatch as
select
    d.natural_key,
    d.despatch_date::date                      as despatch_date,
    nullif(d.order_date, '')::date             as order_date,
    d.client_name                              as dealer,
    d.state                                    as state_code,
    coalesce(sd.display, initcap(d.state))     as state,
    nullif(btrim(d.district), '')              as district,
    d.item                                     as product_code,
    coalesce(pd.name, d.item)                  as product,
    d.qty                                      as qty_mt,
    d.invoice_no,
    d.order_no,
    coalesce(nullif(btrim(d.kro), ''), m.kro)  as kro,
    m.krm,
    m.jr_kro,
    m.responsible,
    case when m.kro is null then null
         when m.district_matched then 'district'
         else 'name' end                       as kro_match
from public.despatch_orders d
left join agent.state_display   sd on sd.code = d.state
left join agent.product_display pd on pd.code = d.item
left join lateral (
    select dk.kro, dk.krm, dk.jr_kro, dk.responsible,
           (public.normalize_district_key(dk.district)
            = public.normalize_district_key(d.district)) as district_matched
    from public.dealer_kro_mapping dk
    where upper(btrim(dk.dealer_name)) = upper(btrim(d.client_name))
    order by (public.normalize_district_key(dk.district)
              = public.normalize_district_key(d.district)) desc nulls last
    limit 1
) m on true
where d.record_type = 'DESPATCH'
  and d.despatch_date ~ '^\d{4}-\d{2}-\d{2}$'
  and d.qty is not null;

comment on materialized view agent.mv_despatch is
  'Despatch fact view for the agent board RPCs. The dealer_kro_mapping join is a LATERAL ... LIMIT 1 on purpose: joining on dealer_name alone fanned out rows for dealers sharing a trade name across districts and double-counted qty_mt. See migration 011. Refreshed concurrently by agent_refresh(), which requires mv_despatch_key_idx to exist -- do not drop that index because it shows 0 scans.';

-- Bug 1's actual fix.
create unique index mv_despatch_key_idx on agent.mv_despatch (natural_key);

create index mv_despatch_date_idx       on agent.mv_despatch (despatch_date);
create index mv_despatch_dealer_idx     on agent.mv_despatch (dealer, despatch_date);
create index mv_despatch_state_idx      on agent.mv_despatch (state);
create index mv_despatch_district_idx   on agent.mv_despatch (district);
create index mv_despatch_kro_idx        on agent.mv_despatch (kro);
create index mv_despatch_krm_idx        on agent.mv_despatch (krm);
create index mv_despatch_date_state_idx on agent.mv_despatch (despatch_date, state);
-- mv_despatch_product_idx deliberately not recreated: 0 scans, 0 tuples read,
-- and product_code is not a filter in any agent.board_* function.

-- Step 3: repoint agent.despatch back at the corrected matview, original
-- 16-column signature, so the 14 downstream views are unaffected.
create or replace view agent.despatch as
select natural_key, despatch_date, order_date, dealer, state_code, state,
       district, product_code, product, qty_mt, invoice_no, order_no,
       kro, krm, jr_kro, responsible
from agent.mv_despatch;

commit;
