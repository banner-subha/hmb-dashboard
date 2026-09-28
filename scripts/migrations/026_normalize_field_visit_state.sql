-- ============================================================================
-- 026  One spelling per state in field_visits.
-- ============================================================================
-- field_visits carried each state several ways: the main upper-case spelling
-- ('WEST BENGAL', 173,749 rows), title case from the newer daily exports
-- ('West Bengal', 138), short or old names from older exports ('WB' 1,333,
-- 'UTTARPRADESH' 259, 'Orissa' 4), and three rows with an address typed into
-- the state field ('Subh- Labh steel, Banka\n Bihar'). Each variant showed up
-- as a separate state in the dashboard's State filters and split a state's
-- figures. 1,970 rows in all on 2026-09-28.
--
-- normalize_state_name() returns the upper-case name: whitespace collapsed,
-- known short or old names mapped, and free text reduced to the one Indian
-- state name it contains (longest match first). 'UNKNOWN', and anything with
-- no recognisable state, is returned upper-cased as it is.
--
-- A BEFORE INSERT OR UPDATE OF state trigger applies it, the same way
-- trg_normalize_district (009) does for districts, because the daily files
-- keep sending title case. The parser's ON CONFLICT upsert sees normalised
-- EXCLUDED values, so its no-op guard still skips unchanged rows.
--
-- ROLLBACK
--   DROP TRIGGER trg_normalize_state_field_visits ON public.field_visits;
--   DROP FUNCTION public.trg_normalize_state();
--   DROP FUNCTION public.normalize_state_name(text);
--   The old spellings (id, state) are in field_visits_state_backup_20260928.csv
--   in the 2026-09-28 session's scratchpad, if they are ever needed back.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_state_name(s text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
DECLARE
    v text;
    k text;
    known constant text[] := ARRAY[
        'ANDAMAN AND NICOBAR ISLANDS', 'ANDHRA PRADESH', 'ARUNACHAL PRADESH',
        'ASSAM', 'BIHAR', 'CHANDIGARH', 'CHHATTISGARH',
        'DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DELHI', 'GOA', 'GUJARAT',
        'HARYANA', 'HIMACHAL PRADESH', 'JAMMU AND KASHMIR', 'JHARKHAND',
        'KARNATAKA', 'KERALA', 'LADAKH', 'LAKSHADWEEP', 'MADHYA PRADESH',
        'MAHARASHTRA', 'MANIPUR', 'MEGHALAYA', 'MIZORAM', 'NAGALAND', 'ODISHA',
        'PUDUCHERRY', 'PUNJAB', 'RAJASTHAN', 'SIKKIM', 'TAMIL NADU',
        'TELANGANA', 'TRIPURA', 'UTTAR PRADESH', 'UTTARAKHAND', 'WEST BENGAL'
    ];
BEGIN
    IF s IS NULL THEN
        RETURN NULL;
    END IF;
    v := upper(regexp_replace(btrim(s), '\s+', ' ', 'g'));
    IF v = '' THEN
        RETURN s;
    END IF;
    v := CASE v
        WHEN 'WB' THEN 'WEST BENGAL'
        WHEN 'W.B.' THEN 'WEST BENGAL'
        WHEN 'ORISSA' THEN 'ODISHA'
        WHEN 'UTTARPRADESH' THEN 'UTTAR PRADESH'
        WHEN 'UP' THEN 'UTTAR PRADESH'
        WHEN 'U.P.' THEN 'UTTAR PRADESH'
        WHEN 'NEW DELHI' THEN 'DELHI'
        ELSE v END;
    IF v = 'UNKNOWN' OR v = ANY (known) THEN
        RETURN v;
    END IF;
    -- Free text such as an address: the longest state name it contains.
    FOR k IN SELECT x FROM unnest(known) AS x ORDER BY length(x) DESC LOOP
        IF v ~ ('(^|[^A-Z])' || k || '([^A-Z]|$)') THEN
            RETURN k;
        END IF;
    END LOOP;
    RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_normalize_state()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.state := public.normalize_state_name(NEW.state);
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_normalize_state_field_visits ON public.field_visits;
CREATE TRIGGER trg_normalize_state_field_visits
    BEFORE INSERT OR UPDATE OF state ON public.field_visits
    FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_state();

UPDATE public.field_visits
SET state = public.normalize_state_name(state)
WHERE state IS DISTINCT FROM public.normalize_state_name(state);
