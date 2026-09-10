"""
HMB ISPAT — FIELD VISIT TRACKER PARSER & INTELLIGENCE AGGREGATOR
Google Cloud Function & Standalone Cloud Run Ingestion Microservice

Fetches VISIT_TRACKER_SEPT.csv (from Dropbox OAuth2, HTTP POST body, or local fallback),
dynamically extracts existing column headers safely (resilient to removed/renamed columns),
enriches empty city, district, and state using Pincodes and Customer directories,
bulk-upserts records into Supabase Postgres (Sales DB for Chatbot RPCs),
and pushes pre-aggregated visits_intelligence.json to Supabase Storage for the HMB Dashboard Tab.
"""

try:
    import functions_framework
except ImportError:
    class functions_framework:
        @staticmethod
        def http(f):
            return f

from datetime import datetime, date, timezone
import os
import time
import io
import csv
import gzip
import json
import requests
from collections import defaultdict, Counter

# In-memory Dropbox OAuth2 token cache
_DROPBOX_TOKEN_CACHE = {
    'access_token': None,
    'expires_at': 0
}

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
}

def get_row_val(row, *aliases):
    """
    Case-insensitive, space-insensitive, underscore-insensitive column extractor.
    Safely retrieves values only from currently existing columns, even if
    unneeded columns were removed during data cleaning.
    """
    norm_row = {str(k).strip().lower().replace(' ', '').replace('_', ''): v for k, v in row.items() if k}
    for alias in aliases:
        norm_alias = alias.strip().lower().replace(' ', '').replace('_', '')
        if norm_alias in norm_row and norm_row[norm_alias] is not None:
            return str(norm_row[norm_alias]).strip()
    return ''

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
    except Exception:
        pass
    return None

def normalize_title(s):
    if not s:
        return ''
    s = s.strip()
    if not s:
        return ''
    return ' '.join(word.capitalize() for word in s.split())

def parse_date_str(d_str):
    if not d_str:
        return None
    s = str(d_str).strip()
    for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%Y/%m/%d'):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None

def parse_datetime_str(dt_str):
    if not dt_str:
        return None
    s = str(dt_str).strip()
    for fmt in ('%d-%m-%Y %H:%M', '%d/%m/%Y %H:%M', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y %H:%M:%S'):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None

def parse_time_str(t_str):
    if not t_str:
        return None
    s = str(t_str).strip()
    for fmt in ('%H:%M:%S', '%H:%M'):
        try:
            return datetime.strptime(s, fmt).time()
        except ValueError:
            pass
    return None

def build_pincode_and_customer_dictionaries(rows):
    """
    Learns pincode and customer geo dictionaries from complete rows in the dataset.
    """
    pin_dict = defaultdict(lambda: {'state': Counter(), 'district': Counter(), 'city': Counter()})
    cust_dict = {}

    for r in rows:
        pin = get_row_val(r, 'Pincode', 'pin', 'postal_code', 'pin_code').replace(' ', '')
        state = get_row_val(r, 'State', 'state_name')
        dist = get_row_val(r, 'District', 'district_name', 'dist')
        city = get_row_val(r, 'City', 'city_name', 'division')
        c_name = get_row_val(r, 'Customer_name', 'customer', 'client', 'dealer_name').upper()
        c_type = get_row_val(r, 'Customer_type_name', 'customer_type', 'type', 'category').upper()

        if pin and (state or dist or city):
            if state: pin_dict[pin]['state'][state] += 1
            if dist: pin_dict[pin]['district'][dist] += 1
            if city: pin_dict[pin]['city'][city] += 1

        if c_name and (state or dist or pin):
            if c_name not in cust_dict or (not cust_dict[c_name].get('state') and state):
                cust_dict[c_name] = {
                    'state': state,
                    'district': dist,
                    'city': city,
                    'pincode': pin,
                    'type': c_type or 'DEALER'
                }

    resolved_pins = {}
    for pin, data in pin_dict.items():
        st = data['state'].most_common(1)[0][0] if data['state'] else ''
        dt = data['district'].most_common(1)[0][0] if data['district'] else ''
        ct = data['city'].most_common(1)[0][0] if data['city'] else ''
        resolved_pins[pin] = {'state': st, 'district': dt, 'city': ct}

    # Overlay static registry for major industrial hubs
    for pin, data in PINCODE_REGISTRY.items():
        if pin not in resolved_pins or not resolved_pins[pin].get('district'):
            resolved_pins[pin] = data

    return resolved_pins, cust_dict

def load_dashboard_dealer_master():
    """
    Loads known dealers and their current pace indicators from latest.json.
    """
    try:
        url = 'https://jhsttedcvzfkszbzczak.supabase.co/storage/v1/object/public/dashboard-data/latest.json'
        resp = requests.get(url, timeout=8)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    
    local_path = 'latest.json'
    if os.path.exists(local_path):
        try:
            with open(local_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def process_visit_data(csv_file_or_stream, push_to_postgres=True):
    """
    Main ingestion and analytics pipeline.
    Parses, cleans, enriches, computes correlations, and outputs visits_intelligence.json.
    """
    print("Starting Visit Tracker ingestion pipeline...")
    reader = csv.DictReader(csv_file_or_stream)
    raw_rows = list(reader)
    total_raw_rows = len(raw_rows)
    print(f"Loaded {total_raw_rows} raw records.")

    # 1. Build resolution dictionaries
    pin_lookup, cust_lookup = build_pincode_and_customer_dictionaries(raw_rows)
    dashboard_data = load_dashboard_dealer_master()
    dealers_pace_map = {}
    districts_pace_map = {}

    for d in dashboard_data.get('dealers', []):
        client = (d.get('client') or '').strip().upper()
        if client:
            dealers_pace_map[client] = {
                'paceStatus': d.get('lossFlag') or ('AHEAD' if (d.get('cur', 0) >= d.get('prev', 0)) else 'BEHIND'),
                'cur': d.get('cur', 0),
                'prev': d.get('prev', 0),
                'dailyAvgQty': d.get('dailyAvgQty', 0),
                'currentDailyRate': d.get('currentDailyRate', 0),
                'lossDeltaPct': d.get('lossDeltaPct', 0),
                'state': d.get('state'),
                'district': d.get('district')
            }
            if client not in cust_lookup:
                cust_lookup[client] = {
                    'state': d.get('state', '').upper(),
                    'district': d.get('district', '').upper(),
                    'city': '',
                    'pincode': '',
                    'type': 'DEALER'
                }

    for dt in dashboard_data.get('districts', []):
        d_key = f"{dt.get('state', '').upper()}||{dt.get('district', '').upper()}"
        districts_pace_map[d_key] = {
            'paceStatus': dt.get('lossFlag') or ('AHEAD' if (dt.get('cur', 0) >= dt.get('prev', 0)) else 'BEHIND'),
            'cur': dt.get('cur', 0),
            'prev': dt.get('prev', 0),
            'dailyAvgQty': dt.get('dailyAvgQty', 0),
            'currentDailyRate': dt.get('currentDailyRate', 0)
        }

    # 2. Clean, deduplicate, and enrich rows
    clean_records = []
    seen_dedup = set()
    enriched_count = 0

    for r in raw_rows:
        emp = get_row_val(r, 'Employee_name', 'employee', 'rep_name', 'sales_rep')
        v_date = parse_date_str(get_row_val(r, 'visit_date', 'date'))
        if not v_date:
            continue

        c_name = get_row_val(r, 'Customer_name', 'customer', 'client', 'dealer_name')
        if not c_name:
            continue

        c_type = get_row_val(r, 'Customer_type_name', 'customer_type', 'type', 'category').upper()
        v_person = get_row_val(r, 'Visit_person', 'person')
        contact = get_row_val(r, 'Contact_person_name', 'contact_person', 'contact')
        v_type = get_row_val(r, 'Visit_type', 'type_of_visit')
        v_time = parse_time_str(get_row_val(r, 'Visit_time', 'time'))
        checkin_dt = parse_datetime_str(get_row_val(r, 'Checkin_time', 'checkin', 'check_in'))
        report_dt = parse_datetime_str(get_row_val(r, 'Report_time', 'report_in', 'report'))

        duration_mins = 0
        if checkin_dt and report_dt:
            diff_secs = (report_dt - checkin_dt).total_seconds()
            if 0 <= diff_secs <= 28800: # up to 8 hours
                duration_mins = int(round(diff_secs / 60))

        pin = get_row_val(r, 'Pincode', 'pin', 'postal_code', 'pin_code').replace(' ', '')
        state = get_row_val(r, 'State', 'state_name')
        dist = get_row_val(r, 'District', 'district_name', 'dist')
        city = get_row_val(r, 'City', 'city_name', 'division')

        # Multi-stage geo enrichment: fill empty city, district, state using pincode
        was_empty = not state and not dist
        if was_empty:
            # Stage 1 & 2: Pincode lookup
            if pin and pin in pin_lookup:
                state = pin_lookup[pin]['state']
                dist = pin_lookup[pin]['district']
                city = pin_lookup[pin]['city']
            # Stage 3: Customer match
            elif c_name.upper() in cust_lookup:
                info = cust_lookup[c_name.upper()]
                state = info['state']
                dist = info['district']
                city = info['city']
                if not pin:
                    pin = info['pincode']
                if not c_type:
                    c_type = info['type']

            if state or dist:
                enriched_count += 1

        if not c_type:
            c_type = 'DEALER' if any(w in c_name.upper() for w in ('STEEL', 'HARDWARE', 'TRADERS')) else 'FABRICATOR'

        # Deduplication key
        dedup_key = (emp.upper(), v_date, c_name.upper(), checkin_dt)
        if dedup_key in seen_dedup:
            continue
        seen_dedup.add(dedup_key)

        clean_records.append({
            'employee_name': emp,
            'visit_date': v_date,
            'visit_time': v_time,
            'visit_type': v_type,
            'visit_person': v_person,
            'customer_name': c_name,
            'customer_type': c_type,
            'checkin_time': checkin_dt,
            'report_time': report_dt,
            'duration_minutes': duration_mins,
            'contact_person': contact,
            'city': city,
            'state': state or 'UNKNOWN',
            'district': dist or 'UNKNOWN',
            'pincode': pin
        })

    print(f"Clean unique records: {len(clean_records)} (Enriched geo on {enriched_count} rows)")

    # 3. Aggregations for Dashboard Tab
    cur_month_prefix = '2026-09'
    prev_month_prefix = '2026-08'

    dealer_monthly_visits = defaultdict(lambda: defaultdict(int))
    dealer_info = {}
    dealer_durations = defaultdict(list)
    dealer_reps = defaultdict(Counter)

    district_fab_monthly = defaultdict(lambda: defaultdict(int))
    district_fab_unique = defaultdict(lambda: defaultdict(set))
    district_info = {}

    rep_monthly = defaultdict(lambda: defaultdict(int))
    rep_dates = defaultdict(set)
    rep_custs = defaultdict(set)
    rep_dealer_visits = defaultdict(int)
    rep_fab_visits = defaultdict(int)
    rep_durations = defaultdict(list)
    rep_time_buckets = defaultdict(lambda: {'morning': 0, 'midday': 0, 'afternoon': 0})

    monthly_totals = defaultdict(lambda: {'total': 0, 'dealer': 0, 'fabricator': 0, 'other': 0})
    duration_buckets = {'under15m': 0, '15to30m': 0, '30to60m': 0, 'over60m': 0}
    hourly_distribution = Counter()

    for r in clean_records:
        v_d = r['visit_date']
        m_key = f"{v_d.year:04d}-{v_d.month:02d}"
        c_name = r['customer_name']
        c_type = r['customer_type']
        state = normalize_title(r['state'])
        dist = normalize_title(r['district'])
        emp = r['employee_name']
        dur = r['duration_minutes']
        v_time = r['visit_time']

        monthly_totals[m_key]['total'] += 1
        if c_type == 'DEALER':
            monthly_totals[m_key]['dealer'] += 1
        elif c_type == 'FABRICATOR':
            monthly_totals[m_key]['fabricator'] += 1
        else:
            monthly_totals[m_key]['other'] += 1

        if v_time:
            hourly_distribution[f"{v_time.hour:02d}:00"] += 1
        if dur > 0:
            if dur < 15: duration_buckets['under15m'] += 1
            elif dur <= 30: duration_buckets['15to30m'] += 1
            elif dur <= 60: duration_buckets['30to60m'] += 1
            else: duration_buckets['over60m'] += 1

        if c_type == 'DEALER':
            dealer_monthly_visits[c_name][m_key] += 1
            dealer_info[c_name] = {'state': state, 'district': dist}
            if dur > 0:
                dealer_durations[c_name].append(dur)
            if emp:
                dealer_reps[c_name][emp] += 1

        if c_type == 'FABRICATOR':
            dist_key = f"{state}||{dist}"
            district_fab_monthly[dist_key][m_key] += 1
            district_fab_unique[dist_key][m_key].add(c_name)
            district_info[dist_key] = {'state': state, 'district': dist}

        if emp:
            rep_monthly[emp][m_key] += 1
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

    hist_months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
    num_hist_months = len(hist_months)

    # 4. Build Dealers Rollup with Business-Friendly Quadrants
    dealers_output = []
    quadrant_counts = {'GROWTH_DRIVER': 0, 'RED_FLAG': 0, 'NEGLECTED': 0, 'ORGANIC': 0}

    all_dealers = set(dealer_info.keys()).union(set(k.title() for k in dealers_pace_map.keys()))
    for d_name in all_dealers:
        d_upper = d_name.upper()
        cur_v = dealer_monthly_visits[d_name].get(cur_month_prefix, 0)
        prev_v = dealer_monthly_visits[d_name].get(prev_month_prefix, 0)
        
        hist_sum = sum(dealer_monthly_visits[d_name].get(m, 0) for m in hist_months)
        hist_avg = round(hist_sum / float(num_hist_months), 2)
        visit_growth = round(cur_v - hist_avg, 2)
        visit_status = 'GROWTH' if cur_v > hist_avg else 'DEGROWTH'

        pace_info = dealers_pace_map.get(d_upper, {})
        pace_status = pace_info.get('paceStatus', 'BEHIND' if cur_v == 0 else 'AHEAD')
        sales_cur = pace_info.get('cur', 0)
        sales_prev = pace_info.get('prev', 0)
        daily_avg = pace_info.get('dailyAvgQty', 0)
        cur_rate = pace_info.get('currentDailyRate', 0)
        loss_pct = pace_info.get('lossDeltaPct', 0)

        is_high_visits = cur_v >= max(1, hist_avg)
        is_ahead_pace = (pace_status == 'AHEAD')

        if is_high_visits and is_ahead_pace:
            quadrant = 'GROWTH_DRIVER'      # High Growth Accounts (Ahead of Pace, High Visits)
        elif is_high_visits and not is_ahead_pace:
            quadrant = 'RED_FLAG'           # High Attention, Behind Target
        elif not is_high_visits and not is_ahead_pace:
            quadrant = 'NEGLECTED'          # Under-Visited Accounts
        else:
            quadrant = 'ORGANIC'            # Steady Growth Accounts

        if cur_v > 0 or hist_sum > 0 or sales_cur > 0 or sales_prev > 0:
            quadrant_counts[quadrant] += 1
            geo = dealer_info.get(d_name) or {'state': pace_info.get('state', 'Unknown'), 'district': pace_info.get('district', 'Unknown')}
            durs = dealer_durations.get(d_name, [])
            avg_dur = round(sum(durs) / len(durs), 1) if durs else 0
            top_rep = dealer_reps[d_name].most_common(1)[0][0] if dealer_reps[d_name] else 'Unassigned'

            dealers_output.append({
                'dealer': d_name,
                'state': normalize_title(geo.get('state', '')),
                'district': normalize_title(geo.get('district', '')),
                'curVisits': cur_v,
                'prevVisits': prev_v,
                'histAvgVisits': hist_avg,
                'visitGrowth': visit_growth,
                'visitGrowthStatus': visit_status,
                'paceStatus': pace_status,
                'salesCur': sales_cur,
                'salesPrev': sales_prev,
                'dailyAvgQty': daily_avg,
                'currentDailyRate': cur_rate,
                'lossDeltaPct': loss_pct,
                'quadrant': quadrant,
                'avgDurationMins': avg_dur,
                'primaryRep': top_rep
            })

    dealers_output.sort(key=lambda x: (x['curVisits'], x['salesCur']), reverse=True)

    # 5. Build Districts Fabricator Rollup
    districts_output = []
    for dist_key, geo in district_info.items():
        st = geo['state']
        dt = geo['district']
        cur_fab_v = district_fab_monthly[dist_key].get(cur_month_prefix, 0)
        prev_fab_v = district_fab_monthly[dist_key].get(prev_month_prefix, 0)
        cur_fab_uniq = len(district_fab_unique[dist_key].get(cur_month_prefix, set()))

        hist_fab_sum = sum(district_fab_monthly[dist_key].get(m, 0) for m in hist_months)
        hist_fab_avg = round(hist_fab_sum / float(num_hist_months), 2)
        fab_growth = round(cur_fab_v - hist_fab_avg, 2)
        fab_trend = 'ACCELERATING' if cur_fab_v > hist_fab_avg else 'LAGGING'

        dp_info = districts_pace_map.get(f"{st.upper()}||{dt.upper()}", {})
        d_pace = dp_info.get('paceStatus', 'AHEAD' if cur_fab_v >= prev_fab_v else 'BEHIND')

        districts_output.append({
            'state': st,
            'district': dt,
            'curFabricatorVisits': cur_fab_v,
            'prevFabricatorVisits': prev_fab_v,
            'curUniqueFabricators': cur_fab_uniq,
            'histAvgFabricatorVisits': hist_fab_avg,
            'fabricatorGrowth': fab_growth,
            'fabricatorTrend': fab_trend,
            'districtPaceStatus': d_pace,
            'districtCurQty': dp_info.get('cur', 0),
            'districtDailyAvgQty': dp_info.get('dailyAvgQty', 0)
        })

    districts_output.sort(key=lambda x: x['curFabricatorVisits'], reverse=True)

    # 6. Build Field Rep Productivity Rollup
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

    # 7. Overall Executive Summary
    cur_total = monthly_totals[cur_month_prefix]['total']
    prev_total = monthly_totals[prev_month_prefix]['total']
    mom_visits_pct = round(((cur_total - prev_total) / float(prev_total or 1)) * 100, 1) if prev_total > 0 else 0

    all_durs = [r['duration_minutes'] for r in clean_records if r['duration_minutes'] > 0]
    overall_avg_duration = round(sum(all_durs) / len(all_durs), 1) if all_durs else 0

    total_dealers_visited = len([d for d in dealers_output if d['curVisits'] > 0])
    total_dealers_tracked = len(dealers_output)
    dealer_coverage_pct = round((total_dealers_visited / float(max(1, total_dealers_tracked))) * 100, 1)

    monthly_trend = []
    for m in sorted(monthly_totals.keys()):
        monthly_trend.append({
            'month': m,
            'totalVisits': monthly_totals[m]['total'],
            'dealerVisits': monthly_totals[m]['dealer'],
            'fabricatorVisits': monthly_totals[m]['fabricator'],
            'otherVisits': monthly_totals[m]['other']
        })

    payload = {
        'meta': {
            'generatedAt': datetime.now(timezone.utc).isoformat(),
            'curPeriod': '1 Sep 2026 - 7 Sep 2026',
            'prevPeriod': '1 Aug 2026 - 7 Aug 2026',
            'totalRecordsProcessed': len(clean_records),
            'geoEnrichedRecords': enriched_count,
            'rawRecords': total_raw_rows
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
            'uniqueFabricatorsVisited': len(set(clean_records[i]['customer_name'] for i in range(len(clean_records)) if clean_records[i]['customer_type'] == 'FABRICATOR' and clean_records[i]['visit_date'].month == 9)),
            'avgVisitDurationMins': overall_avg_duration,
            'activeFieldReps': len(reps_output),
            'quadrants': quadrant_counts,
            'growthDriversCount': quadrant_counts['GROWTH_DRIVER'],
            'redFlagsCount': quadrant_counts['RED_FLAG'],
            'neglectedCount': quadrant_counts['NEGLECTED'],
            'organicChampionsCount': quadrant_counts['ORGANIC']
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

    # Write output to public/visits_intelligence.json
    os.makedirs('public', exist_ok=True)
    out_file = os.path.join('public', 'visits_intelligence.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))
    print(f"Exported aggregated intelligence to {out_file} ({os.path.getsize(out_file) / 1024:.1f} KB)")

    # Upload directly to Supabase Storage if service key is available
    # Literal service_role JWT removed before this file entered git (Phase 0a).
    # Deprecated code path; kept only for reference. See README.md.
    supabase_key = os.environ.get('SUPABASE_STORAGE_KEY')
    if supabase_key:
        try:
            storage_url = 'https://jhsttedcvzfkszbzczak.supabase.co/storage/v1/object/dashboard-data/visits_intelligence.json'
            headers = {
                'Authorization': f'Bearer {supabase_key}',
                'apikey': supabase_key,
                'Content-Type': 'application/json'
            }
            with open(out_file, 'rb') as f:
                up_resp = requests.put(storage_url, headers=headers, data=f.read(), timeout=15)
                if up_resp.status_code in (200, 201):
                    print("Successfully pushed visits_intelligence.json to Supabase Storage CDN!")
                else:
                    print(f"Supabase Storage push response: {up_resp.status_code} - {up_resp.text[:100]}")
        except Exception as up_err:
            print("Supabase Storage upload notice:", up_err)

    return payload

@functions_framework.http
def parse_visits_cloud_function(request):
    """
    Google Cloud Function HTTP endpoint.
    Handles Dropbox fetch, direct HTTP payload, and returns compressed JSON.
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
        return ({'status': 'ok', 'service': 'visit-tracker-parser', 'timestamp': datetime.now(timezone.utc).isoformat()}, 200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})

    file_bytes = None

    # 1. Check if raw CSV was sent directly in HTTP POST body
    if request.data and len(request.data) > 1000:
        file_bytes = request.data

    # 2. Check Dropbox fetch
    if not file_bytes:
        token = get_dropbox_access_token()
        if token:
            dbx_path = os.environ.get('DROPBOX_VISITS_PATH', '/OFFICE HO/BI DATA/SALES DASHBOARD/VISIT_TRACKER_SEPT.csv')
            try:
                resp = requests.post(
                    'https://content.dropboxapi.com/2/files/download',
                    headers={'Authorization': f'Bearer {token}', 'Dropbox-API-Arg': json.dumps({'path': dbx_path})},
                    timeout=60
                )
                if resp.status_code == 200:
                    file_bytes = resp.content
            except Exception:
                pass

    # 3. Local fallback
    if not file_bytes and os.path.exists('VISIT_TRACKER_SEPT.csv'):
        with open('VISIT_TRACKER_SEPT.csv', 'rb') as f:
            file_bytes = f.read()

    if not file_bytes:
        return ({'error': 'No CSV file content received from HTTP body, Dropbox, or local storage.'}, 400, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'})

    csv_stream = io.StringIO(file_bytes.decode('utf-8-sig', errors='replace'))
    result = process_visit_data(csv_stream, push_to_postgres=False)

    json_str = json.dumps(result)
    accept_encoding = request.headers.get('Accept-Encoding', '')
    headers = {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}

    if 'gzip' in accept_encoding.lower():
        compressed = gzip.compress(json_str.encode('utf-8'), compresslevel=6)
        headers['Content-Encoding'] = 'gzip'
        headers['Content-Length'] = str(len(compressed))
        return (compressed, 200, headers)

    return (json_str, 200, headers)

if __name__ == '__main__':
    local_csv = 'VISIT_TRACKER_SEPT.csv'
    if os.path.exists(local_csv):
        with open(local_csv, 'r', encoding='utf-8-sig', errors='replace') as f:
            process_visit_data(f, push_to_postgres=False)
