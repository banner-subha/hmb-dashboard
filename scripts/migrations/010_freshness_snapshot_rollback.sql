-- Rollback for 010. Restores v_data_freshness to the live-scanning definition
-- captured from the deployed database on 2026-09-15 before the change.
-- The snapshot table and refresh function are left in place (harmless, 6 rows);
-- drop them explicitly at the bottom if a full revert is wanted.

begin;

create or replace view public.v_data_freshness as
 select 'despatch_orders'::text as table_name,
    'NEW DASHBOARD REPORT FORMAT-V2.xlsx'::text as source_file,
    (select count(*) from despatch_orders_clean) as row_count,
    (select max(despatch_orders_clean.despatch_date) from despatch_orders_clean
      where despatch_orders_clean.record_type = 'DESPATCH'::text) as latest_data_date,
    (select CURRENT_DATE - max(despatch_orders_clean.despatch_date)::date from despatch_orders_clean
      where despatch_orders_clean.record_type = 'DESPATCH'::text) as days_behind
union all
 select 'dia_wise_despatch'::text, 'DIA WISE DESPATCH -BI.xlsx'::text,
    (select count(*) from dia_wise_despatch),
    (select max(dia_wise_despatch.invoice_date) from dia_wise_despatch),
    (select CURRENT_DATE - max(dia_wise_despatch.invoice_date)::date from dia_wise_despatch)
union all
 select 'do_pending'::text, 'DO PENDING.xlsx'::text,
    (select count(*) from do_pending),
    (select max(do_pending.order_date) from do_pending),
    (select CURRENT_DATE - max(do_pending.order_date)::date from do_pending)
union all
 select 'field_visits'::text, 'VISIT_TRACKER_SEPT.csv'::text,
    (select count(*) from field_visits),
    (select max(field_visits.visit_date)::text from field_visits),
    (select CURRENT_DATE - max(field_visits.visit_date) from field_visits)
union all
 select 'dealer_targets'::text, 'SEASON_7_DEALER VS TARGET.xlsx'::text,
    (select count(*) from dealer_targets), NULL::text, NULL::integer
union all
 select 'dealer_kro_mapping'::text, 'DEALER WISE JR-KRO NAME.xlsx'::text,
    (select count(*) from dealer_kro_mapping), NULL::text, NULL::integer;

-- post_ingest_refresh keeps calling refresh_data_freshness(); that call is
-- wrapped in its own exception block, so leaving it is safe. To fully revert:
--   drop function if exists public.refresh_data_freshness();
--   drop table if exists public.data_freshness_snapshot;
-- (and re-apply the pre-010 post_ingest_refresh body, which omits the call)

commit;
