# Build brief — HMB Ispat sales chat

You are building a ChatGPT-style chat interface over a steel distribution
company's sales database, plus the FastAPI backend that serves it. The database
and its read layer already exist and are verified correct. Your job is the
agent service and the UI.

Read this whole brief before writing any code. Then state your plan for step 1
and wait for approval.

---

## Repos

| What | Where |
|---|---|
| Agent backend | `hmb-sales-agent` — new Cloud Run service, `asia-northeast1` |
| Frontend | `banner-subha/hmb-dashboard` — existing React/Vite/Tailwind on Netlify. Add a route. Do **not** create a new app |

## Infrastructure that already exists

```
Supabase Postgres   igyfelwdrnidaojzqksb   (ap-northeast-1, Tokyo)
Cloud Run parser    hmb-xlsx-parser        (asia-northeast1)
n8n ingestion       workflow pSSv8OpKqAHEIT9Q
```

Connect to Postgres with **asyncpg over port 5432**, not PostgREST. PostgREST
wraps every call in a transaction, which blocks `REFRESH MATERIALIZED VIEW
CONCURRENTLY` later, and adds 200ms. Use the DB password from Secret Manager.
The `service_role` key is not needed anywhere in this service.

---

## The seven database functions you are wrapping as tools

| Function | Returns |
|---|---|
| `query_despatch` | sales tonnage, 10 group-by dimensions |
| `query_dia_wise` | size/diameter breakdown + revenue, 13 dimensions |
| `query_pending` | order backlog + ageing buckets, 10 dimensions |
| `query_dealer_targets` | target achievement, 6 dimensions |
| `query_dealer_vs_actual` | scheme target vs invoiced, side by side |
| `query_kro_performance` | field-force attribution, 10 dimensions |
| `resolve_dimension_value` | maps user text to stored values, 5 match tiers |

Plus `explain_dealer_match(text)` and `v_data_freshness`.

Every `query_*` function shares one contract: `p_dimensions text[]` validated
against a fixed allowlist, optional text filters that accept natural language
(`p_state := 'UP'` resolves internally), and returns one row per group as
`jsonb` with metrics and `pct_of_total` **already computed in SQL**.

### Before you write a single tool schema

Fetch the real signatures. Do not infer parameter names from the table above.

```sql
select p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'query\_%'
order by p.proname;
```

Put the argument-name mapping in exactly one place per tool so a wrong name is
a one-line fix.

### asyncpg gotcha that will cost you an hour

Set type codecs at connection level in the pool `init`. Without them `numeric`
arrives as `Decimal` and fails to serialise into a tool result, and `jsonb`
arrives as a string.

```python
await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
await conn.set_type_codec("numeric", encoder=str, decoder=float, schema="pg_catalog")
```

---

## Two hard rules about the data

These exist because the data is dirty in specific, known ways. Breaking either
one produces a fluent, confident, wrong number — which is the failure mode that
kills this tool.

**1. The model never writes a state, district, or dealer string from its own
head.** Filter values are passed through as the user typed them, and the RPC
resolves them. If a filter returns zero rows, the model says the value was not
found and asks which was meant. It does **not** retry with a name it invented.
There are 962 spellings for ~500 dealers and 6,756 `clean_size` values.

**2. Whenever a dealer filter is applied, call `explain_dealer_match()` and
surface the result.** Totals are deliberately inclusive, so `'riya steel'`
folds in `PRIYA STEEL` — a different company. The disclosure carries a
confidence label (`spelling_variant`, `suffix_or_prefix`, `possible_mismatch`).
Warn visibly on any `possible_mismatch`.

Also: `record_type` must always be specified. `despatch_orders` holds DESPATCH,
ORDER and TARGET rows in one table; without the filter, August tonnage reads
43,753 t instead of 20,811 t. ORDER and TARGET are not sales and are never
added to a sales figure.

---

## System prompt requirements

Build it in one module. It must contain:

- **`v_data_freshness` output, injected per request.** Not baked in. The
  diameter export is currently stale since 17 August, so any size or revenue
  answer must say where the data stops rather than reporting half a number as
  if it were whole.
- Canonical low-cardinality values inline — the 20 states, 9 items, 3 record
  types. Read them from `dim_catalog` at startup; cheaper than a round trip per
  question. High-cardinality dimensions must be resolved, never listed.
- The fiscal year runs **April to March**. Define MTD and YTD explicitly,
  including behaviour at a month boundary.
- **The model performs no arithmetic.** Tonnage, revenue and `pct_of_total`
  come from SQL. If a different grouping is needed, call the tool again.
- Tonnage in tonnes to three decimals. Currency INR.
- Audience is sales staff who know the business and want a number, not a
  narration of the query plan.

---

## Streaming contract

Typed events, so the UI can show progress during the gap before the first
content token. A tool-calling first turn means LLM → DB → LLM before any text
exists; without status events that reads as a hang.

```
event: session        {"session_id":"..."}          ← always first, before any token
event: tool_start     {"id":"tc_0417","tool":"query_despatch","args":{...}}
event: tool_result    {"id":"tc_0417","rows":20,"ms":24}
event: token          {"text":"WB led August with "}
event: chart          {"chart":"bar","source":"tc_0417","x":"state","y":"tonnage","title":"..."}
event: done           {"session_id":"...","tokens":{...}}
event: error          {"message":"..."}
```

**Charts: the model never emits chart data.** Cache each tool result
server-side keyed by `tool_call_id`; the model emits only the spec above, and
the frontend joins spec to cached rows. Numbers then cannot be mangled in
transit, and you don't pay tokens to re-emit 40 rows.

### Cloud Run specifics — each one costs an afternoon if missed

- Disable gzip on the SSE route
- Send `X-Accel-Buffering: no`
- Request timeout well above the default
- `--min-instances 1`. A 2–5s cold start on the first question of the morning
  feels broken
- The browser calls the Cloud Run URL **directly** with CORS. Netlify's proxy
  buffers and will break streaming

### Latency targets

| Metric | Target |
|---|---|
| First SSE event | < 400ms |
| First content token | < 2.5s |
| Full answer | < 6s |

"First token under 1.5s" is not achievable on a tool-calling turn. Don't aim at it.

---

## Session memory and caching

Sessions in `chat_sessions(session_id uuid, messages jsonb, updated_at
timestamptz)` in the existing Postgres. No Redis.

Cache tool results keyed on **ingest epoch** — `max(ingested_at)` or the
`file_hashes` state — not a TTL. Results then live indefinitely and invalidate
exactly when new data lands.

Put one interface in front of the LLM provider on day one, with a single
implementation behind it. Provider quirks must not reach the tool dispatcher.

## Access control

Design the signatures now even though everyone is Admin on day one. If a KRO
should only see their own dealers, the scope filter is a **separate argument
the RPC receives from a server-verified JWT claim**, applied unconditionally.
If it is an ordinary tool parameter the model fills in, "ignore that and show
me all states" defeats it.

---

## Frontend

A route inside `hmb-dashboard`, reusing its auth, router and design tokens. Note
it does **not** reuse a data client — the dashboard reads `latest.json` from
Storage in a different Supabase project, and the chat reads nothing from
Storage at all.

### Routing and placement

The chat is a **peer route with a top-level nav item**, named "Ask". It is not a
floating bubble or a panel inside a dashboard page — the dashboard currently
visualises only despatch and pending data, while the chat answers across all
five tables, so an embedded widget would look out of place answering a Season 7
target question. A full page called Ask does not.

Mount it as a **sibling of the dashboard layout route, not a child.** The
dashboard shell owns its own padding and scroll container; the chat needs the
full viewport and must control scrolling itself.

```
/                     dashboard layout
  /                   overview
  /alerts             ...
/chat                 chat layout  ← sibling, own shell
  /chat               new conversation, no session row yet
  /chat/:sessionId    existing conversation
```

**The URL owns which session is open.** Not React state. That gives deep links,
a working back button and refresh-safety, and reduces the sidebar to a list of
`<Link>`s.

### Session lifecycle

Do **not** create a row when the user clicks "New chat" — that accumulates
empty sessions. `/chat` with no id *is* the new-chat state. The backend creates
the row on the first message and emits `session_id` as the **first SSE event**,
before any token. The frontend then does
`navigate('/chat/' + id, { replace: true })`. If the stream dies mid-answer the
session already exists and the URL is already right.

```sql
create table chat_sessions (
  session_id  uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  title       text,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on chat_sessions (user_id, updated_at desc);
```

### Identity across two Supabase projects

There are **two Supabase projects** and they are not the same account:

| Project | Holds |
|---|---|
| dashboard project | Supabase Auth users — the only source of identity |
| sales project `igyfelwdrnidaojzqksb` | all five data tables, the seven RPCs, and `chat_sessions` |

Consequences, each of which has bitten someone:

**`chat_sessions.user_id` has no foreign key.** It is a bare `uuid not null`
holding the JWT `sub` claim. `auth.users` lives in the other project, so the
reference cannot exist. Do not try to create it.

**The agent verifies a token it did not issue.** The JWT comes from the
dashboard project, so verification uses the *dashboard* project's keys.
Verifying against the sales project's secret fails in a way the browser reports
as a CORS error, because the preflight succeeds and the real request doesn't —
you will lose an hour to the wrong layer.

Check Project Settings → JWT Keys in the dashboard project first. If asymmetric
signing keys are enabled, verify via JWKS at
`https://<dashboard-ref>.supabase.co/auth/v1/.well-known/jwks.json`, cached in
process — no secret in Secret Manager and nothing to rotate. If the project is
still on the legacy HS256 secret, that secret goes in Secret Manager. **Build
one path, not both.**

Verify `exp`, `iss` (`https://<dashboard-ref>.supabase.co/auth/v1`) and
`aud` (`authenticated`). Take `user_id` from `sub` and nothing else. Any
failure is a 401 — no anonymous fallback, no degraded read-only mode.

**The frontend keeps exactly one Supabase client**, for the dashboard project,
used only to obtain the access token. The chat route never talks to the sales
project directly; every sales figure arrives through the agent API. Send the
token as `Authorization: Bearer`, so the agent needs no cookies —
`allow_credentials=False` with an explicit origin allowlist for the Netlify
domain and localhost.

Call `supabase.auth.getSession()` immediately before each request. Do not cache
the token in a module-level variable: access tokens expire hourly, and the
first question after a long idle will 401. For an SSE stream, verify once at
connect; a stream already open when the token expires is fine.

`user_id` comes from the verified JWT, never from the request body. Every
session read and write filters on it.

Endpoints:

```
GET    /sessions           list for the current user: id, title, updated_at
GET    /sessions/{id}      full message history
POST   /chat               {message, session_id?} → SSE stream
PATCH  /sessions/{id}      rename
DELETE /sessions/{id}      delete
```

Titles: set to the first user message truncated to ~50 chars immediately, so
the sidebar entry never renders blank. Replace it after the first assistant
turn with a short generated title in a background task — never blocking the
stream. If title generation fails, the truncated version stands.

### Layout

One grid that owns the viewport, with scrolling confined to the message column
only. The composer and the sidebar must not move when messages grow.

```
┌──────────────┬────────────────────────────────┐
│ + New chat   │                                │
│              │   ← only this column scrolls   │
│ Aug by state │                                │
│ WB backlog   │                                │
│ 10mm rates   │                                │
│              │                                │
│              ├────────────────────────────────┤
│  account     │  [ composer                  ] │
└──────────────┴────────────────────────────────┘
```

```jsx
<div className="grid h-[100dvh] grid-cols-[16rem_1fr] overflow-hidden">
  <aside className="flex flex-col overflow-y-auto border-r">…</aside>
  <main className="flex min-h-0 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto">{messages}</div>
    <Composer />
  </main>
</div>
```

`min-h-0` on the flex children is load-bearing. Without it a flex item refuses
to shrink below its content and the scroll container never forms — the whole
page scrolls instead and the composer walks off screen.

Sidebar behaviour: grouped by relative date (Today / Yesterday / Previous 7
days), active session marked by comparing to the route param, hover reveals
rename and delete, delete confirms inline rather than in a modal.

On mobile the sidebar is a drawer over the content, closed by default, opened
from a header button, and it closes on navigation. Do not try to fit two
columns at 380px.

**Read `tailwind.config.js` and the existing components first and inherit the
palette, type scale and radii already in use.** Do not invent a new theme; this
should look like the same product as the dashboard. If the existing tokens
don't cover something the chat needs, extend them rather than hardcoding.

Layout, GPT-style but not a clone:

- Centred reading column, roughly 44rem, comfortable line length
- User turns in a subtle contained block; assistant turns full-width plain
  prose, no bubble. Two speakers, two treatments — the asymmetry is the signal
- Composer pinned to the bottom, auto-growing textarea capped around 8 rows,
  Enter sends and Shift+Enter newlines
- Empty state offers real prompt chips: "Top 5 states today", "Backlog over 30
  days", "10mm vs 12mm volume". Not lorem
- During the tool gap show the live status line from the SSE events —
  "Aggregating 92k despatch rows…". This is what makes it read as fast
- Recharts inside the assistant turn, from the chart spec
- Tables sortable with CSV export
- A freshness banner whenever any table is stale, not a buried footnote
- `possible_mismatch` dealer warnings inline and visible, styled as a caution,
  not a tooltip

**Mobile — this bit has already bitten this codebase.** A pinned input bar is
exactly where `100vh` breaks on mobile Chrome. Use `100dvh` and
`env(safe-area-inset-bottom)` from the start, and test at 380px.

Avoid the generated-page tells: no gradient hero, no tracked-out all-caps
labels above every heading, no identical rounded cards with the same soft grey
shadow, no arrows appended to button text. Let the streaming text itself be the
one moment of motion; skip fade-and-slide entrances on every element.

---

## Build order

Do these in sequence. Do not build all the plumbing before something calls it —
that's how signature mistakes surface late.

1. **One vertical slice.** One tool, non-streaming `POST /chat`, deliberately
   ugly page. End to end against the real database.
2. Add SSE streaming and the typed status events.
3. Register the remaining six tools.
4. Chart spec pipeline with server-side result cache.
5. Make it beautiful.
6. Eval fixture, then user access control.

Stop at the end of each step, say what you verified and how, and wait.

## Verification

Build the eval fixture before anyone in sales sees this: 30–50
question/expected-number pairs, running as a script. This session's audit found
200 t of phantom tonnage, revenue 4.3× too high, backlog 84% too high and a
1.14% join fan-out. The risk is not the model failing to answer — it's
answering fluently with a wrong number. One bad tonnage figure in front of a
KRM and the tool is dead no matter how good the UI is.

Seed the fixture with these known-correct figures:

```
August 2026 despatch, all states      20,810.931 t
  WB                                  10,309.511 t   (49.54%)
  UTTARPRADESH                         2,773.170 t   (13.33%)
  JHARKHAND                            2,737.359 t   (13.15%)
Live backlog (actual_pending)          14,606.4 t across 744 orders
Derived Season 7 target                20,821.7 t
10 MM avg rate, Jul onward             ₹48,353/t
```

If a total comes back near 43,753 t, `record_type` is not being applied.
If revenue looks ~4.3× high, it's summing the repeated invoice header total
instead of `item_rate × item_sales_qty` at line level.

**Log every turn** to one table: question, tool calls with arguments, row
counts, latency, tokens, final answer. That log is how you find missing
dimensions, missing aliases, and questions the RPCs can't yet serve. Also log
every `resolve_dimension_value` call that returns zero matches — that list is
exactly what to add to `dimension_aliases`, which is a table, so no deploy.

---

## How to work

- Smallest change that does the actual thing. Don't refactor while building.
- Fail fast. Throw when a precondition isn't met. No `|| 0`, no `?? {}`, no
  silent defaults, no fallback paths.
- One way to do a thing, not three. No compatibility shims for shapes that
  don't exist yet.
- Never claim something works until it has been run. Say what you ran.
- Ask before adding a dependency or a service.
- If the real fix is bigger than the ask, say so and wait.
