## Project Structure Discovery (graphify)

Before manually walking directories or opening files to figure out what they are, 
check for `graphify-out/` in the project root. Treat it as the authoritative structural 
map of the codebase, produced by `graphify`.

### Default entry point

- **Orientation-only questions** ("what domains/subsystems exist," "what's core to 
  this codebase," "anything surprising or worth flagging") → **`GRAPH_REPORT.md` 
  alone is sufficient.**
- **Anything else** (identifying which file defines a symbol, checking what 
  domain/community a file belongs to, verifying community membership, inspecting 
  edges/weights/relations, or touching a recently-changed file) → 
  **`GRAPH_REPORT.md` + `graph.json` together is the default pair.** 
  `GRAPH_REPORT.md` alone is NOT sufficient for these — it's a curated navigation 
  layer, not the data layer, and it truncates and omits significant portions of 
  the graph (see limits below).

### Read order (all paths relative to `graphify-out/`)

1. **`graphify-out/GRAPH_REPORT.md`** — start here always, for orientation.
   Gives you for free: corpus overview, executive summary, community/hub navigation, 
   top-10 "god nodes" by edge count (e.g. `calculateMoM() — 38 edges`), 
   surprising/INFERRED connections with source files, import cycles, hyperedges, 
   and all 245 community sections with cohesion score + node count + ~8 sample 
   member names each.

   **Known limits — these force a `graph.json` read:**
   - No file/line provenance for nodes — only names. Finding *which file* defines 
     a symbol requires `graph.json`.
   - No reverse lookup (file/symbol → community). Only `graph.json`'s per-node 
     `community` int gives you that.
   - Community membership is truncated (~8 names + "+N more" per community), and 
     **87 "thin" communities are omitted entirely** — singletons/pairs are invisible 
     in the report.
   - No edge-level data (`relation`/`confidence`/`weight`) beyond the top-10 god 
     nodes — full edge data lives only in `graph.json.links[]`.
   - It's a snapshot as of its build date — cross-check freshness against 
     `manifest.json` mtimes and `graph.json.built_at_commit` before trusting it 
     for recently-changed files.

2. **`graphify-out/graph.json`** — the AST layer, ~2003 nodes. The real data layer; 
   go here whenever the report's limits above are hit.
   - `id`: path slugified; `label`: human-readable path/name
   - `source_file`: **relative** path; `source_location`: line
   - `community`: int → join to `.graphify_labels.json` for the cluster's real name
   - `links[]`: `{ source, target, relation, confidence, source_file, weight }`
   - `hyperedges[]`: named groupings — useful for "what belongs to X subsystem"
   - `built_at_commit`: use for freshness checks

3. **`graphify-out/.graphify_labels.json`** — maps `graph.json`'s `community` int 
   (0–244) to human-readable god-node cluster names (e.g. "KPI Dashboard Code"). 
   Small/unnamed clusters show generically (`Community N`, `Small Cluster`, `Pair`, 
   `Singleton`). Use to translate community IDs into meaningful names — this is what 
   `GRAPH_REPORT.md` itself is built from.

4. **`graphify-out/manifest.json`** — flat freshness index only: 
   `{ "<relative/path>": { mtime, ast_hash, semantic_hash } }`. No structure, 
   no nesting. Use to check whether a specific file changed after the report/graph 
   were built.

5. **`graphify-out/.graphify_semantic_new.json`** — semantic/concept layer, 
   ~524 nodes (concepts, doc references — not 1:1 with AST files). **Not exposed in 
   `GRAPH_REPORT.md`** except indirectly via community names. Use only for 
   concept-level queries (synonyms, "references" relations, doc↔code links).
   - `id`: semantic key, **unrelated to `graph.json` ids** — never join by `id`.
   - `source_file`: **absolute** path.
   - **Join to `graph.json`:** strip `.graphify_root`'s value from this absolute 
     path → relative path → match `graph.json`'s `source_file`. Use 
     `source_location` to match at node level.

6. **`graphify-out/graph.html`** (~1.4MB) — rendered visualization only. Open only 
   if the user explicitly wants to *see* the graph, or to debug the render. Never 
   parse for structure — it's derived from `graph.json` + `.graphify_labels.json`, 
   which are cheaper and exact.

### Skip / not structure sources (still inside `graphify-out/`)

- `cache/` — internal graphify cache
- `.graphify_uncached.txt` — files not yet covered by the graph; treat as known gaps
- `.graphify_root` — absolute root path graphify used (needed for the join in step 5)
- `.graphify_python` — graphify's interpreter config
- `cost.json` — run telemetry

### Fallback rule

Only fall back to manual filesystem traversal or opening arbitrary files when:
- `graphify-out/` is missing, or
- The target file appears in `graphify-out/.graphify_uncached.txt`, or
- `manifest.json` shows the file changed after `graph.json.built_at_commit` 
  (stale graph — tell the user to re-run graphify), or
- You need actual file *contents* — the graph gives structure and relationships, 
  not code. Once identified via the graph, read the file directly.

**Goal:** Default to `GRAPH_REPORT.md` for orientation, escalate to `GRAPH_REPORT.md` 
+ `graph.json` (+ `.graphify_labels.json` for naming, + `.graphify_semantic_new.json` 
for concept-level joins) for anything specific — instead of exploratory filesystem 
traversal.