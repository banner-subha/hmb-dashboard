# Superseded: visit parser v1

Quarantined 2026-09-10 as Phase 0a of the visit-subsystem architecture fix.
Nothing here is deployed. Kept rather than deleted because none of these files
were ever tracked in git, so deleting them would be unrecoverable.

## What was here

| File | Was used by |
|---|---|
| `visit_tracker_parser.py` | `scratch/bulk_load_postgres.py` (the one-time `field_visits` backfill) |
| `Dockerfile.visit_parser` | nothing — a second, unused build path for `visit-tracker-parser` |
| `requirements_visit_parser.txt` | `Dockerfile.visit_parser` only; byte-identical to `cloud_run_visits/requirements.txt` |

## Why it was superseded

The repo carried two diverged implementations of the same parser:

- `visit_tracker_parser.py` (31 KB, this directory) — dict-based, `csv.DictReader`,
  helpers `get_row_val` / `parse_date_str` / `parse_datetime_str` / `parse_time_str`
  and a standalone `build_pincode_and_customer_dictionaries`.
- `cloud_run_visits/main.py` (34 KB, **canonical**) — indexed streaming reader,
  helpers `resolve_col_index` / `get_val` / `parse_*_fast`, enrichment inlined into
  `process_visit_data`, plus `run_ingestion_background` for `?async=true`.

`cloud_run_visits/main.py` is what actually runs. Verified by pulling the deployed
source archive for revision `visit-tracker-parser-00004-ndp`:

```
gs://run-sources-gotenberg-498805-us-central1/services/visit-tracker-parser/
  1788941173.026448-0e3a48654ca44d5994857ae49c020bb8.zip
```

It contains exactly 4 files — `main.py`, `Dockerfile`, `requirements.txt`,
`.dockerignore` — and its `main.py` is sha256-identical to the local
`cloud_run_visits/main.py` (`a51ab97a83231226…`, 34,128 bytes).

## Equivalence check before quarantining

The two copies were compared function by function, not just diffed:

- `normalize_title` — identical apart from a loop variable name.
- `load_dashboard_dealer_master` — v1 additionally falls back to a local
  `latest.json`. Irrelevant on Cloud Run, which has no local file.
- Pincode/customer geo enrichment — semantically identical: same `Counter` +
  `most_common(1)` resolution, same "first non-empty state wins" precedence for
  `cust_lookup`, same `PINCODE_REGISTRY` overlay rule.
- Dedup key — identical in both, and in the backfill script:
  `(employee.upper(), visit_date, customer_name.upper(), checkin_time)`.
- Date/time parsing — **not** identical in the abstract (see below), but produced
  byte-identical results on all 307,864 rows of the real
  `VISIT_TRACKER_SEPT.csv`. Zero divergence on live data.

## Latent bug carried by the canonical copy

`parse_date_fast` in `cloud_run_visits/main.py` takes a character-offset fast path:

```python
if s[2] in ('-', '/'):        # assumes zero-padded DD
    return date(int(s[6:10]), int(s[3:5]), int(s[0:2]))
elif s[4] == '-':             # assumes YYYY-
    return date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
```

When neither branch matches, no exception is raised, so the `except` fallback to
`strptime` never runs and the function returns `None`. The caller then does
`if not v_date: continue` — the row is **silently dropped**.

Inputs that v1 parsed but the canonical copy drops:

| Input | v1 | canonical |
|---|---|---|
| `1-1-2025` | 2025-01-01 | `None` → row dropped |
| `1/1/2025` | 2025-01-01 | `None` → row dropped |
| `2025/01/01` | 2025-01-01 | `None` → row dropped |

`parse_datetime_fast` has the same shape of problem via its `len(s) < 14` guard:
`1-1-2025 9:30` returns `None`, which nulls `checkin_time`/`report_time` and so
zeroes `duration_minutes`.

This does not fire today because the Dropbox export is consistently zero-padded
(`DD-MM-YYYY`). It will fire silently if the export format ever changes. Fix is
tracked as part of Phase 0b — make the `strptime` fallback actually reachable.

## Restoring

Everything is self-contained; move the files back to the repo root to restore.
`scratch/bulk_load_postgres.py` imports `visit_tracker_parser` and has had its
`sys.path` updated to point here, so it keeps working from this location.
