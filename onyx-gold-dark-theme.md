# Task: "Onyx Gold" — full dark theme rebuild (dark defaults only)

The dashboard currently has two themes: dark (default, unscoped values living
in `@theme` / `:root` in `src/index.css`) and **Corporate Navy Light**
(scoped under `[data-theme="light"]`). This task replaces every dark value
with **Onyx Gold** — true near-black surfaces with the HMB gold as the sole
accent, navy dropped from the dark palette entirely (it disappears into
near-black anyway; gold is what reads at this darkness).

**Hard rule: do not touch anything under `[data-theme="light"]`, or any of
the `[data-theme="light"] ...` component override blocks lower in the file.**
Every edit below targets either the unscoped `@theme` block, the unscoped
`:root` block, or specific hardcoded-blue component rules that currently
have no light-mode equivalent to break. Same variable *names* throughout —
only hex/rgba *values* change — so no component file needs to be touched.

---

## Part A — Core palette (`@theme` block, top of `src/index.css`)

| Variable | Current (dark) | → Onyx Gold |
|---|---|---|
| `--color-bg-primary` | `#14161C` | `#050505` |
| `--color-bg-primary-rgb` | `20, 22, 28` | `5, 5, 5` |
| `--color-bg-secondary` | `#16181E` | `#0A0A0A` |
| `--color-bg-card` | `#1C1F26` | `#0F0F0F` |
| `--color-bg-card-hover` | `#242730` | `#161616` |
| `--color-bg-elevated` | `#20232A` | `#131313` |
| `--color-bg-input` | `#1A1D24` | `#0C0C0C` |
| `--color-border` | `#2A2D34` | `#232323` |
| `--color-border-accent` | `#1e3a5f` | `#3A2F0E` |
| `--color-text-primary` | `#E9EAEC` | `#F2F2F2` |
| `--color-text-secondary` | `rgba(233,234,236,0.82)` | `rgba(242,242,242,0.82)` |
| `--color-text-muted` | `rgba(233,234,236,0.60)` | `rgba(242,242,242,0.60)` |
| `--color-text-dim` | `#4A4D54` | `#4A4A4A` |
| `--color-accent-blue` | `#3b82f6` | `#E8B923` |
| `--color-accent-blue-strong` | `#4d88ff` | `#FFD65C` |
| `--color-accent-blue-soft` | `#1e3a5f` | `#3A2F0E` |
| `--color-accent-cyan` | `#4FA98C` | `#C9A227` |
| `--color-accent-sky` | `#4EA8DE` | `#D4AF37` |
| `--color-accent-sky-strong` | `#7BC4EA` | `#F0C64A` |
| `--color-accent-sky-soft` | `#1B3A4D` | `#241C08` |

**Sidebar strip:**

| Variable | Current | → Onyx Gold |
|---|---|---|
| `--color-sidebar-bg` | `#16181E` | `#0A0A0A` |
| `--color-sidebar-text` | `#FFFFFF` | `#FFFFFF` (unchanged) |
| `--color-sidebar-text-muted` | `#FFFFFF` | `#FFFFFF` (unchanged) |
| `--color-sidebar-active-bg` | `rgba(59,130,246,0.20)` | `rgba(232,185,35,0.16)` |
| `--color-sidebar-active-icon` | `#3b82f6` | `#E8B923` |

**Severity / risk colors — leave unchanged.** These are universal status
semantics (critical/high/medium/low/none — red/orange/amber/gray/green),
not brand colors. Swapping them for gold would remove the ability to tell
"warning" from "on-brand accent" at a glance. Verified they still read
clearly against `#050505`.

---

## Part B — Gradients & map/chart tokens (`:root` block)

| Variable | → Onyx Gold |
|---|---|
| `--gradient-page` | `radial-gradient(ellipse 100% 70% at 15% -5%, rgba(232,185,35,0.07), transparent 55%), radial-gradient(ellipse 80% 60% at 85% 10%, rgba(232,185,35,0.04), transparent 50%), linear-gradient(175deg, #050505 0%, #0A0A0A 40%, #030303 70%, #050505 100%)` |
| `--gradient-card` | `linear-gradient(145deg, #0F0F0F 0%, #131313 45%, #0A0A0A 100%)` |
| `--gradient-card-hover` | `linear-gradient(145deg, #161616 0%, #1A1A1A 45%, #101010 100%)` |
| `--gradient-surface` | `linear-gradient(180deg, #0A0A0A 0%, #0C0C0C 50%, #0A0A0A 100%)` |
| `--gradient-header` | `linear-gradient(135deg, rgba(15,15,15,0.95) 0%, rgba(10,10,10,0.90) 100%)` |
| `--gradient-accent` | `linear-gradient(135deg, #E8B923 0%, #C9971A 100%)` |
| `--gradient-accent-soft` | `linear-gradient(135deg, rgba(232,185,35,0.14) 0%, rgba(201,151,26,0.05) 100%)` |
| `--gradient-accent-subtle` | `linear-gradient(90deg, rgba(232,185,35,0.5) 0%, rgba(232,185,35,0.1) 100%)` |
| `--gradient-glow` | `radial-gradient(circle at 50% 0%, rgba(232,185,35,0.10), transparent 60%)` |
| `--gradient-sky` | `linear-gradient(135deg, #D4AF37 0%, #A9821E 100%)` |
| `--gradient-sidebar` | `linear-gradient(180deg, #0A0A0A 0%, #0C0C0C 50%, #0A0A0A 100%)` |

| Variable | → Onyx Gold |
|---|---|
| `--color-map-landmass` | `#161616` |
| `--color-map-border` | `#3A3A3A` |
| `--color-map-stroke` | `#3A3A3A` |
| `--color-chart-tooltip-bg` | `#0F0F0F` |
| `--color-chart-tooltip-border` | `rgba(232,185,35,0.18)` |
| `--color-chart-cursor` | `#000000` |
| `--shadow-chart-tooltip` | `0 10px 30px -10px rgba(0,0,0,0.85)` |
| `--ai-card-bg` | `#0A0A0A` |
| `--ai-card-border` | `#1C1C1C` |

`--color-severity-*-bg/text/border` (the block just above the map tokens):
**leave unchanged** — same reasoning as Part A.

---

## Part C — Hardcoded blue that variables don't cover

A handful of rules write `rgba(59,130,246,…)` / specific blue hexes
directly instead of referencing `--color-accent-blue`, so changing the
variable alone won't restyle them. These have no `[data-theme="light"]`
counterpart, so editing them in place is safe.

| Selector | Current | → Onyx Gold |
|---|---|---|
| `.glass-card-hover:hover` | `border-color: rgba(59,130,246,0.25)` | `rgba(232,185,35,0.25)` |
| `.glass-card-hover:hover` | `box-shadow: 0 8px 32px rgba(59,130,246,0.08), 0 2px 8px rgba(0,0,0,0.3)` | `0 8px 32px rgba(232,185,35,0.08), 0 2px 8px rgba(0,0,0,0.5)` |
| `.gradient-glow-top::after` | `background: linear-gradient(90deg, transparent, rgba(59,130,246,0.4), rgba(59,130,246,0.2), transparent)` | `linear-gradient(90deg, transparent, rgba(232,185,35,0.4), rgba(232,185,35,0.2), transparent)` |
| `.search-input:focus` | `border-color: rgba(59,130,246,0.7); box-shadow: 0 0 0 3px rgba(59,130,246,0.12)` | `rgba(232,185,35,0.7)` / `rgba(232,185,35,0.12)` |
| `select`, `.filter-select` background-image arrow | stroke `%234EA8DE` (sky blue) | stroke `%23E8B923` |
| `.toggle-pill-active` | `box-shadow: 0 2px 6px rgba(59,130,246,0.35)` | `0 2px 6px rgba(232,185,35,0.35)` |
| `.btn-action-pill` | `color: var(--color-accent-blue); background-color: rgba(59,130,246,0.10); border: 1px solid rgba(59,130,246,0.30)` | `color: #E8B923; background-color: rgba(232,185,35,0.10); border: 1px solid rgba(232,185,35,0.30)` |
| `.btn-action-pill:hover` | `background-color: rgba(59,130,246,0.20)` | `rgba(232,185,35,0.20)` |
| `.btn-pill-action` | `background-color: rgba(59,130,246,0.14); color: #60a5fa; border: 1px solid rgba(59,130,246,0.35)` | `rgba(232,185,35,0.14)` / `#E8B923` / `rgba(232,185,35,0.35)` |
| `.btn-pill-action:hover` | `background-color: rgba(59,130,246,0.25); color: #93c5fd; border-color: rgba(59,130,246,0.55)` | `rgba(232,185,35,0.25)` / `#FFD65C` / `rgba(232,185,35,0.55)` |
| `.panel` | `background: linear-gradient(160deg, rgba(32,35,42,0.92) 0%, rgba(25,27,33,0.88) 100%); border: 1px solid rgba(42,45,52,0.7)` | `linear-gradient(160deg, rgba(15,15,15,0.94) 0%, rgba(8,8,8,0.90) 100%); border: 1px solid rgba(35,35,35,0.7)` |
| `.panel-inset` | `background: linear-gradient(180deg, rgba(26,29,36,0.95) 0%, rgba(22,24,30,0.90) 100%); border: 1px solid rgba(42,45,52,0.55)` | `linear-gradient(180deg, rgba(10,10,10,0.96) 0%, rgba(6,6,6,0.92) 100%); border: 1px solid rgba(35,35,35,0.55)` |
| `.glass-card` / `.glass-card-hover` base | `box-shadow: 0 2px 12px rgba(20,22,28,0.6), inset 0 1px 0 rgba(255,255,255,0.04)` | `0 2px 12px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.03)` |

---

## Part D — Deliberately left alone

- **`.badge-theme-blue/green/red/amber/purple/cyan`** — these are
  categorical tag colors (used for arbitrary labeling, not the primary
  accent), so `badge-theme-blue` stays literal blue. Swapping it for gold
  would collapse "blue category" and "brand accent" into one color and
  remove a distinction the UI currently relies on. Flag if this
  assumption is wrong and they should fold into the gold system instead.
- **`.badge-critical/immediate/high/medium/low/none`** — semantic
  severity, unchanged (see Part A).
- **`[data-theme="light"]` block and every `[data-theme="light"] …`
  component override further down the file** — untouched, per the hard
  rule above. Light stays pixel-identical.
- **Sidebar text color (`#FFFFFF`)** — unchanged; white on near-black
  sidebar still has the best contrast, no reason to gold-tint body text.

---

## Part E — Testing checklist after the swap

1. Toggle dark ↔ light a few times — light should render exactly as it
   does today, no bleed from the new dark values.
2. Check severity badges (critical/high/medium/low/none) still pop
   against `#0F0F0F` cards — they were tuned for `#1C1F26`, one shade
   lighter, so re-check contrast, not just presence.
3. Check the geo map (`path.map-path[fill="#1e2535"]` override target) —
   confirm `--color-map-landmass` swap doesn't need that hardcoded hex
   updated too (it currently only overrides in `[data-theme="light"]`;
   dark relies on the CSS variable already being read correctly by D3 —
   verify D3 is reading the variable and not a baked-in hex).
4. Chart tooltips, hover states, and the sidebar active-nav glow are the
   three places gold will read most differently from blue — spot-check
   each on Executive Overview, State Performance, and Geo View.
5. Confirm `.btn-action-pill` / `.btn-pill-action` (View District
   Breakdown, View All Dealers, etc.) don't clash with adjacent gold KPI
   deltas — two gold elements stacked can read as one blob at low
   contrast; nudge opacity if so.
