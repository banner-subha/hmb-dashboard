# Task: add a theme switcher + build "Corporate Navy Light" as the 2nd theme

The dashboard currently has one theme (dark — already correct, **do not
restyle or touch its existing values**). Add a **theme switcher** so the
user can toggle between the existing dark theme and a new light theme
called **Corporate Navy Light**: light steel-gray content with a navy
sidebar/header strip and blue accents. Dark stays the default on first
load.

## Part A — Theme switcher infrastructure

1. **Scoping mechanism**: use a `data-theme` attribute on `<html>`
   (`data-theme="dark"` / `data-theme="light"`) rather than a class, so
   CSS variable overrides can be scoped with
   `[data-theme="light"] { --color-bg-primary: ...; }` etc. Keep all
   current dark values exactly where they are now (in `:root` /
   `@theme` in `src/index.css`) as the default/fallback — only *add* a
   `[data-theme="light"]` override block with the new values, don't
   move or rewrite the existing dark ones.
2. **State + persistence**: add a small `ThemeContext`/`ThemeProvider`
   (or equivalent — match whatever state pattern the codebase already
   uses) that reads a saved preference from `localStorage`
   (`hmb-dashboard-theme`), defaults to `"dark"` if nothing is saved,
   and writes the `data-theme` attribute onto `document.documentElement`.
3. **Avoid flash-of-wrong-theme**: set the `data-theme` attribute as
   early as possible — either a tiny inline script in `index.html` that
   runs before React mounts and reads `localStorage`, or ensure the
   provider sets it synchronously on first render before paint.
4. **Toggle control**: add a compact sun/moon (or light/dark) toggle
   button in the sidebar footer near the `Admin / Administrator` block,
   or in the header — whichever fits the existing layout better. Clicking
   it flips `data-theme` and updates `localStorage`. No page reload
   needed.
5. Persist the choice across sessions and across all pages (it's a
   single global attribute, so this should be automatic once wired up
   correctly).

## Part B — Corporate Navy Light tokens

Add a `[data-theme="light"]` block in `src/index.css` with these
values. Same variable **names** as the dark theme (so components that
already reference `bg-bg-primary`, `text-text-muted`, etc. via Tailwind
classes need zero changes):

| Variable | Light value |
|---|---|
| `--color-bg-primary` | `#EEF1F4` |
| `--color-bg-primary-rgb` | `238, 241, 244` |
| `--color-bg-secondary` | `#E4E8ED` |
| `--color-bg-card` | `#FFFFFF` |
| `--color-bg-card-hover` | `#F7F9FB` |
| `--color-bg-elevated` | `#FFFFFF` |
| `--color-bg-input` | `#FFFFFF` |
| `--color-border` | `#D3D9E0` |
| `--color-border-accent` | `#B8CCE0` |
| `--color-text-primary` | `#0B2240` |
| `--color-text-secondary` | `rgba(11, 34, 64, 0.75)` |
| `--color-text-muted` | `rgba(11, 34, 64, 0.55)` |
| `--color-text-dim` | `#9AA5B1` |
| `--color-accent-blue` | `#4E9BE0` |
| `--color-accent-blue-strong` | `#1D6FB8` |
| `--color-accent-blue-soft` | `#E6F1FB` |
| `--color-accent-cyan` | `#2E9E88` |

Sidebar/header specifically stay navy (not light gray) even in light
mode — that's the "navy" in Corporate Navy Light. Add two more
theme-scoped variables just for that strip, e.g.:

```css
[data-theme="light"] {
  --color-sidebar-bg: #0B2240;
  --color-sidebar-text: #F4F7FA;
  --color-sidebar-text-muted: #7C93B5;
  --color-sidebar-active-bg: rgba(78, 155, 224, 0.18);
  --color-sidebar-active-icon: #4E9BE0;
}
```

and update the sidebar/header component to use these variables instead
of the general `bg-bg-primary`/`text-text-primary` tokens, so it stays
navy regardless of theme mode. In dark mode, set these same
`--color-sidebar-*` variables to match the current dark sidebar
appearance exactly (so dark mode is visually unchanged).

Gradients (add a light equivalent, keep dark's `--gradient-*` as-is):

```css
[data-theme="light"] {
  --gradient-page: linear-gradient(175deg, #EEF1F4 0%, #F2F4F7 50%, #EEF1F4 100%);
  --gradient-card: linear-gradient(145deg, #FFFFFF 0%, #FBFCFD 100%);
  --gradient-card-hover: linear-gradient(145deg, #F7F9FB 0%, #FFFFFF 100%);
  --gradient-header: linear-gradient(135deg, #0B2240 0%, #0E2A4D 100%);
  --gradient-accent: linear-gradient(135deg, #4E9BE0 0%, #1D6FB8 100%);
  --gradient-accent-soft: linear-gradient(135deg, rgba(78,155,224,0.14) 0%, rgba(78,155,224,0.05) 100%);
  --gradient-glow: radial-gradient(circle at 50% 0%, rgba(78,155,224,0.08), transparent 60%);
}
```

## Part C — Severity/risk badges in light mode

Keep the same semantic hues (critical=red, high=orange, medium=amber/
blue, low=gray, none=green) but re-tint for a white/light card
background — pale tinted background + dark-toned text, not the dark-mode
low-opacity-on-dark approach:

- Critical: bg `#FCEBEB`, text `#791F1F`
- High: bg `#FDEEE0`, text `#9A4A0C`
- Medium: bg `#E6F1FB`, text `#0C447C`
- Low: bg `#F1F2F4`, text `#5B6472`
- None/positive: bg `#E8F5E9`, text `#256029`

If badge components already read colors from CSS variables per-severity,
add light-mode overrides for those variables the same way as Part B.
If they're hardcoded hex per severity in JS/JSX, make them theme-aware
(see Part E) or, simplest, define `--color-severity-critical-bg` /
`-text` (etc.) tokens now if they don't already exist, so both themes
read from variables going forward.

## Part D — Map and charts in light mode

- **Map container**: switch background from dark navy to white/light
  gray, base landmass fill from the current dark tone to a light
  steel-gray (e.g. `#DCE2E8`), border/outline color darker for
  visibility on white.
- **Despatch choropleth scale**: reuse the blue ramp from the earlier
  blue-accent patch (`#D6EDFA → #A9D9F0 → #7BC4EA → #4EA8DE → #2E86C1 →
  #1B5D8A`) — it already works on both dark and light backgrounds, no
  change needed there.
- **MoM trend chart / other Recharts components**: check
  `src/components/charts/` for any hardcoded dark-only stroke/fill/grid
  colors (axis lines, gridlines, tooltip background) and make them
  theme-aware — axis/grid lines should go from light-on-dark to
  dark-on-light, tooltip background from dark card to white card with
  the existing border token.

## Part E — Hardcoded hex outside `index.css`

The following files are known to contain hardcoded color values (from
earlier theme work) rather than pure CSS-variable references:

- `src/components/common/DataTable.jsx`
- `src/components/common/KPICard.jsx`
- `src/components/common/CollapsibleCard.jsx`
- `src/components/common/SearchInput.jsx`
- `src/components/charts/MoMTrendChart.jsx`
- `src/utils/constants.js`
- `src/pages/GeoIntelligence.jsx`, `DistrictIntelligence.jsx`,
  `StateIntelligence.jsx`, `ExecutiveOverview.jsx`,
  `AlertIntelligence.jsx`, `DealerIntelligence.jsx`, `AIWarRoom.jsx`,
  `Login.jsx`

For each hardcoded hex used for a **surface, border, or text color**
(not a fixed-meaning data color like a chart series that must stay
constant across themes), replace it with the matching CSS variable
(`var(--color-bg-card)`, `var(--color-text-muted)`, etc.) instead of a
new hardcoded value — this makes it theme-aware automatically and is
also just cleaner going forward. If a hex is genuinely
theme-independent (e.g. a brand-fixed color that must never change),
leave it and flag it.

## Part F — Verify

Toggle between dark and light on every page —
`ExecutiveOverview`, `StateIntelligence`, `DistrictIntelligence`,
`DealerIntelligence`, `GeoIntelligence`, `AlertIntelligence`,
`AIWarRoom`, `Login`, plus the sidebar/header (`DashboardLayout.jsx`) —
confirming: dark mode looks **pixel-identical to how it looks right
now** (this is the regression check — nothing in the dark theme should
move), light mode has readable contrast everywhere (body text, muted
text, badges, table rows, chart labels, map legend), the sidebar/header
stay navy in both themes, and the toggle state persists across a page
refresh and across navigation.

## Hard constraints

- **Do not modify any existing dark-theme value.** Every color the
  dashboard currently shows in dark mode must remain pixel-identical
  after this change — you're adding a parallel light theme, not editing
  the existing one.
- **Visual/theming only** — no changes to component logic, data
  fetching, state, routing, or the map/chart calculation logic. Only
  color values, CSS variables, and the new theme-toggle mechanism.
- **No renamed or removed CSS variables/classes** already in use.
- Keep the new toggle's default = dark on first visit for
  users with no saved preference.
- Keep diffs scoped and reviewable — don't reformat unrelated code.
