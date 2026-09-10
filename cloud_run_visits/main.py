"""
HMB ISPAT — FIELD VISIT TRACKER PARSER & INTELLIGENCE AGGREGATOR
Google Cloud Run & Cloud Function Microservice (Ultra-Fast Edition)

- High-Speed Stream Parser: <1s parse time for 307,864 rows using indexed column maps
- Dropbox Metadata Delta Check: Instant 200ms response if file has not changed
- Asynchronous Mode: Returns HTTP 202 in 100ms with ?async=true for non-blocking n8n runs
- Dynamic Column Detection: Safely extracts only existing columns, resilient to cleaned data
- Pincode & Customer Geo-Enrichment: Automatically resolves empty City, District, and State
- Direct Supabase Storage Push: Uploads visits_intelligence.json to CDN
"""

try:
    import functions_framework
except ImportError:
    class functions_framework:
        @staticmethod
        def http(f):
            return f

from datetime import datetime, date, timezone, timedelta
import os
import time
import io
import csv
import re
import gzip
import json
import tempfile
import threading
import requests
from collections import defaultdict, Counter

# In-memory caches
_DROPBOX_TOKEN_CACHE = {'access_token': None, 'expires_at': 0}
_LAST_PROCESSED_METADATA = {'rev': None, 'content_hash': None, 'processed_at': None}

# ---------------------------------------------------------------------------
# Postgres sink for public.field_visits
# ---------------------------------------------------------------------------
# Until Phase 0b this service only refreshed the Storage CDN JSON. Nothing ever
# wrote to public.field_visits: the table was a one-time manual backfill
# (scratch/bulk_load_postgres.py, which TRUNCATEd and reloaded). So the
# dashboard was live while the table the chatbot queries was frozen. Wiring the
# chatbot to that table without this would have it confidently reporting stale
# figures against a dashboard showing fresh ones.
#
# Writes are best-effort by design: a DB outage must not stop the CDN upload,
# because the dashboard is the user-facing surface and it only needs the JSON.

# How far back to re-upsert on each run. The parser holds the whole CSV in
# memory anyway, but writing all ~308k rows every run is wasteful and gets
# worse as the file grows. A trailing window still catches back-dated entries,
# which is the realistic case (reps filing late).
VISITS_SQL_WINDOW_DAYS = int(os.environ.get('VISITS_SQL_WINDOW_DAYS', '45'))
VISITS_SQL_BATCH = int(os.environ.get('VISITS_SQL_BATCH', '5000'))

# ON CONFLICT infers the target from idx_field_visits_natural_key (migration
# 003), whose expressions must be repeated here verbatim. The key is the same
# tuple every historical implementation deduplicated on, so a re-run of the
# same CSV updates rows in place instead of doubling the table.
_UPSERT_FIELD_VISITS = """
    INSERT INTO public.field_visits (
        employee_name, visit_date, visit_time, visit_type, visit_person,
        customer_name, customer_type, checkin_time, report_time,
        duration_minutes, contact_person, city, state, district, pincode
    ) VALUES %s
    ON CONFLICT (upper(coalesce(employee_name, '')), visit_date,
                 upper(customer_name), checkin_time)
    DO UPDATE SET
        visit_time       = EXCLUDED.visit_time,
        visit_type       = EXCLUDED.visit_type,
        visit_person     = EXCLUDED.visit_person,
        customer_type    = EXCLUDED.customer_type,
        report_time      = EXCLUDED.report_time,
        duration_minutes = EXCLUDED.duration_minutes,
        contact_person   = EXCLUDED.contact_person,
        city             = EXCLUDED.city,
        state            = EXCLUDED.state,
        district         = EXCLUDED.district,
        pincode          = EXCLUDED.pincode
    -- Skip rows that have not actually changed. Without this the daily run
    -- rewrites every row in the window (~24.6k) whether or not anything moved,
    -- and each rewrite is a dead tuple for autovacuum to chase. Compared
    -- column-wise rather than with field_visits.* because id and created_at
    -- always differ and would make every row look changed. Row-wise
    -- IS DISTINCT FROM gets the NULL semantics right.
    WHERE (public.field_visits.visit_time, public.field_visits.visit_type,
           public.field_visits.visit_person, public.field_visits.customer_type,
           public.field_visits.report_time, public.field_visits.duration_minutes,
           public.field_visits.contact_person, public.field_visits.city,
           public.field_visits.state, public.field_visits.district,
           public.field_visits.pincode)
          IS DISTINCT FROM
          (EXCLUDED.visit_time, EXCLUDED.visit_type,
           EXCLUDED.visit_person, EXCLUDED.customer_type,
           EXCLUDED.report_time, EXCLUDED.duration_minutes,
           EXCLUDED.contact_person, EXCLUDED.city,
           EXCLUDED.state, EXCLUDED.district,
           EXCLUDED.pincode)
"""


def norm_name(s):
    """Punctuation- and case-insensitive form of a party name.

    Deliberately identical to dim_catalog.value_norm
    (upper(regexp_replace(value,'[^a-zA-Z0-9]','','g'))) so that a name
    normalised here and a name normalised in SQL collide on the same key.
    """
    return re.sub(r'[^A-Za-z0-9]', '', s or '').upper()


def load_dealer_variant_map():
    """variant_norm -> canonical_norm, from public.dimension_variant_map.

    The sales side already carries 919 dealer-to-billing-name mappings, built
    when the dealer/invoice puzzle was solved. The visit parser was matching
    dealer names by bare .upper() and ignoring all of it. Best-effort: an
    empty map degrades to plain normalised matching, which is still better
    than what came before.
    """
    dsn = os.environ.get('DATABASE_URL') or os.environ.get('HMB_DATABASE_URL')
    if not dsn:
        return {}
    try:
        import psycopg2
        with psycopg2.connect(dsn, connect_timeout=15) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select variant, canonical from public.dimension_variant_map "
                    "where dimension = 'dealer'"
                )
                return {norm_name(v): norm_name(c) for v, c in cur.fetchall()
                        if v and c}
    except Exception as err:
        print('dealer variant map unavailable, falling back to plain '
              'normalised matching:', err)
        return {}


def upsert_field_visits(rows):
    """Upsert visit rows into public.field_visits. Returns a status dict.

    Never raises: the caller's CDN upload matters more than this write.
    """
    # 'written' counts rows Postgres actually inserted or changed. With the
    # no-op guard in the ON CONFLICT clause a steady-state daily run should
    # report a small number against a much larger 'attempted' -- if the two
    # match every day, the guard is not working.
    result = {'attempted': len(rows), 'written': 0, 'ok': False, 'error': None}
    if not rows:
        result['ok'] = True
        return result

    dsn = os.environ.get('DATABASE_URL') or os.environ.get('HMB_DATABASE_URL')
    if not dsn:
        result['error'] = 'DATABASE_URL is not set; skipped Postgres write'
        print('WARNING:', result['error'])
        return result

    try:
        import psycopg2
        from psycopg2.extras import execute_values
    except ImportError as err:
        result['error'] = f'psycopg2 unavailable: {err}'
        print('WARNING:', result['error'])
        return result

    conn = None
    t_sql = time.time()
    try:
        conn = psycopg2.connect(dsn, connect_timeout=15)
        with conn:
            with conn.cursor() as cur:
                for i in range(0, len(rows), VISITS_SQL_BATCH):
                    batch = rows[i:i + VISITS_SQL_BATCH]
                    execute_values(cur, _UPSERT_FIELD_VISITS, batch,
                                   page_size=VISITS_SQL_BATCH)
                    if cur.rowcount and cur.rowcount > 0:
                        result['written'] += cur.rowcount
        result['ok'] = True
        print(f"field_visits: {result['written']:,} changed of "
              f"{result['attempted']:,} offered, in {time.time() - t_sql:.2f}s")
    except Exception as err:
        # Deliberately swallowed. Reported in the response payload so a failed
        # write is visible to n8n without taking the CDN refresh down with it.
        result['error'] = str(err)
        print('Postgres upsert error:', err)
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
    return result

# Standard Indian postal master mapping for major unmapped industrial pincodes
PINCODE_REGISTRY = {
    '700053': {'city': 'Kolkata', 'state': 'WEST BENGAL', 'district': 'KOLKATA'},
    '721115': {'city': 'Medinipur', 'state': 'WEST BENGAL', 'district': 'PASCHIM MEDINIPUR'},
    '721252': {'city': 'Chandrakona', 'state': 'WEST BENGAL', 'district': 'PASCHIM MEDINIPUR'},
    '221311': {'city': 'Gyanpur', 'state': 'UTTAR PRADESH', 'district': 'VARANASI'},
    '827008': {'city': 'Bokaro Steel City', 'state': 'JHARKHAND', 'district': 'BOKARO'},
    '785010': {'city': 'Jorhat', 'state': 'ASSAM', 'district': 'JORHAT'},
    '701659': {'city': 'Kolkata', 'state': 'WEST BENGAL', 'district': 'KOLKATA'},
    '700129': {'city': 'Barasat', 'state': 'WEST BENGAL', 'district': '24 PARAGANAS NORTH'},
    '222101': {'city': 'Jaunpur', 'state': 'UTTAR PRADESH', 'district': 'JAUNPUR'},
    '721143': {'city': 'Pingla', 'state': 'WEST BENGAL', 'district': 'PASCHIM MEDINIPUR'},
    '712136': {'city': 'Chinsurah', 'state': 'WEST BENGAL', 'district': 'HOOGHLY'},
    '700115': {'city': 'Kolkata', 'state': 'WEST BENGAL', 'district': 'KOLKATA'},
    '700055': {'city': 'Dum Dum', 'state': 'WEST BENGAL', 'district': '24 PARAGANAS NORTH'},
    '221003': {'city': 'Varanasi', 'state': 'UTTAR PRADESH', 'district': 'VARANASI'},
    '783380': {'city': 'Bongaigaon', 'state': 'ASSAM', 'district': 'BONGAIGAON'},
    '785612': {'city': 'Golaghat', 'state': 'ASSAM', 'district': 'GOLAGHAT'},
    '785601': {'city': 'Jorhat', 'state': 'ASSAM', 'district': 'JORHAT'},
    '700007': {'city': 'Kolkata', 'state': 'WEST BENGAL', 'district': 'KOLKATA'},
    '742305': {'city': 'Beldanga', 'state': 'WEST BENGAL', 'district': 'MURSHIDABAD'},
    '713146': {'city': 'Bardhaman', 'state': 'WEST BENGAL', 'district': 'PURBA BARDHAMAN'},
    '712311': {'city': 'Tarakeswar', 'state': 'WEST BENGAL', 'district': 'HOOGHLY'},
    '231001': {'city': 'Mirzapur', 'state': 'UTTAR PRADESH', 'district': 'MIRZAPUR'},
    '800009': {'city': 'Patna', 'state': 'BIHAR', 'district': 'PATNA'},
    '816104': {'city': 'Pakur', 'state': 'JHARKHAND', 'district': 'PAKUR'},
    '804404': {'city': 'Gaya', 'state': 'BIHAR', 'district': 'GAYA'},
    '700125': {'city': 'New Town', 'state': 'WEST BENGAL', 'district': '24 PARAGANAS NORTH'},
    '743235': {'city': 'Bongaon', 'state': 'WEST BENGAL', 'district': '24 PARAGANAS NORTH'},
    '721642': {'city': 'Tamluk', 'state': 'WEST BENGAL', 'district': 'MEDINIPUR EAST'},
    '274202': {'city': 'Deoria', 'state': 'UTTAR PRADESH', 'district': 'DEORIA'},
    '852130': {'city': 'Saharsa', 'state': 'BIHAR', 'district': 'SAHARSA'},
    '281301': {'city': 'Mathura', 'state': 'UTTAR PRADESH', 'district': 'MATHURA'},
    '734001': {'city': 'Siliguri', 'state': 'WEST BENGAL', 'district': 'DARJEELING'},
    '735101': {'city': 'Jalpaiguri', 'state': 'WEST BENGAL', 'district': 'JALPAIGURI'},
    '736101': {'city': 'Cooch Behar', 'state': 'WEST BENGAL', 'district': 'COOCHBEHAR'},
    '732101': {'city': 'Malda', 'state': 'WEST BENGAL', 'district': 'MALDAH'},
    '834001': {'city': 'Ranchi', 'state': 'JHARKHAND', 'district': 'RANCHI'},
    '831001': {'city': 'Jamshedpur', 'state': 'JHARKHAND', 'district': 'PURBI SINGHBHUM'},
    '781001': {'city': 'Guwahati', 'state': 'ASSAM', 'district': 'KAMRUP METROPOLITAN'},
}

def get_dropbox_access_token():
    now = time.time()
    if _DROPBOX_TOKEN_CACHE['access_token'] and _DROPBOX_TOKEN_CACHE['expires_at'] > (now + 300):
        return _DROPBOX_TOKEN_CACHE['access_token']

    app_key = os.environ.get('DROPBOX_APP_KEY', '').strip()
    app_secret = os.environ.get('DROPBOX_APP_SECRET', '').strip()
    refresh_token = os.environ.get('DROPBOX_REFRESH_TOKEN', '').strip()

    if not (app_key and app_secret and refresh_token):
        return None

    try:
        resp = requests.post('https://api.dropboxapi.com/oauth2/token', data={
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
            'client_id': app_key,
            'client_secret': app_secret
        }, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            token = data.get('access_token')
            expires_in = data.get('expires_in', 14400)
            if token:
                _DROPBOX_TOKEN_CACHE['access_token'] = token
                _DROPBOX_TOKEN_CACHE['expires_at'] = now + expires_in
                return token
    except Exception as e:
        print("Dropbox OAuth2 error:", e)
    return None

def normalize_title(s):
    if not s:
        return ''
    s = s.strip()
    if not s:
        return ''
    return ' '.join(w.capitalize() for w in s.split())

_DATE_FMTS = ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%Y/%m/%d', '%d-%b-%Y')
_DATETIME_FMTS = ('%d-%m-%Y %H:%M', '%d/%m/%Y %H:%M', '%Y-%m-%d %H:%M:%S',
                  '%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M')

def parse_date_fast(s):
    # The offset fast path assumes a zero-padded DD-MM-YYYY / YYYY-MM-DD, which
    # is what the Dropbox export emits today. It used to `return None` outright
    # when neither shape matched: no exception was raised, so the strptime
    # fallback never ran, and the caller's `if not v_date: continue` dropped the
    # row silently. '1-1-2025', '1/1/2025' and '2025/01/01' all vanished that
    # way. The fallback is now always reached.
    if not s:
        return None
    s = s.strip()
    if len(s) < 8:
        return None
    try:
        # Most common: DD-MM-YYYY or DD/MM/YYYY
        if s[2] in ('-', '/'):
            return date(int(s[6:10]), int(s[3:5]), int(s[0:2]))
        # YYYY-MM-DD or YYYY/MM/DD
        if s[4] in ('-', '/'):
            return date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
    except Exception:
        pass
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None

def parse_datetime_fast(s):
    # Same class of bug as parse_date_fast: the old `len(s) < 14` guard rejected
    # '1-1-2025 9:30' (13 chars) before any format was tried, nulling
    # checkin/report and so zeroing duration_minutes. 'D-M-YYYY H:MM' is 13.
    if not s:
        return None
    s = s.strip()
    if len(s) < 13:
        return None
    for fmt in _DATETIME_FMTS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None

def parse_time_fast(s):
    if not s or len(s) < 4:
        return None
    s = s.strip()
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            pass
    return None

def load_dashboard_dealer_master():
    try:
        url = 'https://jhsttedcvzfkszbzczak.supabase.co/storage/v1/object/public/dashboard-data/latest.json'
        resp = requests.get(url, timeout=8)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return {}

def resolve_col_index(col_map, *aliases):
    for alias in aliases:
        norm = alias.strip().lower().replace(' ', '').replace('_', '')
        if norm in col_map:
            return col_map[norm]
    return -1

def get_val(row, idx):
    if 0 <= idx < len(row):
        return row[idx].strip()
    return ''

def process_visit_data(csv_file_or_stream, push_to_postgres=None, sql_full=False):
    """
    High-Speed Ingestion & Analytics Pipeline.
    Uses indexed column arrays for sub-second parsing across 300k+ records.

    push_to_postgres  upsert into public.field_visits as well as refreshing the
                      CDN JSON. None (default) resolves from the environment
                      variable VISITS_PUSH_TO_POSTGRES, which defaults to on, so
                      the write can be disabled without a redeploy.
    sql_full          upsert every row rather than the trailing
                      VISITS_SQL_WINDOW_DAYS window. For backfills.
    """
    if push_to_postgres is None:
        push_to_postgres = os.environ.get(
            'VISITS_PUSH_TO_POSTGRES', '1'
        ).strip().lower() not in ('0', 'false', 'no', 'off')

    t0 = time.time()
    reader = csv.reader(csv_file_or_stream)
    header = next(reader, None)
    if not header:
        return {}, False

    # 1. Map column indices from header
    col_map = {str(c).strip().lower().replace(' ', '').replace('_', ''): i for i, c in enumerate(header)}

    idx_emp = resolve_col_index(col_map, 'employeename', 'employee', 'repname', 'salesrep', 'executive')
    idx_date = resolve_col_index(col_map, 'visitdate', 'date')
    idx_time = resolve_col_index(col_map, 'visittime', 'time')
    idx_type = resolve_col_index(col_map, 'visittype', 'typeofvisit')
    idx_person = resolve_col_index(col_map, 'visitperson', 'person')
    idx_cust = resolve_col_index(col_map, 'customername', 'customer', 'client', 'dealername')
    idx_cust_type = resolve_col_index(col_map, 'customertypename', 'customertype', 'type', 'category')
    idx_checkin = resolve_col_index(col_map, 'checkintime', 'checkin', 'checkin')
    idx_report = resolve_col_index(col_map, 'reporttime', 'reportin', 'report', 'checkouttime')
    idx_contact = resolve_col_index(col_map, 'contactpersonname', 'contactperson', 'contact')
    idx_city = resolve_col_index(col_map, 'city', 'cityname', 'division')
    idx_state = resolve_col_index(col_map, 'state', 'statename')
    idx_dist = resolve_col_index(col_map, 'district', 'districtname', 'dist')
    idx_pin = resolve_col_index(col_map, 'pincode', 'pin', 'postalcode', 'pincode')

    # 2. First Pass: Read rows & learn geo lookup dictionaries
    raw_parsed = []
    pin_counts = defaultdict(lambda: {'state': Counter(), 'district': Counter(), 'city': Counter()})
    cust_lookup = {}

    for row in reader:
        c_name = get_val(row, idx_cust)
        if not c_name:
            continue
        v_d_str = get_val(row, idx_date)
        if not v_d_str:
            continue

        st = get_val(row, idx_state)
        dt = get_val(row, idx_dist)
        ct = get_val(row, idx_city)
        pin = get_val(row, idx_pin).replace(' ', '')
        c_type = get_val(row, idx_cust_type).upper()

        if pin and (st or dt or ct):
            if st: pin_counts[pin]['state'][st] += 1
            if dt: pin_counts[pin]['district'][dt] += 1
            if ct: pin_counts[pin]['city'][ct] += 1

        c_upper = c_name.upper()
        if c_upper and (st or dt or pin):
            if c_upper not in cust_lookup or (not cust_lookup[c_upper].get('state') and st):
                cust_lookup[c_upper] = {
                    'state': st,
                    'district': dt,
                    'city': ct,
                    'pincode': pin,
                    'type': c_type or 'DEALER'
                }

        raw_parsed.append(row)

    total_raw_rows = len(raw_parsed)

    # Resolve pincode dictionary
    pin_lookup = {}
    for pin, data in pin_counts.items():
        s = data['state'].most_common(1)[0][0] if data['state'] else ''
        d = data['district'].most_common(1)[0][0] if data['district'] else ''
        c = data['city'].most_common(1)[0][0] if data['city'] else ''
        pin_lookup[pin] = {'state': s, 'district': d, 'city': c}

    for pin, data in PINCODE_REGISTRY.items():
        if pin not in pin_lookup or not pin_lookup[pin].get('district'):
            pin_lookup[pin] = data

    dashboard_data = load_dashboard_dealer_master()
    # Keyed on norm_name, not bare .upper(). The sales feed writes
    # "M.L.G.BUSINESS PRIVATE LIMITED" where the visit tracker may write
    # "MLG Business Pvt Ltd"; punctuation alone used to lose the match.
    dealers_pace_map = {}
    districts_pace_map = {}
    dealer_variant_map = load_dealer_variant_map()

    for d in dashboard_data.get('dealers', []):
        client_raw = (d.get('client') or '').strip()
        client = norm_name(client_raw)
        if client:
            dealers_pace_map[client] = {
                '_client': client_raw,
                'paceStatus': d.get('lossFlag') or ('AHEAD' if (d.get('cur', 0) >= d.get('prev', 0)) else 'BEHIND'),
                'cur': d.get('cur', 0),
                'prev': d.get('prev', 0),
                'dailyAvgQty': d.get('dailyAvgQty', 0),
                'currentDailyRate': d.get('currentDailyRate', 0),
                'lossDeltaPct': d.get('lossDeltaPct', 0),
                'state': d.get('state'),
                'district': d.get('district')
            }
            # cust_lookup stays keyed on the raw uppercase name: the geo
            # enrichment path looks it up with c_upper, not norm_name, and
            # keying it normalised here would silently stop those lookups
            # ever hitting.
            if client_raw.upper() not in cust_lookup:
                cust_lookup[client_raw.upper()] = {
                    'state': (d.get('state') or '').upper(),
                    'district': (d.get('district') or '').upper(),
                    'city': '',
                    'pincode': '',
                    'type': 'DEALER'
                }

    for dt in dashboard_data.get('districts', []):
        d_key = f"{norm_name(dt.get('state', ''))}||{norm_name(dt.get('district', ''))}"
        districts_pace_map[d_key] = {
            'paceStatus': dt.get('lossFlag') or ('AHEAD' if (dt.get('cur', 0) >= dt.get('prev', 0)) else 'BEHIND'),
            'cur': dt.get('cur', 0),
            'prev': dt.get('prev', 0),
            'dailyAvgQty': dt.get('dailyAvgQty', 0),
            'currentDailyRate': dt.get('currentDailyRate', 0)
        }

    # 3. Second Pass: Enrich, deduplicate, and aggregate
    clean_records = []
    seen_dedup = set()
    enriched_count = 0

    # Keyed on norm_name, not the raw spelling. The tracker carries the same
    # dealer under up to five spellings ("S S Enterprise", "S. S. ENTERPRISE",
    # "s s enterprise", ...); keying on the raw string split one dealer's
    # visits across several rows, each then classified separately.
    dealer_monthly_visits = defaultdict(lambda: defaultdict(int))
    # Same shape, but only counting visits on or before elapsed_days of each
    # month, so a partial current month can be compared like for like.
    dealer_mtd_visits = defaultdict(lambda: defaultdict(int))
    dealer_display = defaultdict(Counter)
    dealer_info = {}
    dealer_durations = defaultdict(list)
    dealer_reps = defaultdict(Counter)

    district_fab_monthly = defaultdict(lambda: defaultdict(int))
    district_fab_mtd = defaultdict(lambda: defaultdict(int))
    district_fab_unique = defaultdict(lambda: defaultdict(set))
    district_info = {}

    rep_monthly = defaultdict(lambda: defaultdict(int))
    rep_mtd = defaultdict(lambda: defaultdict(int))
    rep_dates = defaultdict(set)
    rep_custs = defaultdict(set)
    rep_dealer_visits = defaultdict(int)
    rep_fab_visits = defaultdict(int)
    rep_durations = defaultdict(list)
    rep_time_buckets = defaultdict(lambda: {'morning': 0, 'midday': 0, 'afternoon': 0})

    monthly_totals = defaultdict(lambda: {'total': 0, 'dealer': 0, 'fabricator': 0, 'other': 0})
    duration_buckets = {'under15m': 0, '15to30m': 0, '30to60m': 0, 'over60m': 0}
    hourly_distribution = Counter()

    # One pre-scan for the latest visit date in the file. parse_date_fast is
    # character slicing, so a second pass over the dates costs a fraction of a
    # second, and two things downstream need the answer before the main loop:
    #
    #   * the Postgres trailing window (collecting only in-window rows rather
    #     than collecting everything and filtering after: ~308k tuples held
    #     alongside the aggregation structures is the shape of OOM this 2 GiB
    #     container is one file-growth away from)
    #   * elapsed_days, so the current partial month can be compared against
    #     the same slice of earlier months instead of against whole ones
    max_visit_date = None
    for row in raw_parsed:
        d = parse_date_fast(get_val(row, idx_date))
        if d and (max_visit_date is None or d > max_visit_date):
            max_visit_date = d

    sql_cutoff = None
    if push_to_postgres and not sql_full and max_visit_date:
        sql_cutoff = max_visit_date - timedelta(days=VISITS_SQL_WINDOW_DAYS)
    sql_rows = []

    # How far into the current month the data actually runs. Taken from the
    # data, not from today's date: the export lags by a couple of days, and
    # comparing seven days of visits against ten days of calendar would
    # understate the current month just as badly as the full-month comparison
    # this replaces.
    elapsed_days = max_visit_date.day if max_visit_date else 31

    for row in raw_parsed:
        v_d = parse_date_fast(get_val(row, idx_date))
        if not v_d:
            continue
        c_name = get_val(row, idx_cust)
        emp = get_val(row, idx_emp)
        c_upper = c_name.upper()

        checkin_dt = parse_datetime_fast(get_val(row, idx_checkin))
        report_dt = parse_datetime_fast(get_val(row, idx_report))
        v_time = parse_time_fast(get_val(row, idx_time))

        dur = 0
        if checkin_dt and report_dt:
            diff_secs = (report_dt - checkin_dt).total_seconds()
            if 0 <= diff_secs <= 28800:
                dur = int(round(diff_secs / 60))

        # Deduplication
        dedup_key = (emp.upper(), v_d, c_upper, checkin_dt)
        if dedup_key in seen_dedup:
            continue
        seen_dedup.add(dedup_key)

        st = get_val(row, idx_state)
        dt = get_val(row, idx_dist)
        ct = get_val(row, idx_city)
        pin = get_val(row, idx_pin).replace(' ', '')
        c_type = get_val(row, idx_cust_type).upper()

        # Multi-stage geo enrichment
        if not st and not dt:
            if pin and pin in pin_lookup:
                st = pin_lookup[pin]['state']
                dt = pin_lookup[pin]['district']
                ct = pin_lookup[pin]['city']
            elif c_upper in cust_lookup:
                info = cust_lookup[c_upper]
                st = info['state']
                dt = info['district']
                ct = info['city']
                if not pin: pin = info['pincode']
                if not c_type: c_type = info['type']
            if st or dt:
                enriched_count += 1

        if not c_type:
            c_type = 'DEALER' if any(w in c_upper for w in ('STEEL', 'HARDWARE', 'TRADERS')) else 'FABRICATOR'

        state_norm = normalize_title(st)
        dist_norm = normalize_title(dt)
        m_key = f"{v_d.year:04d}-{v_d.month:02d}"
        within_mtd = v_d.day <= elapsed_days

        monthly_totals[m_key]['total'] += 1
        if c_type == 'DEALER':
            monthly_totals[m_key]['dealer'] += 1
            d_key = norm_name(c_name)
            dealer_display[d_key][c_name] += 1
            dealer_monthly_visits[d_key][m_key] += 1
            if within_mtd: dealer_mtd_visits[d_key][m_key] += 1
            dealer_info[d_key] = {'state': state_norm, 'district': dist_norm}
            if dur > 0: dealer_durations[d_key].append(dur)
            if emp: dealer_reps[d_key][emp] += 1
        elif c_type == 'FABRICATOR':
            monthly_totals[m_key]['fabricator'] += 1
            dist_key = f"{state_norm}||{dist_norm}"
            district_fab_monthly[dist_key][m_key] += 1
            if within_mtd: district_fab_mtd[dist_key][m_key] += 1
            district_fab_unique[dist_key][m_key].add(c_name)
            district_info[dist_key] = {'state': state_norm, 'district': dist_norm}
        else:
            monthly_totals[m_key]['other'] += 1

        if v_time:
            hourly_distribution[f"{v_time.hour:02d}:00"] += 1
        if dur > 0:
            if dur < 15: duration_buckets['under15m'] += 1
            elif dur <= 30: duration_buckets['15to30m'] += 1
            elif dur <= 60: duration_buckets['30to60m'] += 1
            else: duration_buckets['over60m'] += 1

        if emp:
            rep_monthly[emp][m_key] += 1
            if within_mtd: rep_mtd[emp][m_key] += 1
            rep_dates[emp].add(v_d)
            rep_custs[emp].add(c_name)
            if c_type == 'DEALER': rep_dealer_visits[emp] += 1
            elif c_type == 'FABRICATOR': rep_fab_visits[emp] += 1
            if dur > 0: rep_durations[emp].append(dur)
            if v_time:
                h = v_time.hour
                if h < 10: rep_time_buckets[emp]['morning'] += 1
                elif h < 14: rep_time_buckets[emp]['midday'] += 1
                else: rep_time_buckets[emp]['afternoon'] += 1

        clean_records.append(True)

        # Warehouse row. Column conventions follow what is already stored:
        # raw uppercase state/district with an UNKNOWN fallback, customer and
        # city left as they appear in the export. The title-cased state_norm /
        # dist_norm above are for the CDN JSON only — writing those here would
        # fork the two layers apart again.
        if push_to_postgres and (sql_cutoff is None or v_d >= sql_cutoff):
            sql_rows.append((
                emp, v_d, v_time, get_val(row, idx_type), get_val(row, idx_person),
                c_name, c_type, checkin_dt, report_dt, dur,
                get_val(row, idx_contact), ct, st or 'UNKNOWN', dt or 'UNKNOWN', pin,
            ))

    months_in_data = sorted(list(monthly_totals.keys()))
    cur_month_prefix = months_in_data[-1] if months_in_data else '2026-09'
    prev_month_prefix = months_in_data[-2] if len(months_in_data) > 1 else '2026-08'
    hist_months = [m for m in months_in_data if m < cur_month_prefix][-6:] or ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
    num_hist_months = max(1, len(hist_months))

    # 4. Build Dealers Output
    dealers_output = []
    quadrant_counts = {'GROWTH_DRIVER': 0, 'RED_FLAG': 0, 'NEGLECTED': 0,
                       'ORGANIC': 0, 'NO_SALES_LINK': 0}
    # Union of dealers seen in visits and dealers present in the sales feed.
    # Uses the sales feed's own spelling rather than k.title() of the map key,
    # which since the key became normalised would have produced names with all
    # punctuation and spacing stripped.
    all_dealers = set(dealer_info.keys()).union(dealers_pace_map.keys())

    def _lookup_pace(name):
        """Sales pace for a visit dealer name, or None if there is none.

        None is a real answer and must stay distinguishable from a dealer that
        matched and is simply behind. Three tiers, cheapest first: exact
        normalised, then the sales side's dealer variant map.
        """
        n = norm_name(name)
        hit = dealers_pace_map.get(n)
        if hit is None:
            canonical = dealer_variant_map.get(n)
            if canonical:
                hit = dealers_pace_map.get(canonical)
        return hit

    match_stats = {'matched': 0, 'unmatched': 0}

    for d_key in all_dealers:
        # Prefer the spelling the field team actually used most often; fall
        # back to the sales feed's spelling for dealers never visited.
        if dealer_display.get(d_key):
            d_name = dealer_display[d_key].most_common(1)[0][0]
        else:
            d_name = (dealers_pace_map.get(d_key, {}).get('_client')) or d_key
        cur_v = dealer_monthly_visits[d_key].get(cur_month_prefix, 0)
        prev_v = dealer_monthly_visits[d_key].get(prev_month_prefix, 0)
        hist_sum = sum(dealer_monthly_visits[d_key].get(m, 0) for m in hist_months)
        hist_avg = round(hist_sum / float(num_hist_months), 2)

        # Like-for-like average: the same day-of-month slice of each historical
        # month as the current month has so far. cur_v is a partial month and
        # hist_avg is a whole one, so comparing them made almost every dealer
        # look like it had stopped being visited until the month was nearly
        # over -- on 7 September only 85 of 846 linked dealers cleared the
        # full-month bar, so the quadrant map swung through the month and only
        # settled on the last day.
        hist_mtd_sum = sum(dealer_mtd_visits[d_key].get(m, 0) for m in hist_months)
        hist_avg_mtd = round(hist_mtd_sum / float(num_hist_months), 2)
        prev_v_mtd = dealer_mtd_visits[d_key].get(prev_month_prefix, 0)
        visit_growth = round(cur_v - hist_avg_mtd, 2)
        visit_status = 'GROWTH' if cur_v > hist_avg_mtd else 'DEGROWTH'

        # This used to read:
        #   pace_status = pace_info.get('paceStatus',
        #                               'BEHIND' if cur_v == 0 else 'AHEAD')
        # i.e. when a dealer had no sales counterpart it invented a pace from
        # the visit count alone, and that invented value then decided the
        # quadrant. Any unmatched dealer with visits became AHEAD, so it landed
        # in GROWTH_DRIVER or ORGANIC. 2,391 of 3,313 visit dealers have no
        # entry in the sales feed -- 2,178 of them have never been invoiced at
        # all and are genuinely prospects -- so most of the quadrant map was
        # built on a number nobody measured. Absent sales data is now reported
        # as absent.
        pace_info = _lookup_pace(d_key)
        sales_matched = pace_info is not None
        pace_info = pace_info or {}

        pace_status = pace_info.get('paceStatus') if sales_matched else 'UNKNOWN'
        sales_cur = pace_info.get('cur', 0)
        sales_prev = pace_info.get('prev', 0)

        is_high_visits = cur_v >= max(1, hist_avg_mtd)
        # lossFlag carries three values, not two: AHEAD, BEHIND and STABLE
        # (75 / 780 / 62 in the current sales feed). Testing == 'AHEAD' put
        # every STABLE dealer on the behind-target side of the quadrant split,
        # so 62 dealers holding their run rate were reported as failing.
        # Holding pace is meeting expectation, so it counts as not-behind.
        is_ahead_pace = pace_status in ('AHEAD', 'STABLE')

        if not sales_matched:
            # Visit behaviour is still known and still worth showing; what is
            # unknown is whether it converted. A bucket of its own rather than
            # a fifth guess.
            quadrant = 'NO_SALES_LINK'
        elif is_high_visits and is_ahead_pace: quadrant = 'GROWTH_DRIVER'
        elif is_high_visits and not is_ahead_pace: quadrant = 'RED_FLAG'
        elif not is_high_visits and not is_ahead_pace: quadrant = 'NEGLECTED'
        else: quadrant = 'ORGANIC'

        if cur_v > 0 or hist_sum > 0 or sales_cur > 0 or sales_prev > 0:
            quadrant_counts[quadrant] += 1
            # Counted here, not above: a dealer filtered out of the output
            # must not appear in the match statistics either, or the reported
            # match rate describes a population the payload does not contain.
            match_stats['matched' if sales_matched else 'unmatched'] += 1
            geo = dealer_info.get(d_key) or {'state': pace_info.get('state', 'Unknown'), 'district': pace_info.get('district', 'Unknown')}
            durs = dealer_durations.get(d_key, [])
            avg_dur = round(sum(durs) / len(durs), 1) if durs else 0
            top_rep = dealer_reps[d_key].most_common(1)[0][0] if dealer_reps[d_key] else 'Unassigned'

            dealers_output.append({
                'dealer': d_name,
                'state': normalize_title(geo.get('state', '')),
                'district': normalize_title(geo.get('district', '')),
                'curVisits': cur_v,
                'prevVisits': prev_v,
                'histAvgVisits': hist_avg,
                'histAvgVisitsMtd': hist_avg_mtd,
                'prevVisitsMtd': prev_v_mtd,
                'visitGrowth': visit_growth,
                'visitGrowthStatus': visit_status,
                'paceStatus': pace_status,
                'salesMatched': sales_matched,
                'salesCur': sales_cur,
                'salesPrev': sales_prev,
                'dailyAvgQty': pace_info.get('dailyAvgQty', 0),
                'currentDailyRate': pace_info.get('currentDailyRate', 0),
                'lossDeltaPct': pace_info.get('lossDeltaPct', 0),
                'quadrant': quadrant,
                'avgDurationMins': avg_dur,
                'primaryRep': top_rep
            })

    dealers_output.sort(key=lambda x: (x['curVisits'], x['salesCur']), reverse=True)

    # 5. Build Districts Output
    districts_output = []
    for dist_key, geo in district_info.items():
        st = geo['state']
        dt = geo['district']
        cur_fab_v = district_fab_monthly[dist_key].get(cur_month_prefix, 0)
        prev_fab_v = district_fab_monthly[dist_key].get(prev_month_prefix, 0)
        cur_fab_uniq = len(district_fab_unique[dist_key].get(cur_month_prefix, set()))
        hist_fab_sum = sum(district_fab_monthly[dist_key].get(m, 0) for m in hist_months)
        hist_fab_avg = round(hist_fab_sum / float(num_hist_months), 2)
        # Same day-of-month slice as the dealers above: ACCELERATING vs LAGGING
        # was a partial month measured against whole ones, so every district
        # read as LAGGING until late in the month.
        hist_fab_mtd_sum = sum(district_fab_mtd[dist_key].get(m, 0) for m in hist_months)
        hist_fab_avg_mtd = round(hist_fab_mtd_sum / float(num_hist_months), 2)
        fab_growth = round(cur_fab_v - hist_fab_avg_mtd, 2)
        fab_trend = 'ACCELERATING' if cur_fab_v > hist_fab_avg_mtd else 'LAGGING'

        # Districts carried the same invented-pace defect as dealers: absent
        # from the sales feed meant a pace derived from fabricator visit counts
        # alone. The feed covers 134 districts against 187 seen in the field.
        dp_info = districts_pace_map.get(f"{norm_name(st)}||{norm_name(dt)}")
        district_sales_matched = dp_info is not None
        dp_info = dp_info or {}
        d_pace = dp_info.get('paceStatus') if district_sales_matched else 'UNKNOWN'

        districts_output.append({
            'state': st,
            'district': dt,
            'curFabricatorVisits': cur_fab_v,
            'prevFabricatorVisits': prev_fab_v,
            'curUniqueFabricators': cur_fab_uniq,
            'histAvgFabricatorVisits': hist_fab_avg,
            'histAvgFabricatorVisitsMtd': hist_fab_avg_mtd,
            'fabricatorGrowth': fab_growth,
            'salesMatched': district_sales_matched,
            'fabricatorTrend': fab_trend,
            'districtPaceStatus': d_pace,
            'districtCurQty': dp_info.get('cur', 0),
            'districtDailyAvgQty': dp_info.get('dailyAvgQty', 0)
        })

    districts_output.sort(key=lambda x: x['curFabricatorVisits'], reverse=True)

    # 6. Build Reps Output
    reps_output = []
    for emp, m_counts in rep_monthly.items():
        total_v = sum(m_counts.values())
        cur_v = m_counts.get(cur_month_prefix, 0)
        prev_v = m_counts.get(prev_month_prefix, 0)
        active_days = len(rep_dates[emp])
        daily_rate = round(total_v / float(max(1, active_days)), 1)
        durs = rep_durations.get(emp, [])
        avg_dur = round(sum(durs) / len(durs), 1) if durs else 0
        tb = rep_time_buckets[emp]
        tb_total = sum(tb.values()) or 1

        reps_output.append({
            'employee_name': emp,
            'totalVisits': total_v,
            'curVisits': cur_v,
            'prevVisits': prev_v,
            # Previous month truncated to the same day-of-month the current
            # month has reached, so cur vs prev is a fair comparison.
            'prevVisitsMtd': rep_mtd[emp].get(prev_month_prefix, 0),
            'activeDays': active_days,
            'dailyVisitRate': daily_rate,
            'uniqueCustomers': len(rep_custs[emp]),
            'dealerVisits': rep_dealer_visits[emp],
            'fabricatorVisits': rep_fab_visits[emp],
            'avgDurationMins': avg_dur,
            'morningPct': round(tb['morning'] / float(tb_total) * 100, 1),
            'middayPct': round(tb['midday'] / float(tb_total) * 100, 1),
            'afternoonPct': round(tb['afternoon'] / float(tb_total) * 100, 1)
        })

    reps_output.sort(key=lambda x: x['curVisits'], reverse=True)

    # 7. Summary
    cur_total = monthly_totals[cur_month_prefix]['total']
    prev_total = monthly_totals[prev_month_prefix]['total']
    mom_visits_pct = round(((cur_total - prev_total) / float(prev_total or 1)) * 100, 1) if prev_total > 0 else 0

    all_durs = [dur for durs in dealer_durations.values() for dur in durs]
    overall_avg_duration = round(sum(all_durs) / len(all_durs), 1) if all_durs else 0

    total_dealers_visited = len([d for d in dealers_output if d['curVisits'] > 0])
    total_dealers_tracked = len(dealers_output)
    dealer_coverage_pct = round((total_dealers_visited / float(max(1, total_dealers_tracked))) * 100, 1)

    monthly_trend = [
        {
            'month': m,
            'totalVisits': monthly_totals[m]['total'],
            'dealerVisits': monthly_totals[m]['dealer'],
            'fabricatorVisits': monthly_totals[m]['fabricator'],
            'otherVisits': monthly_totals[m]['other']
        }
        for m in sorted(monthly_totals.keys())
    ]

    payload = {
        'meta': {
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'curPeriod': f"MTD {cur_month_prefix}",
            # Everything labelled *Mtd compares day 1..elapsedDays of each
            # month. Quote it wherever a current-month figure sits next to a
            # historical one.
            'elapsedDays': elapsed_days,
            'latestVisitDate': max_visit_date.isoformat() if max_visit_date else None,
            'prevPeriod': f"MTD {prev_month_prefix}",
            'totalRecordsProcessed': len(clean_records),
            'geoEnrichedRecords': enriched_count,
            # Quote this when quoting anything derived from paceStatus or
            # quadrant: it is the share of dealers for which those fields mean
            # anything at all.
            'salesLink': {
                'matched': match_stats['matched'],
                'unmatched': match_stats['unmatched'],
                'matchPct': round(
                    match_stats['matched'] * 100.0
                    / max(1, match_stats['matched'] + match_stats['unmatched']), 1),
                'variantMapEntries': len(dealer_variant_map),
                'salesFeedDealers': len(dealers_pace_map),
            },
            'rawRecords': total_raw_rows,
            'parseDurationSeconds': round(time.time() - t0, 2)
        },
        'summary': {
            'curTotalVisits': cur_total,
            'prevTotalVisits': prev_total,
            'momVisitsPct': mom_visits_pct,
            'curDealerVisits': monthly_totals[cur_month_prefix]['dealer'],
            'curFabricatorVisits': monthly_totals[cur_month_prefix]['fabricator'],
            'activeDealersVisited': total_dealers_visited,
            'totalDealersTracked': total_dealers_tracked,
            'dealerCoveragePct': dealer_coverage_pct,
            'avgVisitDurationMins': overall_avg_duration,
            'activeFieldReps': len(reps_output),
            'growthDriversCount': quadrant_counts['GROWTH_DRIVER'],
            'redFlagsCount': quadrant_counts['RED_FLAG'],
            'neglectedCount': quadrant_counts['NEGLECTED'],
            'organicChampionsCount': quadrant_counts['ORGANIC'],
            # Dealers seen in the field with no counterpart in the sales feed.
            # Their visit behaviour is real; whether it converted is unknown.
            'noSalesLinkCount': quadrant_counts['NO_SALES_LINK'],
            'salesLinkedDealers': match_stats['matched'],
            'salesLinkMatchPct': round(
                match_stats['matched'] * 100.0
                / max(1, match_stats['matched'] + match_stats['unmatched']), 1)
        },
        'dealers': dealers_output,
        'districts': districts_output,
        'employees': reps_output,
        'timeAnalytics': {
            'hourlyDistribution': dict(sorted(hourly_distribution.items())),
            'durationBuckets': duration_buckets
        },
        'monthlyTrend': monthly_trend
    }

    # Warehouse write first, so its outcome can be reported in the payload that
    # goes to the CDN and back to n8n. Best-effort: upsert_field_visits never
    # raises, so a DB problem degrades to a stale table rather than a failed run.
    sql_result = {'attempted': 0, 'written': 0, 'ok': True, 'error': None,
                  'skipped': True}
    if push_to_postgres:
        sql_result = upsert_field_visits(sql_rows)
        sql_result['skipped'] = False
        sql_result['window_days'] = None if sql_full else VISITS_SQL_WINDOW_DAYS
        sql_result['cutoff'] = sql_cutoff.isoformat() if sql_cutoff else None
    payload['meta']['postgres'] = sql_result

    # Upload to Supabase Storage
    json_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    # No literal fallback. Cloud Run injects SUPABASE_SERVICE_ROLE_KEY from
    # Secret Manager (hmb_supabase_service_role_key); a baked-in service_role
    # JWT would be a full-write credential sitting in the image and in git.
    supabase_key = (
        os.environ.get('SUPABASE_STORAGE_KEY')
        or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    )
    storage_uploaded = False
    if not supabase_key:
        # Loud, not silent: without this the CDN quietly serves yesterday's file
        # while the parse looks like it succeeded.
        print(
            "ERROR: neither SUPABASE_STORAGE_KEY nor SUPABASE_SERVICE_ROLE_KEY "
            "is set; visits_intelligence.json was NOT uploaded."
        )
    if supabase_key:
        try:
            storage_url = 'https://jhsttedcvzfkszbzczak.supabase.co/storage/v1/object/dashboard-data/visits_intelligence.json'
            headers = {
                'Authorization': f'Bearer {supabase_key}',
                'apikey': supabase_key,
                'Content-Type': 'application/json'
            }
            up_resp = requests.put(storage_url, headers=headers, data=json_bytes, timeout=25)
            if up_resp.status_code in (200, 201):
                storage_uploaded = True
                print(f"Pushed visits_intelligence.json ({len(json_bytes)/1024:.1f} KB) in {time.time() - t0:.2f}s!")
        except Exception as up_err:
            print("Supabase Storage upload error:", up_err)

    return payload, storage_uploaded

def run_ingestion_background(csv_bytes, rev=None, sql_full=False):
    """Worker function for async mode"""
    try:
        csv_stream = io.StringIO(csv_bytes.decode('utf-8-sig', errors='replace'))
        payload, ok = process_visit_data(csv_stream, sql_full=sql_full)
        if ok and rev:
            _LAST_PROCESSED_METADATA['rev'] = rev
            _LAST_PROCESSED_METADATA['processed_at'] = datetime.now(timezone.utc).isoformat()
    except Exception as err:
        print("Background ingestion exception:", err)

@functions_framework.http
def parse_visits_cloud_function(request):
    """
    Google Cloud Run HTTP endpoint.
    Ultra-Fast, Delta-Aware, Non-blocking Ingestion Microservice.
    """
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, HEAD',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept-Encoding',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    if request.path in ('/ping', '/health') or request.args.get('ping') == 'true':
        return ({
            'status': 'ok',
            'service': 'visit-tracker-parser',
            'timestamp': datetime.now(timezone.utc).isoformat()
        }, 200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})

    is_force = request.args.get('force') == 'true'
    is_async = request.args.get('async') == 'true'
    # ?full=true upserts every row in the CSV rather than the trailing
    # VISITS_SQL_WINDOW_DAYS window. For rebuilding field_visits from scratch;
    # the scheduled run should never need it.
    sql_full = request.args.get('full') == 'true'
    req_json = {}
    if request.is_json:
        req_json = request.get_json(silent=True) or {}
        if req_json.get('force'): is_force = True
        if req_json.get('async'): is_async = True
        if req_json.get('full'): sql_full = True

    file_bytes = None
    dbx_rev = None

    # 1. Direct CSV in POST body
    if request.data and len(request.data) > 1000 and not request.is_json:
        file_bytes = request.data

    # 2. Dropbox fetch with metadata delta check
    if not file_bytes:
        token = get_dropbox_access_token()
        if token:
            dbx_path = req_json.get('file_path') or os.environ.get('DROPBOX_VISITS_PATH', '/OFFICE HO/BI DATA/SALES DASHBOARD/VISIT_TRACKER_SEPT.csv')
            
            # Check metadata first for delta skipping (takes <150ms)
            if not is_force:
                try:
                    meta_resp = requests.post(
                        'https://api.dropboxapi.com/2/files/get_metadata',
                        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                        json={'path': dbx_path},
                        timeout=5
                    )
                    if meta_resp.status_code == 200:
                        meta_data = meta_resp.json()
                        dbx_rev = meta_data.get('rev')
                        if dbx_rev and dbx_rev == _LAST_PROCESSED_METADATA.get('rev'):
                            # File is unchanged! Return instant 200ms response!
                            return ({
                                'ok': True,
                                'status': 'up_to_date',
                                'message': 'Visit tracker file unchanged in Dropbox. Storage CDN is already fresh.',
                                'rev': dbx_rev,
                                'storage_url': 'https://jhsttedcvzfkszbzczak.supabase.co/storage/v1/object/public/dashboard-data/visits_intelligence.json',
                                'timestamp': datetime.now(timezone.utc).isoformat()
                            }, 200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})
                except Exception as meta_err:
                    print("Metadata check error:", meta_err)

            # Download file from Dropbox
            try:
                print(f"Downloading {dbx_path} from Dropbox...")
                resp = requests.post(
                    'https://content.dropboxapi.com/2/files/download',
                    headers={'Authorization': f'Bearer {token}', 'Dropbox-API-Arg': json.dumps({'path': dbx_path})},
                    timeout=90
                )
                if resp.status_code == 200:
                    file_bytes = resp.content
                    if not dbx_rev:
                        arg = resp.headers.get('Dropbox-Api-Result')
                        if arg:
                            try: dbx_rev = json.loads(arg).get('rev')
                            except Exception: pass
                    print(f"Downloaded {len(file_bytes)/1024/1024:.2f} MB from Dropbox.")
            except Exception as d_err:
                print("Dropbox download error:", d_err)

    # 3. Local fallback
    if not file_bytes and os.path.exists('VISIT_TRACKER_SEPT.csv'):
        with open('VISIT_TRACKER_SEPT.csv', 'rb') as f:
            file_bytes = f.read()

    if not file_bytes:
        return ({
            'ok': False,
            'error': 'No CSV file content received from HTTP body, Dropbox, or local storage.'
        }, 400, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})

    # 4. If async mode requested, spawn background thread and return HTTP 202 immediately
    if is_async:
        thread = threading.Thread(target=run_ingestion_background,
                                  args=(file_bytes, dbx_rev, sql_full))
        thread.daemon = True
        thread.start()
        return ({
            'ok': True,
            'status': 'processing_started',
            'message': 'Visit intelligence ingestion running in background thread.',
            'timestamp': datetime.now(timezone.utc).isoformat()
        }, 202, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})

    # 5. Synchronous fast execution (<4s)
    csv_stream = io.StringIO(file_bytes.decode('utf-8-sig', errors='replace'))
    payload, storage_ok = process_visit_data(csv_stream, sql_full=sql_full)

    if storage_ok and dbx_rev:
        _LAST_PROCESSED_METADATA['rev'] = dbx_rev
        _LAST_PROCESSED_METADATA['processed_at'] = datetime.now(timezone.utc).isoformat()

    response_data = {
        'ok': True,
        'status': 'success',
        'uploaded_to_storage': storage_ok,
        'storage_url': 'https://jhsttedcvzfkszbzczak.supabase.co/storage/v1/object/public/dashboard-data/visits_intelligence.json',
        'records_processed': payload['meta']['totalRecordsProcessed'],
        'geo_enriched_records': payload['meta']['geoEnrichedRecords'],
        'parse_duration_seconds': payload['meta']['parseDurationSeconds'],
        'dealers_tracked': len(payload['dealers']),
        'districts_tracked': len(payload['districts']),
        'field_reps_tracked': len(payload['employees']),
        'postgres': payload['meta'].get('postgres'),
        'summary': payload['summary'],
        'timestamp': datetime.now(timezone.utc).isoformat()
    }

    return (response_data, 200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})

if __name__ == '__main__':
    local_csv = 'VISIT_TRACKER_SEPT.csv'
    if os.path.exists(local_csv):
        with open(local_csv, 'r', encoding='utf-8-sig', errors='replace') as f:
            process_visit_data(f, push_to_postgres=False)  # local dry run
