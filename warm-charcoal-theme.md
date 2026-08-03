# Task: apply the "Warm Charcoal" theme to the HMB dashboard

Repo: `hmb-dashboard` (React + Vite + Tailwind v4 `@theme`)

Restyle the entire dashboard from the current navy/blue dark theme to
**Warm Charcoal** — a charcoal base with gold used sparingly as the accent
(underlines, left-borders, key numbers, active states). This is a
**visual-only change**. Do not touch component logic, data fetching,
state, routing, or props — see "Hard constraints" at the bottom.

## 1. Color tokens — `src/index.css`

Replace the values inside the `@theme { ... }` block. Keep every variable
**name** as-is (components reference them via Tailwind classes like
`bg-bg-primary`, `text-text-muted`, `border-accent-blue` etc.) — only
change the hex/rgba values, so no class names anywhere else need to change.

| Variable | Old value | New value |
|---|---|---|
| `--color-bg-primary` | `#030b1a` | `#14161C` |
| `--color-bg-primary-rgb` | `3, 11, 26` | `20, 22, 28` |
| `--color-bg-secondary` | `#071020` | `#16181E` |
| `--color-bg-card` | `#0a1628` | `#1C1F26` |
| `--color-bg-card-hover` | `#0f1f3a` | `#242730` |
| `--color-bg-elevated` | `#0d1a30` | `#20232A` |
| `--color-bg-input` | `#0c1425` | `#1A1D24` |
| `--color-border` | `#1e293b` | `#2A2D34` |
| `--color-border-accent` | `#1e3a5f` | `#4A3A16` |
| `--color-text-primary` | `#F8FAFC` | `#E9EAEC` |
| `--color-text-secondary` | `rgba(255,255,255,0.82)` | `rgba(233,234,236,0.82)` |
| `--color-text-muted` | `rgba(255,255,255,0.66)` | `rgba(233,234,236,0.60)` |
| `--color-text-dim` | `#334155` | `#4A4D54` |
| `--color-accent-blue` | `#3b82f6` | `#D4A24C` (primary gold accent) |
| `--color-accent-blue-strong` | `#4d88ff` | `#E0B15C` |
| `--color-accent-blue-soft` | `#1e3a5f` | `#3A3020` |
| `--color-accent-cyan` | `#06b6d4` | `#4FA98C` (keep as a distinct secondary accent, e.g. positive/info trend, so gold stays reserved for primary/active) |

Leave the severity/risk tokens (`--color-severity-*`, `--color-risk-*`)
as they are — critical/high/medium/low/none must stay red/orange/yellow/gray/green
for at-a-glance meaning. Only re-tint their **badge backgrounds** (see
section 3) to sit correctly on the new charcoal, not the hue itself.

## 2. Gradients and surfaces — `src/index.css` `:root` block

Replace the blue-tinted gradients with charcoal + a restrained gold glow:

```css
--gradient-page: radial-gradient(ellipse 100% 70% at 15% -5%, rgba(212, 162, 76, 0.06), transparent 55%),
                 radial-gradient(ellipse 80% 60% at 85% 10%, rgba(212, 162, 76, 0.03), transparent 50%),
                 linear-gradient(175deg, #14161C 0%, #191B21 40%, #121319 70%, #14161C 100%);

--gradient-card: linear-gradient(145deg, #1C1F26 0%, #1E2129 45%, #191B21 100%);
--gradient-card-hover: linear-gradient(145deg, #242730 0%, #262A33 45%, #1E2129 100%);
--gradient-surface: linear-gradient(180deg, #16181E 0%, #1A1D24 50%, #16181E 100%);
--gradient-header: linear-gradient(135deg, rgba(28, 31, 38, 0.95) 0%, rgba(22, 24, 30, 0.90) 100%);
--gradient-accent: linear-gradient(135deg, #D4A24C 0%, #B8863A 100%);
--gradient-accent-soft: linear-gradient(135deg, rgba(212, 162, 76, 0.14) 0%, rgba(212, 162, 76, 0.05) 100%);
--gradient-accent-subtle: linear-gradient(90deg, rgba(212, 162, 76, 0.5) 0%, rgba(212, 162, 76, 0.1) 100%);
--gradient-glow: radial-gradient(circle at 50% 0%, rgba(212, 162, 76, 0.08), transparent 60%);
```

Keep `--text-fluid-*` untouched (typography scale, not color).

## 3. Component-level treatments (still in `index.css`, `@layer components`)

- **`.sidebar-link.active`**: switch the blue border/glow to gold — the
  signature "warm charcoal" look is a thin gold underline/left-border on
  the active nav item, not a full glow. Use `border-accent-blue` (now
  gold) at 2px left-border, background tint `rgba(212, 162, 76, 0.10)`
  fading to transparent, no heavy box-shadow.
- **Badges** (`.badge-critical/high/medium/low/none`): keep the same
  structure, just make sure the background alpha values still read
  correctly against the new charcoal (`#1C1F26`/`#20232A`) — test
  contrast, adjust alpha slightly if any badge looks washed out.
- **`select` / `.filter-select`**: the dropdown chevron SVG has a
  hardcoded stroke color (`stroke='%233b82f6'` inline in the
  `background-image` data URI) and the background-color is hardcoded to
  `#0b1329`. Update both: chevron stroke to `%23D4A24C` (gold, URL-encoded),
  background-color to `#1A1D24`, and the `option` background/color rule
  a few lines below to match.
- **`.search-input`**: focus border/shadow currently uses
  `rgba(59, 130, 246, ...)` — switch to `rgba(212, 162, 76, ...)`.
- **`.chart-tooltip`**: border currently `rgba(59, 130, 246, 0.18)` →
  `rgba(212, 162, 76, 0.18)`.
- **`.skeleton`** shimmer gradient: swap the two navy stops for two
  charcoal stops (e.g. `rgba(28,31,38,0.9)` / `rgba(36,39,48,0.95)`).
- **Scrollbar** thumb/track: already reference `--color-bg-secondary` /
  `--color-border` / `--color-text-muted`, so these update automatically
  once section 1 is applied — no extra edit needed, just verify visually.

## 4. Hardcoded hex outside `index.css`

`grep -rn "3b82f6\|4d88ff\|1e3a5f\|#0b1329" src/` and update every hit —
confirmed hardcoded blue references exist in at least:

- `src/components/common/DataTable.jsx`
- `src/components/common/KPICard.jsx`
- `src/components/common/CollapsibleCard.jsx`
- `src/components/common/SearchInput.jsx`
- `src/components/charts/MoMTrendChart.jsx`
- `src/utils/constants.js`
- `src/pages/GeoIntelligence.jsx`
- `src/pages/DistrictIntelligence.jsx`
- `src/pages/StateIntelligence.jsx`
- `src/pages/ExecutiveOverview.jsx`
- `src/pages/AlertIntelligence.jsx`
- `src/pages/DealerIntelligence.jsx`
- `src/pages/AIWarRoom.jsx`
- `src/pages/Login.jsx`

For each: if the hex is used purely for color (fills, strokes, borders,
chart series, active-state highlighting), swap it for the gold equivalent
(`#D4A24C` primary / `#E0B15C` strong / `#3A3020` soft) or reference the
updated CSS variable instead of a new hardcoded literal, so future theme
changes only require editing `index.css`. If a hex is being used as a
semantic/functional value unrelated to this accent (e.g. a chart series
that must stay blue for a specific data meaning, not just styling), leave
it and flag it instead of guessing.

Also check `src/components/charts/` broadly (not just `MoMTrendChart.jsx`)
for any Recharts/chart config objects with a blue palette array — those
often live in `utils/constants.js` as an exported `CHART_COLORS` or
similar; update the primary series color there too.

## 5. Verify across every page

After the token/gradient/hardcoded-hex changes, visually check all of:
`ExecutiveOverview`, `StateIntelligence`, `DistrictIntelligence`,
`DealerIntelligence`, `GeoIntelligence`, `AlertIntelligence`, `AIWarRoom`,
`Login`, and the sidebar/header in `DashboardLayout.jsx` — confirm text
contrast holds on the new charcoal surfaces (especially `text-muted` and
badge text), the gold accent isn't overused (it should read as an accent,
not a second base color — reserve it for active nav state, key metric
highlights, focus rings, and chart primary series, not every border), and
severity colors (red/orange/yellow/gray/green) are still clearly
distinguishable from the gold accent.

## Hard constraints

- **Do not change any component logic** — no edits to state, props,
  hooks, data transforms, routing, event handlers, or conditional
  rendering. This is colors, gradients, and CSS-variable values only.
- **Do not rename or remove any CSS variable, Tailwind class, or
  component class name** — only change the values assigned to them, so
  every existing `className="..."` reference in the JSX keeps working
  unmodified.
- **Do not touch chart data, chart logic, or chart libraries/config**
  beyond the color/palette values described above.
- **Do not reformat or restructure files** beyond the lines needed for
  this change — keep diffs minimal and reviewable.
- If any hardcoded color's purpose is unclear (theming vs. functional
  meaning), leave it unchanged and note it rather than guessing.
