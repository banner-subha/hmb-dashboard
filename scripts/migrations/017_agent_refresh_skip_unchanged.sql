-- ============================================================================
-- 017  agent_refresh() rebuilds mv_despatch on every call, changed or not.
-- ============================================================================
-- This is the largest single CPU consumer on the instance.
--
-- MEASURED, 2026-09-15
--   pg_stat_statements, agent_refresh() called through PostgREST:
--     calls 217   total 1,284 s   mean 5,917 ms   min 2,075 ms   max 7,894 ms
--   That is about 21 minutes of CPU, the top entry in the whole database.
--
--   Timed the parts:
--     refresh materialized view concurrently agent.mv_despatch   5,043.8 ms
--     refresh materialized view concurrently agent.mv_pending       450.6 ms
--     count(*) mv_despatch                                           25.9 ms
--     count(*) mv_pending                                             0.3 ms
--     delete expired app_sessions                                     3.6 ms
--
--   mv_despatch is 91% of the cost. A concurrent refresh is dearer than a
--   plain one by design: it builds the full result into a temp table, then
--   diffs it against the live matview on the unique key and applies the
--   delta. For 60,016 rows that work happens whether or not anything changed.
--
-- WHY THIS MATTERS MORE THAN IT LOOKS
--   This instance is CPU bound, not I/O bound. Across every slow statement in
--   pg_stat_statements, shared_blk_read_time is 0.0 and reads are negligible
--   while buffer hits run into the millions. Throughput measures about 100k
--   cached buffer pins per second. So CPU spent refreshing unchanged data is
--   taken directly from the queries the agent is waiting on, and the refresh
--   runs every 20 minutes against data that arrives in a few batches a day.
--
-- THE DATE TRAP, AND WHY THE TWO MATVIEWS GET DIFFERENT GUARDS
--   agent.mv_pending computes age_days and age_bucket from current_date.
--   A date rollover makes it stale even when do_pending has not changed by a
--   single row, so an inputs-only guard would freeze the ageing buckets.
--   That is the same silent staleness migration 011 was written to fix, so
--   mv_pending carries an extra current_date term in its guard.
--   agent.mv_despatch has no current_date or now() in its definition
--   (verified against pg_get_viewdef), so its inputs alone decide.
--
-- CHANGE DETECTION
--   agent.mv_src_signature() hashes each source relation. Tables contribute:
--     relfilenode + n_tup_ins,n_tup_upd,n_tup_del      (flushed counters)
--                 + xact_ins,xact_upd,xact_del          (this transaction's)
--   The tuple counters are monotonic, so any INSERT, UPDATE or DELETE moves at
--   least one and the signature cannot repeat after a change. relfilenode
--   covers what the counters miss: TRUNCATE does not bump n_tup_del, and
--   TRUNCATE, VACUUM FULL and CLUSTER all change relfilenode. A VACUUM FULL
--   therefore buys one needless refresh, which is harmless.
--
--   TWO CORRECTIONS FOUND WHILE TESTING, both worth recording because the
--   first draft of this migration shipped neither:
--
--   1. agent.state_display and agent.product_display are VIEWS, not tables:
--      hardcoded VALUES lists, verified with pg_get_viewdef. They own no rows,
--      so tuple counters are identically zero for them and contributed nothing
--      but a constant. A change to those mappings would have been invisible.
--      Views now contribute md5(pg_get_viewdef(...)) instead, so a
--      CREATE OR REPLACE VIEW is picked up.
--
--   2. Flushed counters are only reported at commit, so a write and a refresh
--      inside ONE transaction read pre-commit counters. This was not a
--      theoretical worry: the first test did
--          update public.dealer_kro_mapping set dealer_name = dealer_name ...;
--          select public.agent_refresh();
--      and it SKIPPED. The signature now also includes
--      pg_stat_get_xact_tuples_inserted/updated/deleted, which are this
--      transaction's own uncommitted counts. Re-tested: it refreshes.
--
--      Because a skip deliberately stores the OLD signature rather than the
--      one it just computed, a miss also self-heals on the following call.
--      That was verified too, before the xact fix: the call after the skipped
--      one refreshed both matviews.
--
--      The cost of the xact terms is one extra refresh as they settle: the
--      in-transaction call sees xact=1, the next call sees xact=0 with the
--      flushed counter advanced, so it rebuilds once more and then skips.
--      Measured: refresh, refresh, skip. A missed refresh became at most one
--      surplus refresh, which is the right direction for a guard whose job is
--      protecting correctness.
--
--   Belt and braces on top of all that:
--     1. post_ingest_refresh() calls agent_refresh_force(), which skips
--        nothing. The ingest path never depends on detection at all.
--     2. A 6 hour backstop refreshes regardless, so staleness stays bounded
--        even if detection failed for a reason not anticipated here.
--
-- SIGNATURE KEPT IDENTICAL
--   public.agent_refresh() stays a zero-argument function returning jsonb.
--   Adding p_force with a default would have created a second overload and
--   made the bare agent_refresh() call PostgREST makes ambiguous, which would
--   have broken the agent outright. The force path is a separate function.
--
-- ROLLBACK
--   Restore agent_refresh() and post_ingest_refresh() from migration 016 and
--   drop agent.mv_refresh_state plus agent.mv_src_signature. Reverting
--   reinstates the unconditional refresh; it loses no data.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Where the last refresh of each matview is recorded.
-- ---------------------------------------------------------------------------
create table if not exists agent.mv_refresh_state (
  mv_name       text primary key,
  src_signature text,
  src_date      date,
  refreshed_at  timestamptz,
  last_ms       numeric,
  skips_since   integer not null default 0
);

comment on table agent.mv_refresh_state is
  'Per-matview record of the last agent_refresh() rebuild: the source-table signature it was built from, the current_date it was built on, and how many calls have been skipped since. Written only by agent.mv_refresh_guarded(). See migration 017.';

-- ---------------------------------------------------------------------------
-- Cheap fingerprint of a set of source tables.
-- Volatile on purpose: the statistics it reads move under it, and caching the
-- result inside a statement is exactly what must not happen.
-- ---------------------------------------------------------------------------
create or replace function agent.mv_src_signature(p_rels text[])
returns text
language sql
volatile
security definer
set search_path to 'pg_catalog', 'public', 'agent'
as $fn$
  select md5(string_agg(x.rel || '=' || x.sig, '|' order by x.rel))
  from (
    select u.rel,
           case
             -- Tables and matviews: relfilenode, the flushed DML counters, and
             -- the CURRENT transaction's own not-yet-flushed counters. Any
             -- insert/update/delete moves one of them; truncate, vacuum full
             -- and cluster move relfilenode.
             --
             -- The xact_* terms exist because the flushed counters are only
             -- reported at commit. Without them, "update ...; select
             -- agent_refresh();" in one transaction reads pre-commit counters,
             -- sees no change and skips the rebuild. Measured: it did exactly
             -- that. Including them turns a missed refresh into at most one
             -- extra refresh on the following call, which is the right
             -- direction to fail in.
             when c.relkind in ('r', 'p', 'm') then
               coalesce(c.relfilenode::text, 'x')                     || ':' ||
               coalesce(s.n_tup_ins, 0)::text                         || ',' ||
               coalesce(s.n_tup_upd, 0)::text                         || ',' ||
               coalesce(s.n_tup_del, 0)::text                         || ';' ||
               coalesce(pg_stat_get_xact_tuples_inserted(c.oid), 0)::text || ',' ||
               coalesce(pg_stat_get_xact_tuples_updated(c.oid), 0)::text  || ',' ||
               coalesce(pg_stat_get_xact_tuples_deleted(c.oid), 0)::text
             -- Views own no rows, so counters say nothing. Both display views
             -- are hardcoded VALUES lists whose only way of changing is
             -- CREATE OR REPLACE VIEW, which the definition hash catches.
             when c.relkind = 'v' then
               'v:' || md5(pg_get_viewdef(c.oid, true))
             else 'unknown:' || coalesce(c.relkind::text, 'missing')
           end as sig
    from unnest(p_rels) u(rel)
    left join pg_class c on c.oid = u.rel::regclass
    left join pg_stat_all_tables s on s.relid = u.rel::regclass
  ) x;
$fn$;

comment on function agent.mv_src_signature(text[]) is
  'Fingerprint of the given relations, used by agent.mv_refresh_guarded() to decide whether a matview refresh can be skipped. Tables and matviews contribute relfilenode, the flushed n_tup_ins/upd/del counters, and the current transaction''s own unflushed xact counters (needed because flushed counters are only reported at commit). Views contribute a hash of their definition, because agent.state_display and agent.product_display are hardcoded VALUES lists. See migration 017.';

-- ---------------------------------------------------------------------------
-- The implementation. Both public entry points delegate here.
-- ---------------------------------------------------------------------------
create or replace function agent.mv_refresh_guarded(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'agent', 'public', 'pg_temp'
as $fn$
declare
  t0            timestamptz := clock_timestamp();
  tt            timestamptz;
  v_backstop    interval := interval '6 hours';
  v_sig_d       text;
  v_sig_p       text;
  v_st_d        agent.mv_refresh_state;
  v_st_p        agent.mv_refresh_state;
  v_did_d       boolean := false;
  v_did_p       boolean := false;
  v_ms_d        numeric := 0;
  v_ms_p        numeric := 0;
  n_d           integer;
  n_p           integer;
begin
  v_sig_d := agent.mv_src_signature(array[
    'public.despatch_orders', 'public.dealer_kro_mapping',
    'agent.state_display',    'agent.product_display']);
  v_sig_p := agent.mv_src_signature(array[
    'public.do_pending',      'public.dealer_kro_mapping',
    'agent.state_display',    'agent.product_display']);

  select * into v_st_d from agent.mv_refresh_state where mv_name = 'mv_despatch';
  select * into v_st_p from agent.mv_refresh_state where mv_name = 'mv_pending';

  -- mv_despatch: no current_date in its definition, so inputs alone decide.
  if p_force
     or v_st_d.mv_name is null
     or v_st_d.refreshed_at is null
     or v_st_d.src_signature is distinct from v_sig_d
     or v_st_d.refreshed_at < now() - v_backstop
  then
    tt := clock_timestamp();
    refresh materialized view concurrently agent.mv_despatch;
    v_ms_d  := round(extract(epoch from clock_timestamp() - tt) * 1000);
    v_did_d := true;
  end if;

  -- mv_pending: age_days and age_bucket come from current_date, so the date
  -- itself is part of the input. Unchanged rows on a new day are still stale.
  if p_force
     or v_st_p.mv_name is null
     or v_st_p.refreshed_at is null
     or v_st_p.src_signature is distinct from v_sig_p
     or v_st_p.src_date is distinct from current_date
     or v_st_p.refreshed_at < now() - v_backstop
  then
    tt := clock_timestamp();
    refresh materialized view concurrently agent.mv_pending;
    v_ms_p  := round(extract(epoch from clock_timestamp() - tt) * 1000);
    v_did_p := true;
  end if;

  -- Record state. A skipped matview keeps its old refreshed_at and last_ms so
  -- the backstop still measures from the last real rebuild, and the signature
  -- is stored only when a refresh actually happened -- otherwise a skip would
  -- adopt the new signature and the change would never be picked up.
  insert into agent.mv_refresh_state
        (mv_name, src_signature, src_date, refreshed_at, last_ms, skips_since)
  values ('mv_despatch',
          case when v_did_d then v_sig_d else v_st_d.src_signature end,
          case when v_did_d then current_date else v_st_d.src_date end,
          case when v_did_d then now() else v_st_d.refreshed_at end,
          case when v_did_d then v_ms_d else v_st_d.last_ms end,
          case when v_did_d then 0 else coalesce(v_st_d.skips_since, 0) + 1 end)
  on conflict (mv_name) do update
     set src_signature = excluded.src_signature,
         src_date      = excluded.src_date,
         refreshed_at  = excluded.refreshed_at,
         last_ms       = excluded.last_ms,
         skips_since   = excluded.skips_since;

  insert into agent.mv_refresh_state
        (mv_name, src_signature, src_date, refreshed_at, last_ms, skips_since)
  values ('mv_pending',
          case when v_did_p then v_sig_p else v_st_p.src_signature end,
          case when v_did_p then current_date else v_st_p.src_date end,
          case when v_did_p then now() else v_st_p.refreshed_at end,
          case when v_did_p then v_ms_p else v_st_p.last_ms end,
          case when v_did_p then 0 else coalesce(v_st_p.skips_since, 0) + 1 end)
  on conflict (mv_name) do update
     set src_signature = excluded.src_signature,
         src_date      = excluded.src_date,
         refreshed_at  = excluded.refreshed_at,
         last_ms       = excluded.last_ms,
         skips_since   = excluded.skips_since;

  select count(*) into n_d from agent.mv_despatch;
  select count(*) into n_p from agent.mv_pending;

  -- keep expired app sessions from accumulating
  delete from agent.app_sessions where expires_at < now();

  return jsonb_build_object(
    'ok', true,
    'despatch_rows', n_d,
    'pending_rows', n_p,
    'latest_despatch', (select max(despatch_date) from agent.mv_despatch),
    'forced', p_force,
    'refreshed', jsonb_build_object('mv_despatch', v_did_d, 'mv_pending', v_did_p),
    'refresh_ms', jsonb_build_object('mv_despatch', v_ms_d, 'mv_pending', v_ms_p),
    'took_ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Public entry points. agent_refresh() keeps its exact zero-argument jsonb
-- signature so PostgREST and every existing caller are unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.agent_refresh()
returns jsonb
language plpgsql
security definer
set search_path to 'agent', 'public', 'pg_temp'
as $fn$
begin
  return agent.mv_refresh_guarded(false);
end;
$fn$;

comment on function public.agent_refresh() is
  'Refreshes agent.mv_despatch and agent.mv_pending, skipping either one whose source tables have not changed since the last rebuild (and, for mv_pending, whose current_date has not rolled over). Use agent_refresh_force() to rebuild unconditionally. See migration 017.';

create or replace function public.agent_refresh_force()
returns jsonb
language plpgsql
security definer
set search_path to 'agent', 'public', 'pg_temp'
as $fn$
begin
  return agent.mv_refresh_guarded(true);
end;
$fn$;

comment on function public.agent_refresh_force() is
  'agent_refresh() with every skip guard bypassed. Called by post_ingest_refresh() so the ingest path never depends on change detection, and available by hand after a manual data fix.';

-- ---------------------------------------------------------------------------
-- post_ingest_refresh(): identical to 016 except that it forces the rebuild.
-- Ingest is precisely the moment the data has changed, so detection is both
-- unnecessary and the one place stats flush lag could bite.
-- ---------------------------------------------------------------------------
create or replace function public.post_ingest_refresh()
returns json
language plpgsql
security definer
set search_path to 'public', 'agent', 'pg_temp'
set statement_timeout to '120s'
as $fn$
declare
  v_start timestamptz := clock_timestamp();
  v_dim   bigint;
  v_agent jsonb;
  v_fresh json;
  v_vdim  jsonb;
begin
  refresh materialized view concurrently public.dim_catalog;
  select count(*) into v_dim from public.dim_catalog;

  begin
    refresh materialized view concurrently public.visit_dim_catalog;
    v_vdim := jsonb_build_object('ok', true,
      'rows', (select count(*) from public.visit_dim_catalog));
  exception when others then
    v_vdim := jsonb_build_object('ok', false, 'error', SQLERRM);
  end;

  begin
    v_fresh := public.refresh_data_freshness();
  exception when others then
    v_fresh := json_build_object('ok', false, 'error', SQLERRM);
  end;

  begin
    v_agent := public.agent_refresh_force();
  exception when others then
    v_agent := jsonb_build_object('ok', false, 'error', SQLERRM);
  end;

  return json_build_object(
    'ok', true,
    'dim_catalog_rows', v_dim,
    'visit_dim_catalog', v_vdim,
    'data_freshness', v_fresh,
    'agent_refresh', v_agent,
    'duration_ms', round(extract(epoch from clock_timestamp() - v_start) * 1000),
    'refreshed_at', now()
  );
end;
$fn$;

commit;

-- ============================================================================
-- APPLIED AND VERIFIED 2026-09-15
-- ============================================================================
-- The sequence actually run, in order, with took_ms as reported by the
-- function itself. Each line is one call to public.agent_refresh() unless
-- marked otherwise.
--
--   state table empty                     refresh both   5,105 ms
--   nothing changed                        SKIP             14 ms
--   -- view-handling fix applied to mv_src_signature --
--   signature format changed              refresh both   4,589 ms
--   nothing changed                        SKIP             14 ms
--   update dealer_kro_mapping, same txn    SKIP  <-- BUG    15 ms
--   next call, counters flushed           refresh both   2,116 ms  (self-heal)
--   -- xact-counter fix applied to mv_src_signature --
--   signature format changed              refresh both   4,124 ms
--   nothing changed                        SKIP             15 ms
--   update dealer_kro_mapping, same txn   refresh both   4,616 ms  (fixed)
--   next call, xact term settles          refresh both   2,065 ms
--   nothing changed                        SKIP             15 ms  (converged)
--   agent_refresh_force()                 refresh both   2,072 ms  forced:true
--
--   So: 5,105 ms -> 14 ms on a no-op call, and the guard provably opens on a
--   real write, including one made in the same transaction.
--
--   A refresh of unchanged data costs between 2.0 and 5.1 s depending on how
--   warm the cache is. The skip is flat at 14 to 15 ms.
--
-- DATA UNCHANGED, checked before and after
--   agent.despatch      60,016 rows / 694,095.82 MT
--   agent.pending          686 rows /  16,982.98 MT
--   agent.alerts           153      agent.board_dealer      819
--   agent.pending_age        4 buckets
--   latest_despatch   2026-09-13
--   dim_catalog          9,939      visit_dim_catalog    26,566
--   despatch_orders where outstanding = '< 7 Days'       28,405
--   Identical on both sides. The guard changes when a rebuild happens, never
--   what a rebuild produces.
--
-- INGEST CHAIN RE-RUN END TO END
--   select public.post_ingest_refresh();
--     ok true, dim_catalog_rows 9939, visit_dim_catalog ok 26566,
--     data_freshness ok 6 tables 910 ms,
--     agent_refresh ok forced TRUE took_ms 4372, duration_ms 22,195
--   Against a mean of 21,834 ms before this change, so no regression, and
--   forced:true confirms ingest is not relying on the guard.
--
-- WATCH THIS AFTER A FEW DAYS
--   select mv_name, refreshed_at, last_ms, skips_since
--   from agent.mv_refresh_state order by mv_name;
--
--   skips_since should sit in the tens between ingests and reset to 0 on each
--   one. If it never climbs, detection is firing on something that changes
--   constantly and the saving is not being had. If it climbs past roughly 18
--   on mv_pending, the current_date term is not doing its job, because a
--   20 minute cron cannot skip more than 72 calls in a day and mv_pending must
--   rebuild at every date rollover.

-- ============================================================================
-- CONFIRMED IN PRODUCTION 2026-09-15
-- ============================================================================
-- The n8n workflow "HMB Command Agent - Refresh Views" (zpJl3FBcxwbn61gd) had
-- both its triggers on one HTTP node calling agent_refresh. That is right for
-- the 20 minute schedule and wrong for the post-ingest webhook, where a rebuild
-- is the entire point. It was split: the schedule keeps agent_refresh, the
-- "Refresh Now" webhook now calls agent_refresh_force. Published, active.
--
-- Both halves then observed doing their jobs on live traffic.
--
-- THE GUARD SKIPPING, unprompted, on the schedule branch:
--   11:34:59  ingest -> post_ingest_refresh -> forced   skips_since 0
--   11:51:03  reading after one cron firing            skips_since 1
--   refreshed_at unchanged at 11:34:59, so that cron call cost about 15 ms
--   instead of about 5 s. First production evidence the guard pays.
--
-- THE WEBHOOK FORCING, one POST to the production URL:
--   {"ok":true,"forced":true,"took_ms":6839,
--    "refreshed":{"mv_pending":true,"mv_despatch":true},
--    "refresh_ms":{"mv_pending":646,"mv_despatch":6009},
--    "pending_rows":686,"despatch_rows":60016,
--    "latest_despatch":"2026-09-13"}
--   HTTP 200 in 9.46 s. State table then read refreshed_at 11:51:16 with
--   skips_since back to 0 on both rows.
--
-- Data identical across all of it: agent.despatch 60,016 / 694,095.82 MT,
-- agent.pending 686, alerts 153, board_dealer 819.
