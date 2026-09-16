-- ============================================================================
-- 011b  APPLIED 2026-09-15.  agent.mv_pending has the same bug as mv_despatch.
-- ============================================================================
-- Read 011 first -- it carries the full diagnosis of the dealer_kro_mapping
-- fan-out. This is the same defect in the pending-order matview.
--
-- HOW IT SURFACED
--   agent_refresh() refreshes mv_despatch first, and that statement had been
--   failing outright, so the mv_pending refresh on the next line had never
--   executed at all. Fixing 011 exposed it immediately:
--       duplicate key value violates unique constraint "mv_pending_key_idx"
--       DETAIL: Key (natural_key)=(P 12092026 12|P|2026-09-12|PAUL HARDWARE)
--               already exists.
--       CONTEXT: refresh materialized view concurrently agent.mv_pending
--                PL/pgSQL function agent_refresh() line 5
--
--   Note mv_pending DID already have its unique index (mv_pending_key_idx).
--   That is why this bug produced a hard error here rather than the silent
--   staleness mv_despatch suffered -- and why, during the audit, mv_pending
--   looked like the healthy one. It was not: it was simply never reached.
--
-- SAME ROOT CAUSE
--   LEFT JOIN dealer_kro_mapping dk
--     ON upper(trim(dk.dealer_name)) = upper(trim(p.client_name))
--   PAUL HARDWARE exists twice (Jalpaiguri and Alipurduar), so its pending
--   rows fan out and pending_mt is double-counted.
--
-- MEASURED ON LIVE DATA
--   true            619 rows, 13,585.02 MT pending
--   name-only join  624 rows, 13,631.02 MT   <- 5 phantom rows, +46.00 MT
--   tiered join     619 rows, 13,585.02 MT   <- correct
--
--   Staleness was real here too: mv_pending sat at order_date 2026-09-07 while
--   do_pending ran to 2026-09-13.
--
--   pending_mt feeds agent.pending -> pending_age, board_dealer.pending_mt,
--   board_product.pending_mt, kpi_summary.pending_mt and the 'backlog' branch
--   of agent.alerts, so the over-count reached the ageing-receivables alerts.
--
-- SAME TECHNIQUE AS 011
--   agent.pending is a plain 17-column pass-through, so: repoint it at the base
--   tables, swap the matview underneath, repoint it back. One transaction, no
--   dependent view dropped. kro_match is not exposed, so the 17-column
--   signature and every dependent view are unchanged.
--
-- VERIFIED AFTER APPLYING
--   agent_refresh() -> {"ok": true, "despatch_rows": 60016,
--                       "pending_rows": 619,
--                       "latest_despatch": "2026-09-13", "took_ms": 7318}
--   agent.pending 619 rows, agent.pending_age 4 buckets
--   all 17 agent views return rows
--
-- ROLLBACK
--   Reverse the three steps using the pre-011b definitions from git history.
--   Reverting reinstates the fan-out and the failing refresh.
-- ============================================================================

begin;

-- Step 1: break the dependency.
create or replace view agent.pending as
select
    p.natural_key,
    nullif(p.order_date, '')::date                    as order_date,
    p.client_name                                     as dealer,
    p.state                                           as state_code,
    coalesce(sd.display, initcap(p.state))            as state,
    nullif(btrim(p.district), '')                     as district,
    p.item                                            as product_code,
    coalesce(pd.name, p.item)                         as product,
    p.order_qty,
    p.despatch_qty,
    p.actual_pending                                  as pending_mt,
    p.no_of_bills,
    p.remarks,
    coalesce(nullif(btrim(p.kro_krm), ''), m.kro)     as kro,
    m.krm,
    current_date - nullif(p.order_date, '')::date     as age_days,
    case
      when (current_date - nullif(p.order_date,'')::date) <= 30 then '0-30d'
      when (current_date - nullif(p.order_date,'')::date) <= 60 then '31-60d'
      when (current_date - nullif(p.order_date,'')::date) <= 90 then '61-90d'
      else '90d+'
    end                                               as age_bucket
from public.do_pending p
left join agent.state_display   sd on sd.code = p.state
left join agent.product_display pd on pd.code = p.item
left join lateral (
    select dk.kro, dk.krm
    from public.dealer_kro_mapping dk
    where upper(btrim(dk.dealer_name)) = upper(btrim(p.client_name))
    order by (public.normalize_district_key(dk.district)
              = public.normalize_district_key(p.district)) desc nulls last
    limit 1
) m on true
where p.order_date ~ '^\d{4}-\d{2}-\d{2}$'
  and coalesce(p.actual_pending, 0) > 0;

-- Step 2: swap the matview.
drop materialized view agent.mv_pending;

create materialized view agent.mv_pending as
select
    p.natural_key,
    nullif(p.order_date, '')::date                    as order_date,
    p.client_name                                     as dealer,
    p.state                                           as state_code,
    coalesce(sd.display, initcap(p.state))            as state,
    nullif(btrim(p.district), '')                     as district,
    p.item                                            as product_code,
    coalesce(pd.name, p.item)                         as product,
    p.order_qty,
    p.despatch_qty,
    p.actual_pending                                  as pending_mt,
    p.no_of_bills,
    p.remarks,
    coalesce(nullif(btrim(p.kro_krm), ''), m.kro)     as kro,
    m.krm,
    current_date - nullif(p.order_date, '')::date     as age_days,
    case
      when (current_date - nullif(p.order_date,'')::date) <= 30 then '0-30d'
      when (current_date - nullif(p.order_date,'')::date) <= 60 then '31-60d'
      when (current_date - nullif(p.order_date,'')::date) <= 90 then '61-90d'
      else '90d+'
    end                                               as age_bucket,
    case when m.kro is null then null
         when m.district_matched then 'district'
         else 'name' end                              as kro_match
from public.do_pending p
left join agent.state_display   sd on sd.code = p.state
left join agent.product_display pd on pd.code = p.item
left join lateral (
    select dk.kro, dk.krm,
           (public.normalize_district_key(dk.district)
            = public.normalize_district_key(p.district)) as district_matched
    from public.dealer_kro_mapping dk
    where upper(btrim(dk.dealer_name)) = upper(btrim(p.client_name))
    order by (public.normalize_district_key(dk.district)
              = public.normalize_district_key(p.district)) desc nulls last
    limit 1
) m on true
where p.order_date ~ '^\d{4}-\d{2}-\d{2}$'
  and coalesce(p.actual_pending, 0) > 0;

comment on materialized view agent.mv_pending is
  'Pending-order fact view for the agent board RPCs. The dealer_kro_mapping join is a LATERAL ... LIMIT 1 on purpose: joining on dealer_name alone fanned out rows for dealers sharing a trade name across districts and double-counted pending_mt. See migration 011b. mv_pending_key_idx is required by agent_refresh() for concurrent refresh -- do not drop it because it shows 0 scans.';

create unique index mv_pending_key_idx    on agent.mv_pending (natural_key);
create index        mv_pending_state_idx  on agent.mv_pending (state);
create index        mv_pending_dealer_idx on agent.mv_pending (dealer);
create index        mv_pending_bucket_idx on agent.mv_pending (age_bucket);

-- Step 3: repoint back, original 17-column signature.
create or replace view agent.pending as
select natural_key, order_date, dealer, state_code, state, district,
       product_code, product, order_qty, despatch_qty, pending_mt,
       no_of_bills, remarks, kro, krm, age_days, age_bucket
from agent.mv_pending;

commit;
