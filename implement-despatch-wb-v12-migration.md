# Agent Task: Migrate Despatch WB Report V12 off the Python CSV export

You have live n8n MCP access to `aibanner.app.n8n.cloud`. Execute this end-to-end —
don't stop to re-plan, but DO stop and report if a reconnaissance step (Phase 1)
turns up something that contradicts an assumption below. Follow
`using-n8n-mcp-skills` and its routed skills throughout; validate before you
activate anything.

## Objective

Target workflow: **Despatch WB Report v12** (id `4QbgfUVQbo4R5YKw`).

Replace its Dropbox-CSV dependency (`Fetch Summary` → `Extract from File`, reading
a Python-generated `summary_export.csv` that only updates when a laptop is on)
with a shared sub-workflow that reads the raw Excel file directly from Dropbox
and replicates this Power Query M logic natively:

```
Source = Table1 in sheet "ORDER & DESPATCH" (raw, unfiltered, one row per order/despatch line)
1. TYPE, STATE → trim + uppercase
2. DESPATCH DATE, ORDER DATE → parse as date; if that fails, treat as an Excel
   serial number and convert
3. Filter: TYPE = "DESPATCH"
4. LatestDate = MAX(DESPATCH DATE) over the filtered set
5. StartOfMonth = start of LatestDate's month
6. Filter: DESPATCH DATE between StartOfMonth and LatestDate (MTD only)
7. Sort: DESPATCH DATE descending
```

New Dropbox file: `/OFFICE HO/BI DATA/SALES DASHBOARD/NEW DASHBOARD REPORT FORMAT-V2.xlsx`
(same folder/credential as the current CSV fetch).

Downstream logic in WB v12 (`Check Data Changed`, `Build Save Row`,
`Format Report Per State`, dedupe, Gotenberg, Telegram delivery) must keep
working with **zero behavioral change** — same output shape, same columns
(`TYPE`, `STATE`, `DISTRICT`, `CLIENT NAME`, `ITEM`, `QTY`, `DESPATCH DATE`,
`ORDER DATE`).

### This sub-workflow is shared infrastructure — design it that way from day one

Confirmed live (not assumed) — **three** active workflows independently fetch
this exact same `summary_export.csv` today and will all depend on the new
sub-workflow eventually:

| Workflow | ID | Own fetch node today | Own "last processed date" store |
|---|---|---|---|
| **Despatch WB Report v12** (today's target) | `4QbgfUVQbo4R5YKw` | `Fetch Summary` | Data Table `m8zehHqUDJqOaHdr` |
| **NON-WB Despatch** (next rollout) | `lchfUKqvUYP9Zsrq` | `Fetch Summary CSV` | Data Table `x8MR43iNsPacXXrY` |
| **Daily State-Wise % Share Report** (next rollout) | `MrO11cP6vYY8BWeM` | `Download a file` | Data Table `fukHMdF68wkzpvGd` |

Every one of them has a formatting Code/Function node
(`Format Report Per State`, `Generate Reports`, `Format Report All States`
respectively) that reads rows via `$items('Extract from File')` and does its
own independent MTD grouping/date-parsing on top. Each also has its own
`Check Data Changed` / `Build Save Row` pair against its own Data Table — that
per-workflow state tracking is correct and should **not** be centralized into
the sub-workflow (each report has a genuinely independent "have I already
sent today's version" concern).

**What this means for today's build:** you're implementing WB v12 only, but
the sub-workflow's *interface* — its output field names, row shape, and the
date-string format it hands back — becomes a contract three workflows will
bind to over time. Don't design it as "whatever WB v12's Code node happens to
want" — design it as the one canonical MTD-filtered, DESPATCH-only row set
that all three existing formatting nodes could consume unmodified (they all
expect the same columns: `TYPE`, `STATE`, `DISTRICT`, `CLIENT NAME`, `ITEM`,
`QTY`, `DESPATCH DATE`). If WB v12 needs something today that the other two
don't, keep that in WB v12's own nodes, not in the shared sub-workflow.
Treat any future edit to this sub-workflow as a breaking-change risk for
three revenue-reporting pipelines, not one — worth a comment in the
sub-workflow itself saying as much.

## Non-negotiables

1. **Don't delete the old fetch path.** Disable `Fetch Summary` and the old
   `Extract from File` node once the new path is proven — don't remove them.
   This is the rollback path if the new source has a data issue the Python
   export didn't.
2. **Don't activate the modified workflow until you've run `n8n_test_workflow`
   (or equivalent) end-to-end and manually diffed a sample of rows against a
   fresh legacy `summary_export.csv` pull.**
3. **`validate_workflow` before any activate, `n8n_get_workflow` after every
   create/update to check `connections`** — per the skill pack's non-negotiables.
4. Secrets/credentials: reuse the existing Dropbox oAuth2 credential already
   attached to `Fetch Summary` — don't create a new one, don't put anything in
   a text field.
5. If Phase 1 reveals the date column comes back in a shape that breaks the
   assumptions above (see Phase 1), stop and report before writing the Code
   node — don't guess.

---

## Phase 0 — Research first (do this before touching any node)

You're building against a file type (large multi-row xlsx from a live-synced
Dropbox folder) and a pattern (raw-file MTD aggregation as a shared
sub-workflow) that's worth checking against current docs and current node
capabilities rather than assumption:

1. Web-search / fetch current `docs.n8n.io` pages for:
   - `Extract From File` node — xlsx-specific options (sheet selection, range,
     header row, raw vs parsed output) and any recent changes to how it
     handles large spreadsheets.
   - Binary data scaling / large file handling (filesystem vs memory mode) —
     confirm nothing has changed since: files in the 10–50MB range should use
     filesystem-backed binary storage, which n8n Cloud already defaults to.
   - `Execute Workflow` / `Execute Workflow Trigger` — current parameter names
     and whether binary/large datasets pass through cleanly between parent and
     sub-workflow (this matters less here since the aggregation happens
     *inside* the sub-workflow, but confirm).
   - Dropbox node — any file-size or rate limits on `download` you should know
     about for a 20MB+ file.
2. Use `search_nodes` (or the live equivalent) to check for any node you
   haven't considered that could genuinely improve this pipeline. Specifically
   look for and evaluate:
   - **Data Table node** (`n8n-nodes-base.dataTable`) as a cache layer — instead
     of re-downloading and re-parsing the full 20MB+ file on every scheduled
     run, consider whether the sub-workflow should write the cleaned MTD rows
     into a Data Table once per data-change, so downstream report nodes read
     from the Data Table (fast, small) instead of re-running the Excel parse
     every time `Format Report Per State` needs the rows. Evaluate this
     against the current "guard with `Check Data Changed` before doing
     anything expensive" pattern already in place — the workflow may already
     get this benefit for free, since the schedule already skips the
     expensive downstream work when nothing changed. Confirm before adding
     complexity that isn't needed.
   - Any newer **Spreadsheet File / Excel-specific node** beyond
     `Extract From File` that offers range-limiting or streaming reads —
     if the raw sheet is a full year of rows, a range or filter pushed down
     at the read step (rather than pulling everything into memory and
     filtering in JS) could be materially faster. Check if this exists before
     assuming it doesn't.
   - `Aggregate` / `Summarize` nodes as a possible native replacement for parts
     of the `Format Report Per State` grouping logic — not in scope to change
     today, but flag in your final report if you see an obvious win.
3. Note any drift you find (a tool/parameter that doesn't match what
   `using-n8n-mcp-skills` or `n8n-mcp-tools-expert` describes) and proceed with
   the live tool's actual behavior.

Write a short findings note (2–5 bullets) before Phase 1 so your Phase 2 build
reflects anything useful you found.

---

## Phase 1 — Reconnaissance (read-only, no workflow changes yet)

Before writing the Code node logic, get ground truth on the raw file:

1. Confirm the exact sheet name and header row text in Table1 / "ORDER &
   DESPATCH" — pull a small sample (e.g. via a scratch/test execution of a
   Dropbox download + Extract From File with `operation: xlsx`,
   `options.sheetName: "ORDER & DESPATCH"`, `options.headerRow: true`) and
   inspect the first ~5 rows of real output.
2. Specifically determine: what shape does `DESPATCH DATE` (and `ORDER DATE`)
   come back as — a JS `Date` object, an Excel serial number, or a string? This
   determines the parser logic in Phase 2. Do not guess; check the actual
   output.
3. Confirm the literal header text for: `TYPE`, `STATE`, `DISTRICT`,
   `CLIENT NAME`, `ITEM`, `QTY`, `DESPATCH DATE`, `ORDER DATE` — exact
   case/spacing as it appears in Table1.
4. Confirm row count order of magnitude (helps decide if any Phase 0 findings
   about range-limiting are worth applying now vs. later).

Do this reconnaissance in a way that doesn't touch or execute Despatch WB
Report v12 itself — a scratch node, a temporary test workflow, or a manual
test-run of nodes you're about to build in Phase 2 is fine.

---

## Phase 2 — Build the sub-workflow

Create a new workflow: **"Despatch Raw MTD Aggregator"**. Name and describe it
in n8n as shared infrastructure (e.g. workflow description: "Central MTD
despatch data source — called by Despatch WB Report v12, NON-WB Despatch, and
Daily State-Wise %% Share Report. Changing the output shape breaks all three.")
so anyone opening it later (including future-you) knows its blast radius
before editing it.

Nodes:

1. **Execute Workflow Trigger** (`n8n-nodes-base.executeWorkflowTrigger`)
2. **Dropbox** — download
   - `operation: download`
   - `path: /OFFICE HO/BI DATA/SALES DASHBOARD/NEW DASHBOARD REPORT FORMAT-V2.xlsx`
   - reuse the existing Dropbox oAuth2 credential (look it up via
     `n8n_manage_credentials` list — don't invent an ID)
3. **Extract From File**
   - `operation: xlsx`
   - `options.sheetName: "ORDER & DESPATCH"`
   - `options.headerRow: true`
4. **Code node** — "Replicate M Query (MTD Filter)", **Run Once for All Items**
   mode. Implement the 7-step logic from the Objective section, using
   whatever date-shape you confirmed in Phase 1. Output each row with the same
   field names as today's CSV, with `DESPATCH DATE` formatted back to
   whatever string shape `Check Data Changed` / `Build Save Row` in WB v12
   currently expect (inspect those two Code nodes' date-parsing regex before
   finalizing your output format — match it exactly, don't assume).

Get-node the exact current `typeVersion` for Dropbox and Extract From File
before writing the node JSON — don't hardcode remembered versions.

`validate_workflow` this sub-workflow, fix any errors, then `n8n_get_workflow`
to confirm connections. Do not activate it (sub-workflows called via
Execute Workflow don't need to be active — confirm this against current docs
in Phase 0 if unsure).

---

## Phase 3 — Validate sub-workflow output against the legacy CSV

1. Run the sub-workflow via `n8n_test_workflow`.
2. Separately pull a fresh `summary_export.csv` (existing Dropbox path) via a
   throwaway Dropbox+Extract-From-File test, or ask for one if you can't
   trigger the Python export yourself.
3. Compare: same row count, same MTD date range, same TYPE=DESPATCH filter,
   spot-check 5–10 rows for QTY/DISTRICT/CLIENT NAME/ITEM matching. Report any
   discrepancy before proceeding — don't wire this into production if the
   numbers don't match.

---

## Phase 4 — Wire into Despatch WB Report v12

1. Add an **Execute Workflow** node calling "Despatch Raw MTD Aggregator",
   positioned to feed `Combine CSV + Store` and `Limit to 1 (CSV row)` exactly
   where `Extract from File`'s output feeds them today.
2. **Disable** (don't delete) `Fetch Summary` and the old `Extract from File`
   node.
3. Update the 3 places that reference the old extraction node by name via
   `$items('Extract from File')` / `$('Extract from File')`:
   - `Format Report Per State`
   - `Check Data Changed`
   - `Build Save Row`

   Point them at the new Execute Workflow node's output instead. Use
   `patchNodeField` for surgical edits — don't replace these Code nodes
   wholesale, they contain report-formatting logic you must not touch.
4. `validate_workflow`, then `n8n_get_workflow` to verify `connections` —
   confirm the old disabled nodes are cleanly out of the active path and the
   new Execute Workflow node is correctly wired in.

---

## Phase 5 — Test before activating

1. Use `n8n_test_workflow` on the modified Despatch WB Report v12 (side
   effects: Telegram send, Gotenberg call — confirm you're comfortable
   triggering these, or use pin data / a test chat ID if the workflow
   supports it, mirroring the existing `TEST_MODE`/`TEST_CHAT_ID` pattern
   already present in `Deduplicate Users`).
2. Confirm the generated report image and numbers match what Phase 3 validated.
3. Only after a clean test run: activate. If anything looks wrong, revert by
   re-enabling `Fetch Summary`/old `Extract from File` and disabling the new
   Execute Workflow node — don't leave the workflow in a half-migrated state.

---

## Phase 6 — Report back

Summarize: what you found in Phase 0 (docs/nodes), what you found in Phase 1
(actual date shape and headers — this determines what the Code node ended up
looking like), the validation diff from Phase 3, and the final state of
Despatch WB Report v12 (which nodes are active/disabled).

Explicitly call out that "Despatch Raw MTD Aggregator" is now live shared
infrastructure and that **NON-WB Despatch** (`lchfUKqvUYP9Zsrq`) and
**Daily State-Wise %% Share Report** (`MrO11cP6vYY8BWeM`) still read the old
CSV path today and are candidates for the same migration using the same
sub-workflow — same wiring recipe as Phase 4 (add Execute Workflow node,
disable their old fetch nodes, patch their own formatting Code nodes that
call `$items('Extract from File')`: `Generate Reports` in NON-WB Despatch,
`Format Report All States` in Daily State-Wise %% Share). Don't touch either
of those workflows today — flag them as the next task and wait to be asked.
