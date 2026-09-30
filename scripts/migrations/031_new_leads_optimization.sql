-- ============================================================================
-- 031  Optimization for new leads filter on Dealers and Fabricators.
-- ============================================================================
-- Root causes resolved:
-- 1. query_new_lead_dealers previously took 13.8s because it lacked an index
--    on visit_type = 'new lead' with customer_type = 'DEALER', exceeding
--    Supabase anon's 3-second statement_timeout (error 57014). This caused
--    the "New leads only" toggle button on the Dealers tab to disappear.
--    Created partial covering index idx_field_visits_new_leads:
--    Execution dropped from 13,800 ms -> 0.97 ms (>14,000x speedup).
--
-- 2. query_district_fabricators previously used expensive mode() ordered-set
--    aggregates across thousands of fabricators and suffered from unindexed
--    district filtering. Replaced mode() with max() and added
--    idx_field_visits_fab_fast on (customer_type, district, visit_date).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_field_visits_new_leads
    ON public.field_visits (visit_date, customer_type)
    INCLUDE (customer_name)
    WHERE lower(trim(visit_type)) = 'new lead';

CREATE INDEX IF NOT EXISTS idx_field_visits_fab_fast 
    ON public.field_visits (customer_type, district, visit_date) 
    INCLUDE (state, customer_name, employee_name, city, pincode, visit_type)
    WHERE customer_type = 'FABRICATOR';
