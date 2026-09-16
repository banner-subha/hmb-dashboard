-- ---------------------------------------------------------------------------
-- Migration 009: Universal District Canonical Normalization & Ingestion Protection
-- Automatically intercepts any future write/ingest across all tables and standardizes
-- district names into canonical form, plus cleans all historical rows across tables.
-- ---------------------------------------------------------------------------

-- 1. Comprehensive district normalizer covering all states and regional transpositions
CREATE OR REPLACE FUNCTION public.normalize_district_key(d text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE 
    WHEN d IS NULL OR btrim(d) = '' THEN 'UNKNOWN'
    -- Medinipur / Midnapore (East & West)
    WHEN upper(d) ~ 'MEDINI.*EAST|EAST.*MEDINI|PURBA.*MEDINI|MIDNA.*EAST|EAST.*MIDNA|PURBA.*MIDNA' THEN 'MEDINIPUR EAST'
    WHEN upper(d) ~ 'MEDINI.*WEST|WEST.*MEDINI|PASCHIM.*MEDINI|MIDNA.*WEST|WEST.*MIDNA|PASCHIM.*MIDNA' THEN 'MEDINIPUR WEST'
    -- Bardhaman / Burdwan (East & West)
    WHEN upper(d) ~ 'BARDHAMAN.*EAST|EAST.*BARDHAMAN|PURBA.*BARDHAMAN|BURDWAN.*EAST|EAST.*BURDWAN|^BARDHAMAN$|^BURDWAN$' THEN 'PURBA BARDHAMAN'
    WHEN upper(d) ~ 'BARDHAMAN.*WEST|WEST.*BARDHAMAN|PASCHIM.*BARDHAMAN|BURDWAN.*WEST|WEST.*BURDWAN' THEN 'PASCHIM BARDHAMAN'
    -- 24 Parganas (North & South)
    WHEN upper(d) ~ 'NORTH.*24.*PARG|24.*PARG.*NORTH|24.*PARAG.*NORTH|NORTH.*24.*PARAG' THEN 'NORTH 24 PARGANAS'
    WHEN upper(d) ~ 'SOUTH.*24.*PARG|24.*PARG.*SOUTH|24.*PARAG.*SOUTH|SOUTH.*24.*PARAG' THEN 'SOUTH 24 PARGANAS'
    -- Dinajpur (Uttar & Dakshin)
    WHEN upper(d) ~ 'DINAJPUR.*UTTAR|UTTAR.*DINAJPUR|NORTH.*DINAJPUR' THEN 'UTTAR DINAJPUR'
    WHEN upper(d) ~ 'DINAJPUR.*DAKSHIN|DAKSHIN.*DINAJPUR|SOUTH.*DINAJPUR' THEN 'DAKSHIN DINAJPUR'
    -- Champaran (East & West)
    WHEN upper(d) ~ 'CHAMPARAN.*PURBA|PURBA.*CHAMPARAN|PURBI.*CHAMPARAN|EAST.*CHAMPARAN' THEN 'EAST CHAMPARAN'
    WHEN upper(d) ~ 'CHAMPARAN.*PASCHIM|PASCHIM.*CHAMPARAN|PASHCHIM.*CHAMPARAN|WEST.*CHAMPARAN' THEN 'WEST CHAMPARAN'
    -- Singhbhum (East & West)
    WHEN upper(d) ~ 'SINGHBH?UM.*EAST|EAST.*SINGHBH?UM|PURBI.*SINGHBH?UM' THEN 'EAST SINGHBHUM'
    WHEN upper(d) ~ 'SINGHBH?UM.*WEST|WEST.*SINGHBH?UM|PASCHIMI?.*SINGHBH?UM' THEN 'WEST SINGHBHUM'
    -- Assam / Kamrup
    WHEN upper(d) ~ 'KAMRUP.*METRO' THEN 'KAMRUP METROPOLITAN'
    -- Default clean uppercase
    ELSE upper(btrim(d))
  END;
$$;

-- 2. Trigger function for automatic on-write normalization
CREATE OR REPLACE FUNCTION public.trg_normalize_district()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.district IS NOT NULL AND btrim(NEW.district) <> '' THEN
    NEW.district := public.normalize_district_key(NEW.district);
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Install triggers on all 8 physical tables with district columns
DROP TRIGGER IF EXISTS trg_normalize_district_despatch_orders ON public.despatch_orders;
CREATE TRIGGER trg_normalize_district_despatch_orders
  BEFORE INSERT OR UPDATE OF district ON public.despatch_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

DROP TRIGGER IF EXISTS trg_normalize_district_dia_wise_despatch ON public.dia_wise_despatch;
CREATE TRIGGER trg_normalize_district_dia_wise_despatch
  BEFORE INSERT OR UPDATE OF district ON public.dia_wise_despatch
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

DROP TRIGGER IF EXISTS trg_normalize_district_do_pending ON public.do_pending;
CREATE TRIGGER trg_normalize_district_do_pending
  BEFORE INSERT OR UPDATE OF district ON public.do_pending
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

DROP TRIGGER IF EXISTS trg_normalize_district_business_plan ON public.business_plan;
CREATE TRIGGER trg_normalize_district_business_plan
  BEFORE INSERT OR UPDATE OF district ON public.business_plan
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

DROP TRIGGER IF EXISTS trg_normalize_district_dealer_targets ON public.dealer_targets;
CREATE TRIGGER trg_normalize_district_dealer_targets
  BEFORE INSERT OR UPDATE OF district ON public.dealer_targets
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

DROP TRIGGER IF EXISTS trg_normalize_district_dealer_kro_mapping ON public.dealer_kro_mapping;
CREATE TRIGGER trg_normalize_district_dealer_kro_mapping
  BEFORE INSERT OR UPDATE OF district ON public.dealer_kro_mapping
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

DROP TRIGGER IF EXISTS trg_normalize_district_district_kro_mapping ON public.district_kro_mapping;
CREATE TRIGGER trg_normalize_district_district_kro_mapping
  BEFORE INSERT OR UPDATE OF district ON public.district_kro_mapping
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

DROP TRIGGER IF EXISTS trg_normalize_district_field_visits ON public.field_visits;
CREATE TRIGGER trg_normalize_district_field_visits
  BEFORE INSERT OR UPDATE OF district ON public.field_visits
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_district();

-- 4. Clean all existing rows across all tables
UPDATE public.despatch_orders
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

UPDATE public.dia_wise_despatch
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

UPDATE public.do_pending
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

UPDATE public.business_plan
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

UPDATE public.dealer_targets
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

UPDATE public.dealer_kro_mapping
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

UPDATE public.district_kro_mapping
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

UPDATE public.field_visits
SET district = public.normalize_district_key(district)
WHERE district IS NOT NULL AND district <> public.normalize_district_key(district);

-- 5. Enhanced expand_dimension_filter with district canonical support
CREATE OR REPLACE FUNCTION public.expand_dimension_filter(p_dimension text, p_input text)
RETURNS text[]
LANGUAGE sql STABLE
AS $function$
  with q as (
    select upper(regexp_replace(coalesce(p_input,''),'[^a-zA-Z0-9]','','g')) as n,
           case when p_dimension = 'district' then public.normalize_district_key(p_input) else null end as norm_dist
  ),
  al as (
    select a.value from public.dimension_aliases a, q
    where a.dimension = p_dimension
      and upper(regexp_replace(a.alias,'[^a-zA-Z0-9]','','g')) = q.n
  ),
  seed as (
    select c.group_key
    from public.dim_catalog c, q
    where c.dimension = p_dimension and q.n <> ''
      and ( c.value = p_input
         or (q.norm_dist is not null and c.value = q.norm_dist)
         or c.value_norm = q.n
         or c.value_norm like '%'||q.n||'%'
         or c.value in (select value from al) )
  )
  select coalesce(array_agg(distinct c.value), '{}'::text[])
  from public.dim_catalog c
  where c.dimension = p_dimension
    and c.group_key in (select group_key from seed);
$function$;

-- 6. Refresh dim_catalog
REFRESH MATERIALIZED VIEW public.dim_catalog;

